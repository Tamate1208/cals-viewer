import type { BlackboardItem, ConstructionInfo, DrawingItem, PhotoItem, ReportItem } from '../types/cals';

/**
 * ArrayBuffer からテキストを Shift-JIS または UTF-8 として高精度デコード
 * CALS/EC（国交省・自治体）の標準である Shift_JIS (CP932/Windows-31J) を確実に判別
 */
export function decodeXmlBuffer(buffer: ArrayBuffer): string {
  // 先頭1024バイトを読み込んで encoding 属性を調査
  const headBytes = new Uint8Array(buffer.slice(0, 1024));
  const headAscii = new TextDecoder('latin1').decode(headBytes);

  const encMatch = /encoding=["']([a-zA-Z0-9_-]+)["']/i.exec(headAscii);
  const declaredEncoding = encMatch ? encMatch[1].toLowerCase() : '';

  // 1. 明示的に Shift-JIS 系統が指定されている場合
  if (/shift[_-]?jis|sjis|cp932|windows-31j|x-sjis/i.test(declaredEncoding)) {
    try {
      return new TextDecoder('shift-jis').decode(buffer);
    } catch {
      // フォールバック
    }
  }

  // 2. EUC-JP の場合
  if (/euc[_-]?jp/i.test(declaredEncoding)) {
    try {
      return new TextDecoder('euc-jp').decode(buffer);
    } catch {
      // フォールバック
    }
  }

  // 3. UTF-8 が明示されているか、指定がない場合
  // まず UTF-8 (strict: 不正バイトがあれば例外) を試す
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return utf8Decoder.decode(buffer);
  } catch {
    // UTF-8 のバイトシーケンスとして不正な場合は、CALS標準である Shift-JIS でデコード
    try {
      const sjisDecoder = new TextDecoder('shift-jis');
      return sjisDecoder.decode(buffer);
    } catch {
      // 最終フォールバック
      return new TextDecoder('utf-8').decode(buffer);
    }
  }
}

/**
 * 日付文字列（YYYYMMDD, YYYY/MM/DD等）を標準的な YYYY-MM-DD に正規化
 */
export function normalizeCalsDate(rawDate?: string): string {
  if (!rawDate) return '';
  const trimmed = rawDate.trim();
  // YYYYMMDD
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.substring(0, 4)}-${trimmed.substring(4, 6)}-${trimmed.substring(6, 8)}`;
  }
  // YYYY/MM/DD or YYYY.MM.DD
  if (/^\d{4}[/.]\d{1,2}[/.]\d{1,2}$/.test(trimmed)) {
    const parts = trimmed.split(/[/.]/);
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${parts[0]}-${m}-${d}`;
  }
  return trimmed;
}

/**
 * 時刻文字列（HHMMSS等）を標準的な HH:MM:SS に正規化
 */
export function normalizeCalsTime(rawTime?: string): string {
  if (!rawTime) return '';
  const trimmed = rawTime.trim();
  // HHMMSS
  if (/^\d{6}$/.test(trimmed)) {
    return `${trimmed.substring(0, 2)}:${trimmed.substring(2, 4)}:${trimmed.substring(4, 6)}`;
  }
  return trimmed;
}

/**
 * 大文字・小文字・名前空間プレフィックスを無視して一致する子要素を取得
 */
export function findChildElements(parent: Element, ...tagNames: string[]): Element[] {
  const targetNames = tagNames.map(t => t.toLowerCase());
  const matched: Element[] = [];
  const children = parent.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const local = (child.localName || child.tagName.split(':').pop() || child.tagName).toLowerCase();
    if (targetNames.includes(local)) {
      matched.push(child);
    }
  }
  return matched;
}

/**
 * 大文字・小文字・名前空間プレフィックスを無視して一致する子孫要素を取得
 */
export function findDescendantElements(parent: Element | Document, ...tagNames: string[]): Element[] {
  const targetNames = tagNames.map(t => t.toLowerCase());
  const matched: Element[] = [];
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const local = (el.localName || el.tagName.split(':').pop() || el.tagName).toLowerCase();
    if (targetNames.includes(local)) {
      matched.push(el);
    }
  }
  return matched;
}

/**
 * 大文字・小文字・階層を許容して要素内のテキストを取得（直下優先、なければ子孫探索）
 */
export function getElementText(parent: Element, ...tagNames: string[]): string {
  // 1. 直下の子要素から探索
  const directMatches = findChildElements(parent, ...tagNames);
  if (directMatches.length > 0) {
    const text = directMatches[0].textContent?.trim() || '';
    if (text) return text;
  }

  // 2. 子孫要素から探索
  const descendantMatches = findDescendantElements(parent, ...tagNames);
  if (descendantMatches.length > 0) {
    const text = descendantMatches[0].textContent?.trim() || '';
    if (text) return text;
  }

  return '';
}

/**
 * DOMParser を使って XML 文字列を堅牢にパース
 * BOM除去、DOCTYPE/DTD除去、実体参照サニタイズ、不正制御文字除去を実施
 */
export function parseXmlString(xmlString: string): Document {
  let sanitized = xmlString;

  // 1. BOM (Byte Order Mark) および先頭・末尾の空白除去
  sanitized = sanitized.replace(/^\uFEFF/, '').trim();

  // 2. DTD宣言 (<!DOCTYPE ...>) を内部サブセット [...] を含めて完全に除去
  sanitized = sanitized.replace(/<!DOCTYPE\s+[^>[\]]*(\[[^\]]*\])?\s*>/gi, '');
  sanitized = sanitized.replace(/<!DOCTYPE[\s\S]*?>/gi, '');

  // 3. 不正なXML制御文字 (0x00〜0x08, 0x0B, 0x0C, 0x0E〜0x1F) を除去
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  // 4. 未エスケープの '&'（会社名や備考でよくある '&'）を '&amp;' にサニタイズ
  sanitized = sanitized.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');

  const parser = new DOMParser();
  let doc = parser.parseFromString(sanitized, 'text/xml');

  // パースエラーチェック
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    console.warn('DOMParser warning/error encountered. Attempting secondary sanitize...', parseError.textContent);
    // <?xml ...?> 宣言を取り除いて再試行
    const withoutXmlDecl = sanitized.replace(/<\?xml[\s\S]*?\?>/i, '').trim();
    const retryDoc = parser.parseFromString(withoutXmlDecl, 'text/xml');
    if (!retryDoc.querySelector('parsererror')) {
      return retryDoc;
    }
  }

  return doc;
}

/**
 * INDEX_C.XML または INDEX_D.XML のパース
 * 国土交通省・広島県電子納品基準の階層構造（contract, client, contractor, term 等）に対応
 */
export function parseIndexXml(xmlString: string): ConstructionInfo {
  const doc = parseXmlString(xmlString);
  const root = doc.documentElement;

  // 工事名称 / 業務名称
  const constructionName = 
    getElementText(root, 'construction_name', 'business_name', 'work_name', 'project_name', 'title') || 
    '（名称未設定工事）';

  // 路線・河川名
  const lineRiverName = 
    getElementText(root, 'line_river_name', 'route_name', 'river_name');

  // 発注者名称 (client 配下、または orderer_name)
  let clientName = getElementText(root, 'client_name', 'orderer_name', 'client');
  const departmentName = getElementText(root, 'department_name', 'office_name');
  if (departmentName && clientName && !clientName.includes(departmentName)) {
    clientName = `${clientName} ${departmentName}`;
  }
  if (!clientName) clientName = '広島県';

  // 請負者・受注者名称 (contractor 配下、または company_name)
  const contractorName = 
    getElementText(root, 'contractor_name', 'company_name', 'contractor', 'consignment_name') || 
    '（施工業者未設定）';

  // 契約番号
  const contractNumber = 
    getElementText(root, 'contract_number', 'contract_no');

  // 工期 (start_date / end_date)
  const startDate = normalizeCalsDate(
    getElementText(root, 'start_date', 'term_start', 'term_from', 'work_start_date')
  );
  const endDate = normalizeCalsDate(
    getElementText(root, 'end_date', 'term_end', 'term_to', 'work_end_date')
  );

  // 工事場所
  const place = 
    getElementText(root, 'place_description', 'location', 'place', 'address', 'site_address');

  // 監督員・検査員
  const supervisor = 
    getElementText(root, 'supervisor', 'inspector', 'supervising_engineer');

  // 主任技術者・監理技術者・現場代理人
  const chiefEngineer = 
    getElementText(root, 'chief_engineer', 'managing_engineer', 'site_representative', 'engineer');

  return {
    constructionName,
    lineRiverName,
    clientName,
    contractorName,
    contractNumber,
    startDate,
    endDate,
    place,
    supervisor,
    chiefEngineer,
  };
}

/**
 * PHOTO_C.XML / PHOTO.XML のパース
 * 国土交通省「デジタル写真管理情報基準」準拠
 * タグ: <photo>, <kou_syu>, <syu_betu>, <sai_betu>, <photo_place>, <photo_file_name> 等を完全網羅
 * 電子黒板情報（設計値・実測値・測定項目等）の抽出対応
 */
export function parsePhotoXml(xmlString: string): PhotoItem[] {
  const doc = parseXmlString(xmlString);
  const items: PhotoItem[] = [];

  // 各写真要素を大文字小文字・プレフィックス無視で探索 (<photo>, <photo_item>, <picture>, <pic>)
  const photoNodes = findDescendantElements(doc, 'photo', 'photo_item', 'picture', 'pic');

  photoNodes.forEach((node, index) => {
    // 1. ファイル名（国交省標準: photo_file_name）
    const fileName = getElementText(
      node, 
      'photo_file_name', 
      'photo_filename', 
      'file_name', 
      'filename', 
      'pic_file_name', 
      'file'
    );

    // 2. 写真ID
    const id = getElementText(node, 'photo_id', 'id') || `PHOTO_${index + 1}`;

    // 3. タイトル
    const title = getElementText(
      node, 
      'photo_title', 
      'title', 
      'caption', 
      'photo_name', 
      'name'
    ) || (fileName ? fileName.replace(/\.[^.]+$/, '') : `写真 ${index + 1}`);

    // 4. 写真区分 (着工前 / 施工中 / 完成 / 不可視部分 等)
    const category = getElementText(
      node, 
      'photo_category', 
      'category', 
      'photo_kbn', 
      'kbn'
    ) || '施工中';

    // 5. 写真種別 (出来形管理 / 品質管理 / 安全管理 / 使用材料 等)
    const type = getElementText(
      node, 
      'photo_class', 
      'photo_type', 
      'class', 
      'type', 
      'syubetsu'
    ) || '出来形管理';

    // 6. 工種（国交省標準: kou_syu）
    const workType = getElementText(
      node, 
      'kou_syu', 
      'kousyu', 
      'work_type', 
      'worktype', 
      'work_category'
    ) || type || '一般工種';

    // 7. 種別（国交省標準: syu_betu）
    const workKind = getElementText(
      node, 
      'syu_betu', 
      'syubetu', 
      'work_kind', 
      'workkind'
    ) || '';

    // 8. 細別（国交省標準: sai_betu）
    const workDetail = getElementText(
      node, 
      'sai_betu', 
      'saibetu', 
      'work_detail', 
      'workdetail'
    ) || '';

    // 9. 撮影日・時刻
    const rawDate = getElementText(node, 'photo_date', 'date', 'shooting_date', 'shot_date');
    const date = normalizeCalsDate(rawDate);
    const rawTime = getElementText(node, 'photo_time', 'time', 'shooting_time');
    const time = normalizeCalsTime(rawTime);

    // 10. 測点・撮影箇所（国交省標準: photo_place）
    const station = getElementText(
      node, 
      'photo_place', 
      'station', 
      'measure_point', 
      'sokuten', 
      'place', 
      'location'
    ) || '';

    // 11. 備考
    const remarks = getElementText(
      node, 
      'remarks', 
      'memo', 
      'description', 
      'note'
    ) || '';

    // 12. 電子黒板情報（小黒板メタデータ、設計値、実測値等の網羅的抽出）
    const blackboardItems: BlackboardItem[] = [];

    // 測点
    if (station) {
      blackboardItems.push({ name: '測点', value: station });
    }

    // 設計値・実測値・許容差・測定項目の抽出
    const measureItem = getElementText(node, 'measure_item', 'measurement_item', 'koumoku');
    if (measureItem) {
      blackboardItems.push({ name: '測定項目', value: measureItem });
    }

    const designVal = getElementText(node, 'design_value', 'plan_val', 'plan_value', 'sekkei_ti');
    if (designVal) {
      blackboardItems.push({ name: '設計値', value: designVal });
    }

    const measuredVal = getElementText(node, 'measured_value', 'actual_val', 'actual_value', 'jissoku_ti');
    if (measuredVal) {
      blackboardItems.push({ name: '実測値', value: measuredVal });
    }

    const tolerance = getElementText(node, 'tolerance', 'kyoyousa');
    if (tolerance) {
      blackboardItems.push({ name: '許容差', value: tolerance });
    }

    const diff = getElementText(node, 'difference', 'diff_value', 'sa');
    if (diff) {
      blackboardItems.push({ name: '差', value: diff });
    }

    // 子要素内の小黒板ノード（<blackboard>, <kokuban>, <blackboard_item>, <item> 等）の走査
    const bbItemNodes = findDescendantElements(
      node, 
      'blackboard_item', 
      'item', 
      'item_info', 
      'kokuban_item'
    );

    bbItemNodes.forEach(bb => {
      const n = getElementText(bb, 'name', 'item_name', 'koumoku', 'title');
      const v = getElementText(bb, 'value', 'item_value', 'val', 'content');
      if (n && v) {
        // 重複チェック
        if (!blackboardItems.some(item => item.name === n)) {
          blackboardItems.push({ name: n, value: v });
        }
      }
    });

    if (fileName || title) {
      items.push({
        id,
        title,
        category,
        type,
        workType,
        workKind,
        workDetail,
        date,
        time,
        station,
        remarks,
        fileName,
        filePath: fileName,
        blackboardItems,
      });
    }
  });

  return items;
}

/**
 * REPORT_C.XML / REPORT.XML / MEET_C.XML / PLAN_C.XML 等のパース
 * 報告書・協議簿・施工計画書に対応
 */
export function parseReportXml(xmlString: string): ReportItem[] {
  const doc = parseXmlString(xmlString);
  const items: ReportItem[] = [];

  // 報告書・協議書・計画書ノードの探索
  const reportNodes = findDescendantElements(
    doc, 
    'report', 
    'report_item', 
    'meet', 
    'meet_item', 
    'plan', 
    'plan_item'
  );

  reportNodes.forEach((node, index) => {
    const id = getElementText(node, 'report_id', 'meet_id', 'plan_id', 'id') || `REP_${index + 1}`;
    const fileName = getElementText(
      node, 
      'report_file_name', 
      'meet_file_name', 
      'plan_file_name', 
      'file_name', 
      'filename', 
      'file'
    ) || '';

    const title = getElementText(
      node, 
      'report_title', 
      'meet_title', 
      'plan_title', 
      'title', 
      'name', 
      'subject'
    ) || (fileName ? fileName.replace(/\.[^.]+$/, '') : `書類 ${index + 1}`);

    const type = getElementText(
      node, 
      'report_type', 
      'meet_type', 
      'plan_type', 
      'type', 
      'report_class', 
      'class'
    ) || '報告書類';

    const rawDate = getElementText(node, 'create_date', 'date', 'report_date', 'meet_date');
    const createDate = normalizeCalsDate(rawDate);

    const summary = getElementText(
      node, 
      'summary', 
      'remarks', 
      'description', 
      'memo'
    ) || '';

    if (fileName || title) {
      items.push({
        id,
        title,
        type,
        fileName,
        filePath: fileName,
        createDate,
        summary,
      });
    }
  });

  return items;
}

/**
 * DRAWING_C.XML / DRAWING.XML / DRAWINGF.XML / DRAWINGS.XML のパース
 * 国土交通省完成図面（DRAWINGF）および施工図（DRAWINGS）に対応
 */
export function parseDrawingXml(xmlString: string): DrawingItem[] {
  const doc = parseXmlString(xmlString);
  const items: DrawingItem[] = [];

  const drawingNodes = findDescendantElements(doc, 'drawing', 'drawing_item', 'draw');

  drawingNodes.forEach((node, index) => {
    const id = getElementText(node, 'drawing_id', 'id') || `DRW_${index + 1}`;
    const fileName = getElementText(
      node, 
      'drawing_file_name', 
      'file_name', 
      'filename', 
      'drawing_file', 
      'pdf_file'
    ) || '';

    const cadFileName = getElementText(
      node, 
      'cad_file_name', 
      'cad_filename', 
      'sxf_file', 
      'sxf_file_name', 
      'cad_file'
    ) || '';

    const title = getElementText(
      node, 
      'drawing_title', 
      'title', 
      'name', 
      'drawing_name'
    ) || (fileName ? fileName.replace(/\.[^.]+$/, '') : `図面 ${index + 1}`);

    const type = getElementText(
      node, 
      'drawing_type', 
      'type', 
      'drawing_class', 
      'class'
    ) || '完成図';

    const scale = getElementText(node, 'scale', 'drawing_scale') || '';

    if (fileName || cadFileName || title) {
      items.push({
        id,
        title,
        type,
        fileName,
        filePath: fileName,
        cadFileName,
        scale,
      });
    }
  });

  return items;
}
