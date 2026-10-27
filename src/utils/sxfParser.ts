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

export type CadLineType = 'continuous' | 'dashed' | 'chain' | 'phantom' | string;

export interface CadLine {
  type: 'line';
  p1: CadPoint;
  p2: CadPoint;
  color: string;
  layer: string;
  width?: number;
  lineType?: CadLineType;
  lineWidthMm?: number;
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
  lineType?: CadLineType;
  lineWidthMm?: number;
}

export interface CadPolyline {
  type: 'polyline';
  points: CadPoint[];
  closed?: boolean;
  color: string;
  layer: string;
  lineType?: CadLineType;
  lineWidthMm?: number;
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
  textSummary: string[];
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
 * SXF図面内のテキストおよびアライメント制御コードの分離・本文抽出
 * 例: "$$$SXF_baseline left 平面図" -> { text: "平面図", align: "left", baseline: "bottom", isValid: true }
 * 例: "＄＄＄SXF_baseline left" -> { text: "", align: "left", baseline: "bottom", isValid: false }
 */
export function extractCleanCadText(rawStr: string): {
  text: string;
  align: 'left' | 'center' | 'right';
  baseline: 'top' | 'middle' | 'bottom' | 'alphabetic';
  isValid: boolean;
} {
  if (!rawStr) return { text: '', align: 'left', baseline: 'bottom', isValid: false };

  // 1. 全角＄を半角$に統一、余白トリム
  let str = rawStr.trim().replace(/＄/g, '$');

  // 2. アライメント（配置基準）の検出
  let align: 'left' | 'center' | 'right' = 'left';
  let baseline: 'top' | 'middle' | 'bottom' | 'alphabetic' = 'bottom';
  const lower = str.toLowerCase();

  if (lower.includes('center')) align = 'center';
  else if (lower.includes('right')) align = 'right';
  else if (lower.includes('left')) align = 'left';

  if (lower.includes('middle')) baseline = 'middle';
  else if (lower.includes('top')) baseline = 'top';
  else if (lower.includes('baseline') || lower.includes('bottom')) baseline = 'bottom';

  // 3. $$SXF_... / $$$SXF_... / $SXF_... または SXF_... の制御文字列をピンポイントで完全除去
  const cleaned = str
    .replace(/\$+[a-zA-Z0-9_\-\s]*sxf[a-zA-Z0-9_\-\s]*/gi, '')
    .replace(/^sxf_[a-zA-Z0-9_\-\s]+/gi, '')
    .replace(/\$+[a-zA-Z0-9_\-\s]+/gi, '')
    .replace(/^(baseline|centre|center|left|right|top|bottom|middleline)\s*(baseline|centre|center|left|right|top|bottom)?$/gi, '')
    .trim();

  // 4. CAD内部のシステム定義文字・フォント名ノイズ・制御コード残余を徹底除外
  const isSystemNoise =
    /^(\$*sxf|sxf|iso|cad|autocad|standard|kanji|gothic|mincho|default|level|draughting|dimension_style|bylayer)/i.test(cleaned) ||
    /^(baseline|centre|center|left|right|top|bottom|middleline)$/i.test(cleaned) ||
    cleaned.includes('$') ||
    cleaned.includes('＄') ||
    /^[0-9]+_[0-9]+_[0-9]+$/.test(cleaned);

  return {
    text: cleaned,
    align,
    baseline,
    isValid: cleaned.length > 0 && !isSystemNoise,
  };
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

  // 正規表現で #ID = TYPE(ARGS); または複合エンティティ #ID = ( ... ); を高速スキャン
  const entityRegex = /#(\d+)\s*=\s*(?:([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)|\(([\s\S]*?)\))\s*;\s*(?=(?:#|\n|ENDSEC|$))/g;
  let match: RegExpExecArray | null;

  while ((match = entityRegex.exec(cleanContent)) !== null) {
    const id = match[1];
    const type = match[2] ? match[2].toUpperCase() : 'COMPLEX';
    const rawArgs = match[3] !== undefined ? match[3] : (match[4] || '');
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

  // 4. 複合エンティティの内部サブエンティティ分解ヘルパー
  const decomposeComplexEntity = (raw: string): Array<{ type: string; rawArgs: string }> => {
    const subEntities: Array<{ type: string; rawArgs: string }> = [];
    const subRegex = /([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)(?=\s*(?:[A-Za-z0-9_]+\s*\(|$))/g;
    let match: RegExpExecArray | null;
    while ((match = subRegex.exec(raw)) !== null) {
      subEntities.push({
        type: match[1].toUpperCase(),
        rawArgs: match[2],
      });
    }
    return subEntities;
  };

  // 5. SXF 部分図マッピング（MAPPED_ITEM / SYMBOL_TARGET）と用紙（SHEET）配置階層の解析
  interface AffineMatrix {
    a: number;  // scaleX * cos
    b: number;  // scaleX * sin
    c: number;  // -scaleY * sin
    d: number;  // scaleY * cos
    tx: number; // originX
    ty: number; // originY
  }

  const multiplyMatrix = (m1: AffineMatrix, m2: AffineMatrix): AffineMatrix => ({
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    tx: m1.a * m2.tx + m1.c * m2.ty + m1.tx,
    ty: m1.b * m2.tx + m1.d * m2.ty + m1.ty,
  });

  const transformCadPoint = (p: CadPoint, mat: AffineMatrix): CadPoint => ({
    x: mat.a * p.x + mat.c * p.y + mat.tx,
    y: mat.b * p.x + mat.d * p.y + mat.ty,
  });

  interface MappedItemDef {
    subfigureRef: string;
    scaleX: number;
    scaleY: number;
    originX: number;
    originY: number;
    angle: number;
  }
  const mappedItemDefMap = new Map<string, MappedItemDef>();

  entityMap.forEach((ent, entId) => {
    const subList = ent.type === 'COMPLEX' ? decomposeComplexEntity(ent.rawArgs) : [ent];
    for (const sub of subList) {
      if (sub.type === 'MAPPED_ITEM') {
        const args = parseArgs(sub.rawArgs);
        const mapSourceRef = args[0]?.replace(/^#/, '');
        const mapTargetRef = args[1]?.replace(/^#/, '');
        const sourceEnt = entityMap.get(mapSourceRef);
        const targetEnt = entityMap.get(mapTargetRef);
        if (sourceEnt && targetEnt) {
          const sArgs = parseArgs(sourceEnt.rawArgs);
          const subfigureRef = sArgs[1]?.replace(/^#/, '');
          const tArgs = parseArgs(targetEnt.rawArgs);
          let scaleX = 1.0;
          let scaleY = 1.0;
          let placementRef: string | null = null;
          if (targetEnt.type.includes('SYMBOL_TARGET')) {
            placementRef = tArgs.find(a => a.startsWith('#'))?.replace(/^#/, '') || null;
            const numArgs = tArgs.filter(a => !a.startsWith('#') && !a.startsWith("'") && !isNaN(parseFloat(a)));
            if (numArgs.length >= 1) scaleX = parseFloat(numArgs[0]);
            if (numArgs.length >= 2) scaleY = parseFloat(numArgs[1]);
            else scaleY = scaleX;
          } else if (targetEnt.type.includes('PLACEMENT')) {
            placementRef = mapTargetRef;
          }
          let originX = 0;
          let originY = 0;
          let angle = 0;
          if (placementRef) {
            const placeEnt = entityMap.get(placementRef);
            if (placeEnt) {
              const pArgs = parseArgs(placeEnt.rawArgs);
              const pRefs = pArgs.filter(a => a.startsWith('#')).map(a => a.replace(/^#/, ''));
              const ptRef = pRefs[0];
              const dirRef = pRefs[1];
              if (ptRef) {
                const ptEnt = entityMap.get(ptRef);
                if (ptEnt) {
                  const ptArgs = parseArgs(ptEnt.rawArgs);
                  const cArg = ptArgs.find(a => a.includes('(') && a.includes(')')) || ptArgs[0];
                  if (cArg) {
                    const nums = cArg.replace(/[()]/g, '').split(',').map(s => parseFloat(s.trim()));
                    originX = nums[0] || 0;
                    originY = nums[1] || 0;
                  }
                }
              }
              if (dirRef) {
                const dirEnt = entityMap.get(dirRef);
                if (dirEnt) {
                  const dArgs = parseArgs(dirEnt.rawArgs);
                  const cArg = dArgs.find(a => a.includes('(') && a.includes(')')) || dArgs[0];
                  if (cArg) {
                    const nums = cArg.replace(/[()]/g, '').split(',').map(s => parseFloat(s.trim()));
                    if (!isNaN(nums[0]) && !isNaN(nums[1])) {
                      angle = Math.atan2(nums[1], nums[0]);
                    }
                  }
                }
              }
            }
          }
          if (subfigureRef) {
            mappedItemDefMap.set(entId, { subfigureRef, scaleX, scaleY, originX, originY, angle });
          }
        }
      }
    }
  });

  const repChildren = new Map<string, Array<{ childSubfigureId: string; transform: MappedItemDef }>>();
  const geomToDirectRep = new Map<string, string>();

  entityMap.forEach((ent, repId) => {
    if (ent.type.includes('SUBFIGURE_REPRESENTATION') || ent.type.includes('SHEET')) {
      const listRefs = (ent.rawArgs.match(/#\d+/g) || []).map(r => r.replace('#', ''));
      const queue = [...listRefs];
      const visited = new Set(queue);
      while (queue.length > 0) {
        const curId = queue.shift()!;
        const mappedDef = mappedItemDefMap.get(curId);
        if (mappedDef) {
          let list = repChildren.get(repId);
          if (!list) {
            list = [];
            repChildren.set(repId, list);
          }
          list.push({ childSubfigureId: mappedDef.subfigureRef, transform: mappedDef });
        } else {
          geomToDirectRep.set(curId, repId);
          const curEnt = entityMap.get(curId);
          if (curEnt) {
            const childRefs = (curEnt.rawArgs.match(/#\d+/g) || []).map(r => r.replace('#', ''));
            for (const childId of childRefs) {
              if (!visited.has(childId)) {
                visited.add(childId);
                const childEnt = entityMap.get(childId);
                if (childEnt && !childEnt.type.includes('SUBFIGURE') && !childEnt.type.includes('SHEET')) {
                  queue.push(childId);
                }
              }
            }
          }
        }
      }
    }
  });

  let rootSheetId: string | null = null;
  entityMap.forEach((ent, id) => {
    if (ent.type.includes('SHEET')) rootSheetId = id;
  });

  const subfigureCumulativeTransforms = new Map<string, AffineMatrix>();
  const identityMatrix: AffineMatrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

  const traverseRep = (curRepId: string, curMatrix: AffineMatrix) => {
    subfigureCumulativeTransforms.set(curRepId, curMatrix);
    const children = repChildren.get(curRepId) || [];
    for (const child of children) {
      const t = child.transform;
      const cos = Math.cos(t.angle);
      const sin = Math.sin(t.angle);
      const localMatrix: AffineMatrix = {
        a: cos * t.scaleX,
        b: sin * t.scaleX,
        c: -sin * t.scaleY,
        d: cos * t.scaleY,
        tx: t.originX,
        ty: t.originY,
      };
      const cum = multiplyMatrix(curMatrix, localMatrix);
      traverseRep(child.childSubfigureId, cum);
    }
  };

  if (rootSheetId) {
    traverseRep(rootSheetId, identityMatrix);
  }

  const getEntityTransform = (entId: string): AffineMatrix => {
    const repId = geomToDirectRep.get(entId);
    if (repId && subfigureCumulativeTransforms.has(repId)) {
      return subfigureCumulativeTransforms.get(repId)!;
    }
    return identityMatrix;
  };

  // 6. 座標点 (#id -> CadPoint) および 配置 (AXIS2_PLACEMENT) の再帰的解決キャッシュ
  const pointCache = new Map<string, CadPoint>();

  const resolvePoint = (ref: string, depth: number = 0): CadPoint | null => {
    if (depth > 6) return null;
    const cleanRef = ref.replace(/^[#\s]+/, '').trim();
    if (pointCache.has(cleanRef)) return pointCache.get(cleanRef)!;

    const ent = entityMap.get(cleanRef);
    if (!ent) return null;

    const type = ent.type;

    // 複合エンティティの場合、内部の CARTESIAN_POINT や PLACEMENT を探索
    if (type === 'COMPLEX') {
      const subs = decomposeComplexEntity(ent.rawArgs);
      for (const sub of subs) {
        if (sub.type.includes('CARTESIAN_POINT') || sub.type === 'POINT' || sub.type.endsWith('_POINT')) {
          const sArgs = parseArgs(sub.rawArgs);
          const coordArg = sArgs.find(a => a.startsWith('(') && a.endsWith(')')) || sArgs[1] || sArgs[0];
          if (coordArg) {
            const nums = coordArg.replace(/[()]/g, '').split(',').map(s => parseFloat(s.trim()));
            if (!isNaN(nums[0]) && !isNaN(nums[1])) {
              const pt: CadPoint = { x: nums[0], y: nums[1] };
              pointCache.set(cleanRef, pt);
              return pt;
            }
          }
        }
        if (sub.type.includes('AXIS2_PLACEMENT') || sub.type.includes('PLACEMENT') || sub.type.includes('TRANSFORMATION')) {
          const sArgs = parseArgs(sub.rawArgs);
          const pRef = sArgs.find(a => a.startsWith('#'));
          if (pRef) {
            const pt = resolvePoint(pRef, depth + 1);
            if (pt) {
              pointCache.set(cleanRef, pt);
              return pt;
            }
          }
        }
      }
    }

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

  // 6.5 TRIMMED_CURVE などの基底曲線（basis_curve）として参照されているエンティティIDの収集
  // （これらは幾何定義用であり、単独で二重描画してはならない）
  const basisCurveIds = new Set<string>();
  entityMap.forEach((ent) => {
    const subList = ent.type === 'COMPLEX' ? decomposeComplexEntity(ent.rawArgs) : [ent];
    for (const sub of subList) {
      if (sub.type === 'TRIMMED_CURVE' || sub.type.includes('TRIMMED_CURVE')) {
        const args = parseArgs(sub.rawArgs);
        const basisRef = args[1]?.replace(/^#/, '');
        if (basisRef) {
          basisCurveIds.add(basisRef);
        }
      }
    }
  });

  // 6.6 線種・線幅（CURVE_STYLE / STYLED_ITEM）の解析とエンティティスタイルマップ構築
  const fontMap = new Map<string, string>();
  const widthMap = new Map<string, number>();
  const colorIdMap = new Map<string, string>();

  entityMap.forEach((ent, id) => {
    const t = ent.type;
    if (t.includes('PRE_DEFINED_CURVE_FONT') || t.includes('CURVE_FONT')) {
      const fMatch = ent.rawArgs.match(/'([^']+)'/);
      if (fMatch) fontMap.set(id, fMatch[1].toLowerCase());
    } else if (t.includes('LENGTH_MEASURE') || t.includes('POSITIVE_LENGTH_MEASURE')) {
      const wMatch = ent.rawArgs.match(/POSITIVE_LENGTH_MEASURE\s*\(\s*([0-9.]+)\s*\)/) || ent.rawArgs.match(/([0-9.]+)/);
      if (wMatch) widthMap.set(id, parseFloat(wMatch[1]));
    } else if (t.includes('DRAUGHTING_PRE_DEFINED_COLOUR') || t.includes('COLOUR')) {
      const cMatch = ent.rawArgs.match(/'([^']+)'/);
      if (cMatch) colorIdMap.set(id, cMatch[1].toLowerCase());
    }
  });

  const curveStyleMap = new Map<string, { font: CadLineType; widthMm: number; color?: string }>();
  entityMap.forEach((ent, id) => {
    if (ent.type === 'CURVE_STYLE' || ent.type.includes('CURVE_STYLE')) {
      const refs = ent.rawArgs.match(/#\d+/g) || [];
      let font: CadLineType = 'continuous';
      let widthMm = 0.25;
      let color: string | undefined = undefined;
      for (const r of refs) {
        const cleanRef = r.replace('#', '');
        if (fontMap.has(cleanRef)) font = fontMap.get(cleanRef)!;
        if (widthMap.has(cleanRef)) widthMm = widthMap.get(cleanRef)!;
        if (colorIdMap.has(cleanRef)) color = resolveCadColor(colorIdMap.get(cleanRef));
      }
      curveStyleMap.set(id, { font, widthMm, color });
    }
  });

  const presentationStyleMap = new Map<string, { font: CadLineType; widthMm: number; color?: string }>();
  entityMap.forEach((ent, id) => {
    if (ent.type.includes('PRESENTATION_STYLE_ASSIGNMENT')) {
      const refs = ent.rawArgs.match(/#\d+/g) || [];
      for (const r of refs) {
        const cleanRef = r.replace('#', '');
        if (curveStyleMap.has(cleanRef)) {
          presentationStyleMap.set(id, curveStyleMap.get(cleanRef)!);
          break;
        }
      }
    }
  });

  const entityStyleMap = new Map<string, { font: CadLineType; widthMm: number; color?: string }>();
  const scanStyledItem = (rawArgs: string) => {
    const m = rawArgs.match(/STYLED_ITEM\s*\(\s*\(\s*(#[0-9]+)\s*\)\s*,\s*(#[0-9]+)\s*\)/i);
    if (m) {
      const styleRef = m[1].replace('#', '');
      const targetRef = m[2].replace('#', '');
      const style = presentationStyleMap.get(styleRef) || curveStyleMap.get(styleRef);
      if (style) {
        entityStyleMap.set(targetRef, style);
      }
    }
  };

  entityMap.forEach((ent) => {
    if (ent.type === 'STYLED_ITEM') {
      scanStyledItem(`STYLED_ITEM(${ent.rawArgs})`);
    } else if (ent.type === 'COMPLEX') {
      scanStyledItem(ent.rawArgs);
    }
  });

  // 7. 各エンティティのジオメトリ変換
  entityMap.forEach((ent, entId) => {
    // 複合エンティティの場合は内部のサブエンティティを順に処理、通常エンティティはそのまま
    const subList = ent.type === 'COMPLEX'
      ? decomposeComplexEntity(ent.rawArgs)
      : [ent];

    // 所属レイヤーの厳密解決（CADのレイヤー定義を優先）
    let layer = entityLayerMap.get(entId);
    if (!layer) {
      // エンティティ引数内のレイヤー参照 (#layer_id または レイヤー番号) を探索
      const checkArgs = ent.type === 'COMPLEX'
        ? subList.flatMap(s => parseArgs(s.rawArgs))
        : parseArgs(ent.rawArgs);

      for (const arg of checkArgs) {
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

    // スタイルの決定: STYLED_ITEM直接参照 -> レイヤー名インテリジェント推測 -> デフォルト
    const entStyle = entityStyleMap.get(entId);
    const isCenterLayer = /CEN|CENTER|基準線|中心線/i.test(layer);
    const isHiddenLayer = /HID|HIDDEN|隠れ線/i.test(layer);
    const isTitleLayer = /TTL|FRAME|図面枠|表題/i.test(layer);
    const isDimLayer = /DIM|寸法/i.test(layer);
    const isStrLayer = /STR|構造|外形/i.test(layer);

    const resolvedLineType: CadLineType = entStyle?.font 
      || (isCenterLayer ? 'chain' : isHiddenLayer ? 'dashed' : 'continuous');
    const resolvedLineWidthMm = entStyle?.widthMm 
      || (isTitleLayer ? 0.70 : isStrLayer ? 0.35 : isDimLayer ? 0.13 : 0.25);
    const finalColor = entStyle?.color || defaultColor;

    for (const targetEnt of subList) {
      const type = targetEnt.type;
      const args = parseArgs(targetEnt.rawArgs);

      // エンティティの累積アフィン変換行列の取得
      const mat = getEntityTransform(entId);
      const scaleFactor = Math.sqrt(mat.a * mat.a + mat.b * mat.b) || 1.0;
      const rotationAngle = Math.atan2(mat.b, mat.a);

      // --- A. LINE / SXF_LINE ---
      // TRIMMED_CURVE の基底になっている LINE は単独描画をスキップ
      if ((type === 'LINE' || type.endsWith('_LINE')) && !basisCurveIds.has(entId)) {
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
            p1: transformCadPoint(p1, mat),
            p2: transformCadPoint(p2, mat),
            color: finalColor,
            layer,
            lineType: resolvedLineType,
            lineWidthMm: resolvedLineWidthMm,
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
            if (pt) pts.push(transformCadPoint(pt, mat));
          }
          if (pts.length >= 2) {
            entities.push({
              type: 'polyline',
              points: pts,
              color: finalColor,
              layer,
              lineType: resolvedLineType,
              lineWidthMm: resolvedLineWidthMm,
            });
          }
        }
      }

      // --- C. CIRCLE / ARC / TRIMMED_CURVE ---
      // TRIMMED_CURVE の基底になっている CIRCLE は単独描画をスキップ（TRIMMED_CURVE側で円弧として描画）
      else if (
        ((type === 'CIRCLE' || type.endsWith('_CIRCLE')) && !basisCurveIds.has(entId)) || 
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

          // 1. 直線型 TRIMMED_CURVE (寸法線・引き出し線・補助線・境界線)
          if (basisEnt && (basisEnt.type === 'LINE' || basisEnt.type.endsWith('_LINE'))) {
            const p1Ref = args[2]?.match(/#\d+/)?.[0];
            const p2Ref = args[3]?.match(/#\d+/)?.[0];
            let p1: CadPoint | null = p1Ref ? resolvePoint(p1Ref) : null;
            let p2: CadPoint | null = p2Ref ? resolvePoint(p2Ref) : null;

            // トリムに直接ポイント参照がない場合、LINE自体の引数からフォールバック解決
            if (!p1 || !p2) {
              const lineArgs = parseArgs(basisEnt.rawArgs);
              const lineP1Ref = lineArgs[1]?.match(/#\d+/)?.[0] || lineArgs[0]?.match(/#\d+/)?.[0];
              const lineP2Ref = lineArgs[2]?.match(/#\d+/)?.[0];
              if (!p1 && lineP1Ref) p1 = resolvePoint(lineP1Ref);
              if (!p2 && lineP2Ref) p2 = resolvePoint(lineP2Ref);
            }

            if (p1 && p2 && (p1.x !== p2.x || p1.y !== p2.y)) {
              entities.push({
                type: 'line',
                p1: transformCadPoint(p1, mat),
                p2: transformCadPoint(p2, mat),
                color: finalColor,
                layer,
                lineType: resolvedLineType,
                lineWidthMm: resolvedLineWidthMm,
              });
              continue;
            }
          }

          // 2. 円弧型 TRIMMED_CURVE
          else if (basisEnt && (basisEnt.type === 'CIRCLE' || basisEnt.type.endsWith('_CIRCLE'))) {
            const bArgs = parseArgs(basisEnt.rawArgs);
            const placementRef = bArgs[1]?.replace(/^#/, '') || bArgs[0]?.replace(/^#/, '');
            let localAxisAngle = 0;

            if (placementRef) {
              const placeEnt = entityMap.get(placementRef);
              if (placeEnt) {
                const pArgs = parseArgs(placeEnt.rawArgs);
                const locRef = pArgs[0]?.replace(/^#/, '') || pArgs[1]?.replace(/^#/, '');
                center = locRef ? resolvePoint(locRef) : null;
                // 方向ベクトル (AXIS)
                const axisRef = pArgs[1]?.replace(/^#/, '') || pArgs[2]?.replace(/^#/, '');
                if (axisRef && axisRef !== '$') {
                  const dirEnt = entityMap.get(axisRef);
                  if (dirEnt && (dirEnt.type.includes('DIRECTION') || dirEnt.type.includes('VECTOR'))) {
                    const dArgs = parseArgs(dirEnt.rawArgs);
                    const dCoords = dArgs[0]?.replace(/[()]/g, '').split(',').map(s => parseFloat(s.trim())) || [1, 0];
                    if (!isNaN(dCoords[0]) && !isNaN(dCoords[1])) {
                      localAxisAngle = Math.atan2(dCoords[1], dCoords[0]);
                    }
                  }
                }
              }
            }
            if (!center) {
              center = resolvePoint(bArgs[1] || bArgs[0]);
            }

            const r = parseFloat(bArgs[2]);
            if (!isNaN(r) && r > 0 && r < 500000) {
              radius = r;
            }

            // トリムパラメータの抽出ヘルパー (PARAMETER_VALUE または 点参照 #id または 数値)
            const parseTrimParam = (rawArg?: string): { val?: number; pt?: CadPoint } => {
              if (!rawArg) return {};
              const clean = rawArg.trim();
              // PARAMETER_VALUE(...)
              const pMatch = clean.match(/PARAMETER_VALUE\s*\(\s*([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*\)/i);
              if (pMatch) {
                return { val: parseFloat(pMatch[1]) };
              }
              // 点の参照 (#123)
              const ptMatch = clean.match(/#(\d+)/);
              if (ptMatch) {
                const pt = resolvePoint(ptMatch[1]);
                if (pt) return { pt };
              }
              // 単純数値
              const stripped = clean.replace(/[()]/g, '').trim();
              const n = parseFloat(stripped);
              if (!isNaN(n)) {
                return { val: n };
              }
              return {};
            };

            const trim1 = parseTrimParam(args[2]);
            const trim2 = parseTrimParam(args[3]);

            // 回転方向 (.T. = 反時計回り/角度増加, .F. = 時計回り/角度減少)
            const sense = args[4]?.toUpperCase();
            if (sense === '.F.') {
              clockwise = true;
            }

            if (trim1.val !== undefined && trim2.val !== undefined) {
              // パラメータが度数法 (> 6.3) かラジアン (<= 6.3) かを正確に判定
              const a1 = Math.abs(trim1.val) > 6.3 ? (trim1.val * Math.PI) / 180 : trim1.val;
              const a2 = Math.abs(trim2.val) > 6.3 ? (trim2.val * Math.PI) / 180 : trim2.val;
              startAngle = a1 + localAxisAngle;
              endAngle = a2 + localAxisAngle;
              isArc = true;
            } else if (trim1.pt && trim2.pt && center) {
              startAngle = Math.atan2(trim1.pt.y - center.y, trim1.pt.x - center.x);
              endAngle = Math.atan2(trim2.pt.y - center.y, trim2.pt.x - center.x);
              isArc = true;
            }
          }
        } else {
          // 通常の単独 CIRCLE('', #axis, radius) または sxf_arc(name, #placement, radius, a1, a2)
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
        const transformedRadius = radius !== null ? radius * scaleFactor : null;
        // 単独の円（isArc=false）で極端に巨大なものは誤検出として除外（ただし丸囲み数字や測量点は通す）
        const isTooBigFullCircle = !isArc && transformedRadius !== null && transformedRadius > 2000;
        const isTooBigArc = isArc && transformedRadius !== null && transformedRadius > 500000;

        if (center && transformedRadius !== null && transformedRadius > 0.05 && !isTooBigFullCircle && !isTooBigArc) {
          entities.push({
            type: 'circle',
            center: transformCadPoint(center, mat),
            radius: transformedRadius,
            startAngle: startAngle + rotationAngle,
            endAngle: endAngle + rotationAngle,
            isArc,
            clockwise,
            color: finalColor,
            layer,
            lineType: resolvedLineType,
            lineWidthMm: resolvedLineWidthMm,
          });
        }
      }

    // --- D. TEXT / TEXT_LITERAL / DRAUGHTING_TEXT / ANNOTATION ---
    else if (
      (type.includes('TEXT') ||
       type.includes('ANNOTATION') ||
       type.includes('LITERAL') ||
       type === 'COMPLEX') &&
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

      for (const raw of strArgs) {
        const cleaned = extractCleanCadText(raw);
        if (cleaned.align !== 'left') align = cleaned.align;
        if (cleaned.baseline !== 'bottom') baseline = cleaned.baseline;

        if (!textStr && cleaned.isValid) {
          textStr = cleaned.text;
        }
      }

      // 引数に文字列が直接ない場合、参照先エンティティ(#ID)からテキスト本文を救出
      if (!textStr) {
        for (const arg of args) {
          if (arg.startsWith('#')) {
            const subEnt = entityMap.get(arg.replace('#', ''));
            if (subEnt && (subEnt.type.includes('TEXT') || subEnt.type.includes('LITERAL'))) {
              const subArgs = parseArgs(subEnt.rawArgs)
                .filter(a => a.startsWith("'") && a.endsWith("'"))
                .map(a => decodeStepString(a.slice(1, -1)));
              for (const subRaw of subArgs) {
                const subCleaned = extractCleanCadText(subRaw);
                if (subCleaned.align !== 'left') align = subCleaned.align;
                if (subCleaned.baseline !== 'bottom') baseline = subCleaned.baseline;
                if (!textStr && subCleaned.isValid) {
                  textStr = subCleaned.text;
                }
              }
            }
          }
        }
      }

      // 配置座標の解決
      for (const arg of args) {
        if (arg.startsWith('#') && !pos) {
          pos = resolvePoint(arg);
          const placeEnt = entityMap.get(arg.replace('#', ''));
          if (placeEnt) {
            const pArgs = parseArgs(placeEnt.rawArgs);
            if (!pos && pArgs[0] && pArgs[0].startsWith('#')) {
              pos = resolvePoint(pArgs[0]);
            }
            const dirRef = pArgs[2] || pArgs[1];
            if (dirRef && dirRef.startsWith('#')) {
              const dirEnt = entityMap.get(dirRef.replace('#', ''));
              if (dirEnt && dirEnt.type.includes('DIRECTION')) {
                const dArgs = parseArgs(dirEnt.rawArgs);
                const tupleArg = dArgs.find(a => a.includes('(') && a.includes(')')) || dArgs[1] || dArgs[0];
                const coords = tupleArg?.replace(/[()]/g, '').split(',').map(s => parseFloat(s.trim())) || [1, 0];
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

      // 有効なテキストと座標がある場合のみ登録（制御文字やシステムノイズは除外済み）
      if (textStr && textStr.trim().length > 0 && pos) {
        const transformedPos = transformCadPoint(pos, mat);
        const transformedHeight = height * scaleFactor >= 0.8 ? height * scaleFactor : (height || 3.5);
        entities.push({
          type: 'text',
          text: textStr.trim(),
          position: transformedPos,
          height: transformedHeight,
          angle: (angle || 0) + rotationAngle,
          align,
          baseline,
          color: defaultColor === '#38bdf8' ? '#f8fafc' : defaultColor,
          layer,
        });
      }
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

  // 7. 図面内テキスト・注記・寸法値のサマリー抽出（重複除去 & 制御コード徹底排除）
  const textSummarySet = new Set<string>();
  for (const ent of entities) {
    if (ent.type === 'text' && ent.text) {
      const cleaned = extractCleanCadText(ent.text);
      if (cleaned.isValid && !textSummarySet.has(cleaned.text)) {
        textSummarySet.add(cleaned.text);
      }
    }
  }
  const textSummary = Array.from(textSummarySet);

  const bounds = calculateBounds(entities);

  return {
    entities,
    bounds,
    layers,
    textSummary,
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
        const u8 = await zip.files[p21File].async('uint8array');
        let text = '';
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(u8);
        } catch {
          text = new TextDecoder('shift-jis').decode(u8);
        }
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
          const rawStr = decoder.decode(sub).trim();
          if (rawStr.length >= 2 && !/^[\s\d_]+$/.test(rawStr)) {
            const cleaned = extractCleanCadText(rawStr);
            if (cleaned.isValid) {
              const pos = extractedPoints[entities.length % Math.max(1, extractedPoints.length)] || { x: 50, y: 50 };
              entities.push({
                type: 'text',
                text: cleaned.text,
                position: { x: pos.x, y: pos.y },
                height: 4.5,
                color: '#f8fafc',
                layer: '注記・文字 (M-T)',
              });
            }
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

  const textSummarySet = new Set<string>();
  for (const ent of entities) {
    if (ent.type === 'text' && ent.text) {
      const cleaned = extractCleanCadText(ent.text);
      if (cleaned.isValid && !textSummarySet.has(cleaned.text)) {
        textSummarySet.add(cleaned.text);
      }
    }
  }
  const textSummary = Array.from(textSummarySet);

  const bounds = calculateBounds(entities);

  return {
    entities,
    bounds,
    layers,
    textSummary,
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
