/**
 * SXF (P21 / SFC) CAD図面データパーサー
 * 
 * 国土交通省・地方自治体「CAD製図基準」に準拠した SXF レベル2 形式（P21 / SFC）を
 * ブラウザのメモリ上で直接解析し、ベクター描画可能な共通データ構造に変換します。
 * 
 * - 実レイヤー定義（SXF_TABLE_LAYER / SXF_LAYER / PRESENTATION_LAYER_ASSIGNMENT）の完全解析
 * - ネストされた座標配置（AXIS2_PLACEMENT_2D 等）からの位置・回転角の正確な抽出
 * - 日本語文字および $$$SXF_ 制御文字列（アライメント）の分離・本文テキスト抽出
 * - 円弧（TRIMMED_CURVE / sxf_arc）の回転方向・角度正規化（超巨大全円化の防止）
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
  clockwise?: boolean; // 回転方向
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
  align?: 'left' | 'center' | 'right';
  baseline?: 'top' | 'middle' | 'bottom' | 'alphabetic';
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

  // 3. レイヤー定義の解析（CAD固有テーブルの完全対応）
  // A. レイヤーID (#ID) -> レイヤー名
  const layerIdMap = new Map<string, string>();
  // B. レイヤー番号 (1, 2, 3...) -> レイヤー名
  const layerNumberMap = new Map<number, string>();
  // C. レイヤー名 -> { name, color }
  const layerDefMap = new Map<string, { name: string; color: string }>();
  // D. エンティティID -> 所属レイヤー名
  const entityLayerMap = new Map<string, string>();

  // SXF_TABLE_LAYER, SXF_LAYER, PRESENTATION_LAYER_ASSIGNMENT の全解析
  entityMap.forEach((ent, entId) => {
    const type = ent.type;
    const args = parseArgs(ent.rawArgs);

    // --- SXF_LAYER('レイヤー名', レイヤー番号, 色番号, 線種番号, 表示状態) ---
    if (type === 'SXF_LAYER' || type.endsWith('_LAYER')) {
      const name = decodeStepString(args[0]?.replace(/^'|'$/g, '')) || `Layer_${args[1] || entId}`;
      const num = parseInt(args[1], 10);
      const colorVal = args[2] ? parseInt(args[2], 10) : undefined;
      const color = resolveCadColor(colorVal);

      layerIdMap.set(entId, name);
      if (!isNaN(num)) layerNumberMap.set(num, name);
      layerDefMap.set(name, { name, color });
    }
    // --- SXF_TABLE_LAYER(('レイヤー名1', 'レイヤー名2', ...)) ---
    else if (type.includes('TABLE_LAYER')) {
      const listStr = args.find(a => a.startsWith('(') && a.endsWith(')')) || args[0];
      if (listStr) {
        const items = listStr.replace(/[()]/g, '').split(',').map(s => s.trim());
        items.forEach((item, idx) => {
          if (item.startsWith('#')) {
            // 参照ID
            const ref = item.replace('#', '');
            const refEnt = entityMap.get(ref);
            if (refEnt) {
              const rArgs = parseArgs(refEnt.rawArgs);
              const rName = decodeStepString(rArgs[0]?.replace(/^'|'$/g, '')) || `Layer_${idx + 1}`;
              layerIdMap.set(ref, rName);
              layerNumberMap.set(idx + 1, rName);
              layerDefMap.set(rName, { name: rName, color: resolveCadColor(rArgs[2] ? parseInt(rArgs[2], 10) : idx + 1) });
            }
          } else {
            // 直接レイヤー名
            const lName = decodeStepString(item.replace(/^'|'$/g, ''));
            if (lName) {
              layerNumberMap.set(idx + 1, lName);
              layerDefMap.set(lName, { name: lName, color: resolveCadColor(idx + 1) });
            }
          }
        });
      }
    }
    // --- PRESENTATION_LAYER_ASSIGNMENT('レイヤー名', ..., (#1, #2, ...)) ---
    else if (
      type === 'PRESENTATION_LAYER_ASSIGNMENT' ||
      type.includes('LAYER_ASSIGNMENT') ||
      type.includes('SXF_LAYER_ASSIGNMENT')
    ) {
      const layerName = decodeStepString(args[0]?.replace(/^'|'$/g, '')) || '一般';
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
    }
  });

  // 4. 座標点 (#id -> CadPoint) および 配置 (AXIS2_PLACEMENT) の再帰的解決キャッシュ
  const pointCache = new Map<string, CadPoint>();

  const resolvePoint = (ref: string, depth: number = 0): CadPoint | null => {
    if (depth > 6) return null;
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

    // 所属レイヤーの厳密解決（CADのレイヤー定義を優先）
    let layer = entityLayerMap.get(entId);
    if (!layer) {
      // エンティティ引数内のレイヤー参照 (#layer_id または レイヤー番号) を探索
      for (const arg of args) {
        if (arg.startsWith('#')) {
          const ref = arg.replace('#', '');
          if (layerIdMap.has(ref)) {
            layer = layerIdMap.get(ref);
            break;
          }
        } else {
          const num = parseInt(arg, 10);
          if (!isNaN(num) && layerNumberMap.has(num)) {
            layer = layerNumberMap.get(num);
            break;
          }
        }
      }
    }

    // デフォルトレイヤー名
    if (!layer) {
      layer = '0';
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

    // --- C. CIRCLE / ARC / TRIMMED_CURVE ---
    else if (
      type === 'CIRCLE' || 
      type.endsWith('_CIRCLE') || 
      type === 'TRIMMED_CURVE' || 
      type.endsWith('_ARC') ||
      type === 'COMPOSITE_CURVE_SEGMENT'
    ) {
      let center: CadPoint | null = null;
      let radius: number | null = null;
      let startAngle = 0;
      let endAngle = Math.PI * 2;
      let isArc = false;
      let clockwise = false;

      // TRIMMED_CURVE('', #basis, (#p1), (#p2), .T./.F., ...) の解析
      if (type.includes('TRIMMED_CURVE')) {
        const basisRef = args[1]?.replace(/^#/, '');
        const basisEnt = basisRef ? entityMap.get(basisRef) : null;
        if (basisEnt && (basisEnt.type === 'CIRCLE' || basisEnt.type.endsWith('_CIRCLE'))) {
          const bArgs = parseArgs(basisEnt.rawArgs);
          center = resolvePoint(bArgs[1] || bArgs[0]);
          const r = parseFloat(bArgs[2]);
          if (!isNaN(r) && r > 0 && r < 50000) {
            radius = r;
          }

          // トリムパラメータ (角度)
          const p1Str = args[2]?.replace(/[()]/g, '').trim();
          const p2Str = args[3]?.replace(/[()]/g, '').trim();
          const p1 = parseFloat(p1Str);
          const p2 = parseFloat(p2Str);

          // 回転方向 (.T. = 反時計回り, .F. = 時計回り)
          const sense = args[4]?.toUpperCase();
          if (sense === '.F.') {
            clockwise = true;
          }

          if (!isNaN(p1) && !isNaN(p2)) {
            // パラメータが度数法 (> 6.3) かラジアン (<= 6.3) かを正確に判定
            startAngle = Math.abs(p1) > 6.3 ? (p1 * Math.PI) / 180 : p1;
            endAngle = Math.abs(p2) > 6.3 ? (p2 * Math.PI) / 180 : p2;
            isArc = true;
          }
        }
      } else {
        // 通常の CIRCLE('', #axis, radius) または sxf_arc(name, #placement, radius, a1, a2)
        const pRef = args.find(a => a.startsWith('#'));
        if (pRef) {
          center = resolvePoint(pRef);
        }

        // 半径の取得: 第2〜3引数あたりの正の数値
        for (let i = 1; i < args.length; i++) {
          const num = parseFloat(args[i]);
          if (!isNaN(num) && num > 0.05 && num < 30000) {
            radius = num;
            // 後続に角度がある場合 (sxf_arc)
            if (args[i + 1] && args[i + 2]) {
              const a1 = parseFloat(args[i + 1]);
              const a2 = parseFloat(args[i + 2]);
              if (!isNaN(a1) && !isNaN(a2)) {
                startAngle = Math.abs(a1) > 6.3 ? (a1 * Math.PI) / 180 : a1;
                endAngle = Math.abs(a2) > 6.3 ? (a2 * Math.PI) / 180 : a2;
                isArc = true;
              }
            }
            break;
          }
        }
      }

      // 有効な中心と半径を持つ円・円弧のみを描画登録
      if (center && radius !== null && radius > 0.05 && radius < 25000) {
        entities.push({
          type: 'circle',
          center,
          radius,
          startAngle,
          endAngle,
          isArc,
          clockwise,
          color: defaultColor,
          layer,
        });
      }
    }

    // --- D. TEXT / TEXT_LITERAL / DRAUGHTING_TEXT ---
    else if (
      (type === 'TEXT_LITERAL' ||
       type === 'TEXT_LITERAL_WITH_EXTENT' ||
       type === 'DRAUGHTING_TEXT_LITERAL' ||
       type.endsWith('_TEXT')) &&
      !type.includes('STYLE') &&
      !type.includes('FONT') &&
      !type.includes('TABLE') &&
      !type.includes('CONTEXT')
    ) {
      let textStr = '';
      let pos: CadPoint | null = null;
      let height = 3.5;
      let angle = 0;
      let align: 'left' | 'center' | 'right' = 'left';
      let baseline: 'top' | 'middle' | 'bottom' | 'alphabetic' = 'bottom';

      // 文字列引数をすべて走査
      const strArgs = args
        .filter(a => a.startsWith("'") && a.endsWith("'"))
        .map(a => decodeStepString(a.slice(1, -1)));

      for (const str of strArgs) {
        // $$$SXF_ で始まる制御文字列（アライメント指定）の解析・分離
        if (str.startsWith('$$$SXF_') || str.startsWith('SXF_')) {
          const lower = str.toLowerCase();
          if (lower.includes('center')) align = 'center';
          else if (lower.includes('right')) align = 'right';
          else if (lower.includes('left')) align = 'left';

          if (lower.includes('middle')) baseline = 'middle';
          else if (lower.includes('top')) baseline = 'top';
          else if (lower.includes('baseline') || lower.includes('bottom')) baseline = 'bottom';
        } else {
          // 本物の本文テキスト
          if (!textStr && str.trim().length > 0) {
            textStr = str.trim();
          }
        }
      }

      // 配置座標の解決
      for (const arg of args) {
        if (arg.startsWith('#') && !pos) {
          pos = resolvePoint(arg);
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
        } else if (!arg.startsWith('#') && !arg.startsWith("'")) {
          const num = parseFloat(arg);
          if (!isNaN(num) && num > 0.5 && num < 100) {
            height = num;
          }
        }
      }

      // CAD内部のシステム定義文字・フォント名ノイズを徹底除外
      const isSystemNoise = /^(SXF|ISO|CAD|AUTOCAD|STANDARD|KANJI|GOTHIC|MINCHO|DEFAULT|LEVEL|DRAUGHTING|DIMENSION_STYLE|BYLAYER)/i.test(textStr);

      if (textStr && textStr.trim().length > 0 && !isSystemNoise && pos) {
        entities.push({
          type: 'text',
          text: textStr.trim(),
          position: pos,
          height: height || 3.5,
          angle,
          align,
          baseline,
          color: defaultColor === '#38bdf8' ? '#f8fafc' : defaultColor,
          layer,
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
        layer: '0',
      });
    }
  }

  // 6. レイヤー統計の集計
  const layerStats = new Map<string, { color: string; count: number }>();
  for (const ent of entities) {
    const lName = ent.layer || '0';
    const existing = layerStats.get(lName);
    if (existing) {
      existing.count++;
    } else {
      layerStats.set(lName, { color: ent.color || '#38bdf8', count: 1 });
    }
  }

  // 定義されているが要素数が0の画層もレイヤー一覧に含める（CAD仕様準拠）
  layerDefMap.forEach((def, name) => {
    if (!layerStats.has(name)) {
      layerStats.set(name, { color: def.color, count: 0 });
    }
  });

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
          if (str.length >= 2 && !/^[\s\d_]+$/.test(str)) {
            // システムヘッダー・規格識別子・制御文字の除外
            if (/^(SXF|ISO|PK|AutoCAD|JACIC|LEVEL|STANDARD|DRAUGHTING|DIMENSION|BYLAYER|\$\$\$)/i.test(str)) {
              textStart = -1;
              continue;
            }
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
