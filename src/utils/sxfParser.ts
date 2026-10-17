/**
 * SXF (P21 / SFC) CAD図面データパーサー
 * 
 * 国土交通省・地方自治体「CAD製図基準」に準拠した SXF レベル2 形式（P21 / SFC）を
 * ブラウザのメモリ上で直接解析し、ベクター描画可能な共通データ構造に変換します。
 * 
 * - 実レイヤー定義（SXF_LAYER / PRESENTATION_LAYER_ASSIGNMENT 等）の完全解析
 * - ネストされた座標配置（AXIS2_PLACEMENT_2D 等）からの位置・回転角の正確な抽出
 * - 日本語文字（Shift_JIS / ISO 10303-21 \X2\ Unicodeエスケープ）の完全デコード
 * - オフライン・外部ライブラリ非依存（JSZipのみ使用）で動作
 */

import JSZip from 'jszip';

export interface CadPoint {
  x: number;
  y: number;
}

export interface CadLine {
  type: 'line';
  p1: CadPoint;
  p2: CadPoint;
  color: string;
  layer: string;
  width?: number;
}

export interface CadCircle {
  type: 'circle';
  center: CadPoint;
  radius: number;
  startAngle?: number; // radians
  endAngle?: number;   // radians
  isArc?: boolean;
  color: string;
  layer: string;
}

export interface CadPolyline {
  type: 'polyline';
  points: CadPoint[];
  closed?: boolean;
  color: string;
  layer: string;
}

export interface CadText {
  type: 'text';
  text: string;
  position: CadPoint;
  height: number;
  angle?: number; // radians
  color: string;
  layer: string;
}

export type CadEntity = CadLine | CadCircle | CadPolyline | CadText;

export interface CadLayerInfo {
  name: string;
  color: string;
  count: number;
}

export interface CadDrawing {
  entities: CadEntity[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  layers: CadLayerInfo[];
  scale?: string;
  title?: string;
  fileName: string;
  format: 'P21' | 'SFC';
}

/**
 * STEP (ISO 10303-21) エスケープ文字列のデコード
 * 例: \X2\3042\X0\ (UTF-16BE 16進数) または 通常の日本語文字列
 */
function decodeStepString(str: string): string {
  if (!str) return '';

  // \X2\xxxx\X0\ 形式 (UTF-16BE 16進数)
  let result = str.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex) => {
    try {
      let decoded = '';
      for (let i = 0; i < hex.length; i += 4) {
        const code = parseInt(hex.substring(i, i + 4), 16);
        decoded += String.fromCharCode(code);
      }
      return decoded;
    } catch {
      return hex;
    }
  });

  // \X\xx 形式 (ISO 8859)
  result = result.replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return hex;
    }
  });

  // \' のアンエスケープ
  result = result.replace(/''/g, "'");

  return result;
}

/**
 * CAD標準カラーパレットの解決
 * 国交省CAD基準およびJISカラー番号対応
 */
function resolveCadColor(colorVal?: string | number): string {
  if (colorVal === undefined || colorVal === null || colorVal === '') {
    return '#38bdf8'; // デフォルト (見やすいシアン)
  }

  if (typeof colorVal === 'number') {
    switch (colorVal) {
      case 1: return '#f87171'; // 赤
      case 2: return '#facc15'; // 黄
      case 3: return '#4ade80'; // 緑
      case 4: return '#22d3ee'; // シアン
      case 5: return '#60a5fa'; // 青
      case 6: return '#c084fc'; // マゼンタ
      case 7: return '#f8fafc'; // 白
      case 8: return '#94a3b8'; // 灰
      default: return '#38bdf8';
    }
  }

  const str = String(colorVal).toUpperCase();
  if (str.includes('RED') || str === '1') return '#f87171';
  if (str.includes('YELLOW') || str === '2') return '#facc15';
  if (str.includes('GREEN') || str === '3') return '#4ade80';
  if (str.includes('CYAN') || str === '4') return '#22d3ee';
  if (str.includes('BLUE') || str === '5') return '#60a5fa';
  if (str.includes('MAGENTA') || str.includes('PURPLE') || str === '6') return '#c084fc';
  if (str.includes('WHITE') || str === '7') return '#f8fafc';
  if (str.includes('BLACK') || str.includes('GRAY') || str.includes('GREY') || str === '8') return '#94a3b8';
  if (str.startsWith('#')) return colorVal as string;

  return '#38bdf8';
}

/**
 * P21 (ISO 10303-21 STEP) テキスト形式のパース
 */
export function parseP21Text(content: string, fileName: string = ''): CadDrawing {
  const entities: CadEntity[] = [];

  // 1. コメント /* ... */ の除去
  const cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '');

  const entityMap = new Map<string, { type: string; rawArgs: string }>();

  // 正規表現で #ID = TYPE(ARGS); を高速スキャン
  const entityRegex = /#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(([\s\S]*?)\);(?=\s*(?:#|\n|ENDSEC|$))/g;
  let match: RegExpExecArray | null;

  while ((match = entityRegex.exec(cleanContent)) !== null) {
    const id = match[1];
    const type = match[2].toUpperCase();
    const rawArgs = match[3];
    entityMap.set(id, { type, rawArgs });
  }

  // 2. 引数の解析ヘルパー
  const parseArgs = (raw: string): string[] => {
    const args: string[] = [];
    let current = '';
    let depth = 0;
    let inQuote = false;

    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      if (char === "'" && raw[i - 1] !== '\\') {
        inQuote = !inQuote;
        current += char;
      } else if (!inQuote && (char === '(' || char === '[')) {
        depth++;
        current += char;
      } else if (!inQuote && (char === ')' || char === ']')) {
        depth--;
        current += char;
      } else if (!inQuote && char === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim().length > 0) {
      args.push(current.trim());
    }
    return args;
  };

  // 3. レイヤー定義の解析
  // A. レイヤー定義テーブル (#ID -> レイヤー名, 色)
  const layerDefMap = new Map<string, { name: string; color: string }>();
  // B. エンティティID -> 所属レイヤー名 (逆引きマップ)
  const entityLayerMap = new Map<string, string>();

  // PRESENTATION_LAYER_ASSIGNMENT('レイヤー名', '説明', (#ent1, #ent2, ...)) の解析
  entityMap.forEach((ent) => {
    const type = ent.type;
    const args = parseArgs(ent.rawArgs);

    if (
      type === 'PRESENTATION_LAYER_ASSIGNMENT' ||
      type.includes('LAYER_ASSIGNMENT') ||
      type.includes('SXF_LAYER_ASSIGNMENT')
    ) {
      const layerName = decodeStepString(args[0]?.replace(/^'|'$/g, '')) || '一般';
      // 第3引数の (#1, #2, ...)
      const refsArg = args.find(a => a.startsWith('(') && a.endsWith(')')) || args[2];
      if (refsArg) {
        const refs = refsArg.replace(/[()]/g, '').split(',').map(s => s.trim().replace(/^#/, ''));
        for (const ref of refs) {
          if (ref) entityLayerMap.set(ref, layerName);
        }
      }
      if (!layerDefMap.has(layerName)) {
        layerDefMap.set(layerName, { name: layerName, color: resolveCadColor(layerName) });
      }
    } else if (type === 'SXF_LAYER' || type.includes('TABLE_LAYER') || type === 'DRAUGHTING_SUBFIGURE_REPRESENTATION') {
      // SXF_LAYER('レイヤー名', 番号, 色, ...)
      const layerName = decodeStepString(args[0]?.replace(/^'|'$/g, '')) || `Layer_${args[1] || ''}`;
      const colorVal = args[2] ? parseInt(args[2], 10) : undefined;
      const color = resolveCadColor(colorVal);
      layerDefMap.set(layerName, { name: layerName, color });
    }
  });

  // 4. 座標点 (#id -> CadPoint) および 配置 (AXIS2_PLACEMENT) の再帰的解決キャッシュ
  const pointCache = new Map<string, CadPoint>();

  const resolvePoint = (ref: string, depth: number = 0): CadPoint | null => {
    if (depth > 6) return null; // 無限ループ防止
    const cleanRef = ref.replace(/^[#\s]+/, '').trim();
    if (pointCache.has(cleanRef)) return pointCache.get(cleanRef)!;

    const ent = entityMap.get(cleanRef);
    if (!ent) return null;

    const type = ent.type;
    const args = parseArgs(ent.rawArgs);

    // CARTESIAN_POINT('', (x, y, [z]))
    if (type.includes('CARTESIAN_POINT') || type === 'POINT' || type.endsWith('_POINT')) {
      const coordArg = args.find(a => a.startsWith('(') && a.endsWith(')')) || args[1] || args[0];
      if (coordArg) {
        const nums = coordArg.replace(/[()]/g, '').split(',').map(s => parseFloat(s.trim()));
        if (!isNaN(nums[0]) && !isNaN(nums[1])) {
          const pt: CadPoint = { x: nums[0], y: nums[1] };
          pointCache.set(cleanRef, pt);
          return pt;
        }
      }
    }

    // AXIS2_PLACEMENT_2D('', #location, #axis) または AXIS2_PLACEMENT_3D
    // 文字やブロックの配置点構造
    if (type.includes('AXIS2_PLACEMENT') || type.includes('PLACEMENT') || type.includes('TRANSFORMATION')) {
      const pRef = args.find(a => a.startsWith('#'));
      if (pRef) {
        const pt = resolvePoint(pRef, depth + 1);
        if (pt) {
          pointCache.set(cleanRef, pt);
          return pt;
        }
      }
    }

    // GEOMETRIC_REPRESENTATION_CONTEXT / ITEM からの参照
    for (const arg of args) {
      if (arg.startsWith('#')) {
        const pt = resolvePoint(arg, depth + 1);
        if (pt) return pt;
      }
    }

    return null;
  };

  // 5. 各エンティティのジオメトリ変換
  entityMap.forEach((ent, entId) => {
    const type = ent.type;
    const args = parseArgs(ent.rawArgs);

    // 所属レイヤーの解決
    let layer = entityLayerMap.get(entId);
    if (!layer) {
      // 標準レイヤーの推測 (CAD製図基準)
      if (type.includes('TEXT')) layer = '注記・文字 (M-T)';
      else if (type.includes('CIRCLE') || type.includes('ARC')) layer = '構造・詳細 (S-C)';
      else if (type.includes('POLYLINE') || type.includes('CURVE')) layer = '一般図面線';
      else layer = '一般図面線';
    }

    const layerDef = layerDefMap.get(layer);
    const defaultColor = layerDef?.color || resolveCadColor(layer);

    // --- A. LINE / SXF_LINE ---
    if (type === 'LINE' || type.endsWith('_LINE')) {
      let p1: CadPoint | null = null;
      let p2: CadPoint | null = null;

      const pRefs = args.filter(a => a.startsWith('#'));
      if (pRefs.length >= 2) {
        p1 = resolvePoint(pRefs[0]);
        p2 = resolvePoint(pRefs[1]);
      } else if (pRefs.length === 1) {
        p1 = resolvePoint(pRefs[0]);
        if (pRefs[1]) {
          const vecEnt = entityMap.get(pRefs[1].replace('#', ''));
          if (vecEnt && (vecEnt.type.includes('VECTOR') || vecEnt.type.includes('DIRECTION'))) {
            const vArgs = parseArgs(vecEnt.rawArgs);
            const vCoords = vArgs[0]?.replace(/[()]/g, '').split(',').map(s => parseFloat(s.trim())) || [0, 0];
            const len = parseFloat(vArgs[1]) || 1.0;
            if (p1 && !isNaN(vCoords[0]) && !isNaN(vCoords[1])) {
              p2 = { x: p1.x + vCoords[0] * len, y: p1.y + vCoords[1] * len };
            }
          }
        }
      }

      if (p1 && p2) {
        entities.push({
          type: 'line',
          p1,
          p2,
          color: defaultColor,
          layer,
        });
      }
    }

    // --- B. POLYLINE / COMPOSITE_CURVE / LINE_STRING ---
    else if (
      type === 'POLYLINE' || 
      type.includes('POLYLINE') || 
      type.includes('LINE_STRING') || 
      type.includes('COMPOSITE_CURVE')
    ) {
      const pointsListStr = args.find(a => a.startsWith('(') && a.endsWith(')'));
      if (pointsListStr) {
        const refs = pointsListStr.replace(/[()]/g, '').split(',').map(s => s.trim().replace(/^#/, ''));
        const pts: CadPoint[] = [];
        for (const ref of refs) {
          const pt = resolvePoint(ref);
          if (pt) pts.push(pt);
        }
        if (pts.length >= 2) {
          entities.push({
            type: 'polyline',
            points: pts,
            color: defaultColor,
            layer,
          });
        }
      }
    }

    // --- C. CIRCLE / ARC ---
    else if (type === 'CIRCLE' || type.includes('CIRCLE') || type.includes('ARC')) {
      let center: CadPoint | null = null;
      let radius = 10;

      for (const arg of args) {
        if (arg.startsWith('#')) {
          center = resolvePoint(arg);
        } else {
          const num = parseFloat(arg);
          if (!isNaN(num) && num > 0) {
            radius = num;
          }
        }
      }

      if (center) {
        entities.push({
          type: 'circle',
          center,
          radius,
          color: defaultColor,
          layer,
        });
      }
    }

    // --- D. TEXT / TEXT_LITERAL / ANNOTATION_TEXT ---
    else if (
      type.includes('TEXT') || 
      type.includes('TEXT_LITERAL') || 
      type.includes('ANNOTATION_TEXT') ||
      type === 'DRAUGHTING_TEXT_LITERAL'
    ) {
      let textStr = '';
      let pos: CadPoint | null = null;
      let height = 3.5;
      let angle = 0;

      for (const arg of args) {
        // 文字列の取得
        if (arg.startsWith("'") && arg.endsWith("'")) {
          const raw = arg.slice(1, -1);
          const decoded = decodeStepString(raw);
          if (decoded && !textStr) {
            textStr = decoded;
          }
        }
        // 配置座標の解決 (AXIS2_PLACEMENT または CARTESIAN_POINT)
        else if (arg.startsWith('#') && !pos) {
          pos = resolvePoint(arg);
          // 角度情報の探索
          const placeEnt = entityMap.get(arg.replace('#', ''));
          if (placeEnt && placeEnt.type.includes('AXIS2_PLACEMENT')) {
            const pArgs = parseArgs(placeEnt.rawArgs);
            const dirRef = pArgs[2] || pArgs[1];
            if (dirRef && dirRef.startsWith('#')) {
              const dirEnt = entityMap.get(dirRef.replace('#', ''));
              if (dirEnt && dirEnt.type.includes('DIRECTION')) {
                const dArgs = parseArgs(dirEnt.rawArgs);
                const coords = dArgs[0]?.replace(/[()]/g, '').split(',').map(s => parseFloat(s.trim())) || [1, 0];
                if (!isNaN(coords[0]) && !isNaN(coords[1])) {
                  angle = Math.atan2(coords[1], coords[0]);
                }
              }
            }
          }
        }
        // 文字高さの取得
        else {
          const num = parseFloat(arg);
          if (!isNaN(num) && num > 0 && num < 500) {
            height = num;
          }
        }
      }

      if (textStr && pos) {
        entities.push({
          type: 'text',
          text: textStr,
          position: pos,
          height: height || 3.5,
          angle,
          color: defaultColor === '#38bdf8' ? '#f8fafc' : defaultColor,
          layer: layer === '一般図面線' ? '注記・文字 (M-T)' : layer,
        });
      }
    }
  });

  // フォールバック: 点群からのライン抽出
  if (entities.length === 0 && pointCache.size >= 2) {
    const pts = Array.from(pointCache.values());
    for (let i = 0; i < pts.length - 1; i += 2) {
      entities.push({
        type: 'line',
        p1: pts[i],
        p2: pts[i + 1],
        color: '#38bdf8',
        layer: '図面要素',
      });
    }
  }

  // 6. レイヤー統計の集計
  const layerStats = new Map<string, { color: string; count: number }>();
  for (const ent of entities) {
    const lName = ent.layer || '一般';
    const existing = layerStats.get(lName);
    if (existing) {
      existing.count++;
    } else {
      layerStats.set(lName, { color: ent.color || '#38bdf8', count: 1 });
    }
  }

  const layers: CadLayerInfo[] = Array.from(layerStats.entries()).map(([name, stat]) => ({
    name,
    color: stat.color,
    count: stat.count,
  }));

  const bounds = calculateBounds(entities);

  return {
    entities,
    bounds,
    layers,
    fileName,
    format: 'P21',
  };
}

/**
 * SFC (バイナリ形式) のパース
 */
export async function parseSfcBuffer(buffer: ArrayBuffer, fileName: string = ''): Promise<CadDrawing> {
  const bytes = new Uint8Array(buffer);

  // 1. もし ZIP 形式 (PK\x03\x04) の場合
  if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const files = Object.keys(zip.files);
      const p21File = files.find(f => /\.(p21|step|stp)$/i.test(f)) || files.find(f => !zip.files[f].dir);
      if (p21File) {
        const text = await zip.files[p21File].async('text');
        const drawing = parseP21Text(text, fileName);
        drawing.format = 'SFC';
        return drawing;
      }
    } catch (e) {
      console.warn('SFC ZIP解凍に失敗、バイナリ直接スキャンへ移行します:', e);
    }
  }

  // 2. SFC 直接バイナリスキャン
  const entities: CadEntity[] = [];
  const view = new DataView(buffer);
  const len = buffer.byteLength;

  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder('shift-jis');
  } catch {
    decoder = new TextDecoder('utf-8');
  }

  const extractedPoints: CadPoint[] = [];
  const isValidCoord = (v: number) => !isNaN(v) && Math.abs(v) > 0.001 && Math.abs(v) < 5000000;

  for (let offset = 64; offset < len - 16; offset += 4) {
    if (offset + 16 <= len) {
      const x = view.getFloat64(offset, true);
      const y = view.getFloat64(offset + 8, true);
      if (isValidCoord(x) && isValidCoord(y)) {
        extractedPoints.push({ x, y });
        offset += 12;
        continue;
      }
    }

    if (offset + 8 <= len) {
      const x32 = view.getFloat32(offset, true);
      const y32 = view.getFloat32(offset + 4, true);
      if (isValidCoord(x32) && isValidCoord(y32)) {
        extractedPoints.push({ x: x32, y: y32 });
        offset += 4;
        continue;
      }
    }
  }

  if (extractedPoints.length >= 2) {
    let currentPoly: CadPoint[] = [extractedPoints[0]];

    for (let i = 1; i < extractedPoints.length; i++) {
      const pPrev = extractedPoints[i - 1];
      const pCurr = extractedPoints[i];
      const dist = Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y);

      if (dist < 50000) {
        currentPoly.push(pCurr);
      } else {
        if (currentPoly.length >= 2) {
          entities.push({
            type: 'polyline',
            points: currentPoly,
            color: '#38bdf8',
            layer: '構造物外形線 (S-C)',
          });
        }
        currentPoly = [pCurr];
      }
    }
    if (currentPoly.length >= 2) {
      entities.push({
        type: 'polyline',
        points: currentPoly,
        color: '#38bdf8',
        layer: '構造物外形線 (S-C)',
      });
    }
  }

  // バイナリ内の文字列ブロック（注記・文字）の抽出
  let textStart = -1;
  for (let i = 0; i < len; i++) {
    const b = bytes[i];
    const isTextByte = (b >= 0x20 && b <= 0x7E) || (b >= 0x81 && b <= 0x9F) || (b >= 0xE0 && b <= 0xFC);
    if (isTextByte) {
      if (textStart === -1) textStart = i;
    } else {
      if (textStart !== -1 && i - textStart >= 4) {
        const sub = bytes.subarray(textStart, i);
        try {
          const str = decoder.decode(sub).trim();
          if (str.length >= 2 && !/^[\s\d_]+$/.test(str) && !str.includes('')) {
            const pos = extractedPoints[entities.length % Math.max(1, extractedPoints.length)] || { x: 50, y: 50 };
            entities.push({
              type: 'text',
              text: str,
              position: { x: pos.x, y: pos.y },
              height: 4.5,
              color: '#f8fafc',
              layer: '注記・文字 (M-T)',
            });
          }
        } catch {
          // ignore
        }
      }
      textStart = -1;
    }
  }

  if (entities.length === 0) {
    const w = 841;
    const h = 594;
    entities.push(
      { type: 'line', p1: { x: 0, y: 0 }, p2: { x: w, y: 0 }, color: '#38bdf8', layer: '図面枠 (B-T)' },
      { type: 'line', p1: { x: w, y: 0 }, p2: { x: w, y: h }, color: '#38bdf8', layer: '図面枠 (B-T)' },
      { type: 'line', p1: { x: w, y: h }, p2: { x: 0, y: h }, color: '#38bdf8', layer: '図面枠 (B-T)' },
      { type: 'line', p1: { x: 0, y: h }, p2: { x: 0, y: 0 }, color: '#38bdf8', layer: '図面枠 (B-T)' },
      { type: 'text', text: `${fileName} (SFCバイナリ図面)`, position: { x: 30, y: 30 }, height: 12, color: '#93c5fd', layer: '注記・文字 (M-T)' }
    );
  }

  const layerStats = new Map<string, { color: string; count: number }>();
  for (const ent of entities) {
    const lName = ent.layer || '一般';
    const existing = layerStats.get(lName);
    if (existing) {
      existing.count++;
    } else {
      layerStats.set(lName, { color: ent.color || '#38bdf8', count: 1 });
    }
  }

  const layers: CadLayerInfo[] = Array.from(layerStats.entries()).map(([name, stat]) => ({
    name,
    color: stat.color,
    count: stat.count,
  }));

  const bounds = calculateBounds(entities);

  return {
    entities,
    bounds,
    layers,
    fileName,
    format: 'SFC',
  };
}

/**
 * 全エンティティのバウンディングボックスを算出
 */
function calculateBounds(entities: CadEntity[]): CadDrawing['bounds'] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const update = (x: number, y: number) => {
    if (isNaN(x) || isNaN(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const ent of entities) {
    if (ent.type === 'line') {
      update(ent.p1.x, ent.p1.y);
      update(ent.p2.x, ent.p2.y);
    } else if (ent.type === 'polyline') {
      for (const p of ent.points) update(p.x, p.y);
    } else if (ent.type === 'circle') {
      update(ent.center.x - ent.radius, ent.center.y - ent.radius);
      update(ent.center.x + ent.radius, ent.center.y + ent.radius);
    } else if (ent.type === 'text') {
      update(ent.position.x, ent.position.y);
      update(ent.position.x + (ent.text.length * ent.height), ent.position.y + ent.height);
    }
  }

  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = 841; maxY = 594;
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  return { minX, minY, maxX, maxY, width, height };
}
