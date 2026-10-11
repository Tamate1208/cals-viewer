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
 * デジタル写真管理情報基準（国交省・各自治体共通）の標準写真区分
 */
export const PHOTO_STANDARD_CATEGORIES = [
  '着手前及び完成写真',
  '施工状況写真',
  '安全管理写真',
  '使用材料写真',
  '出来形管理写真',
  '品質管理写真',
  '災害写真',
  'その他'
] as const;

/**
 * 写真区分が基準外・未入力・固定値（「一般」「工事」等）の場合に、
 * タイトル、工種、備考、黒板テキストから文脈キーワードを解析して基準の7大区分へ自動推定・正規化
 */
export function inferPhotoCategory(rawCategory: string | undefined, contextText: string): string {
  const cat = (rawCategory || '').trim();

  // すでに標準区分のいずれかに完全一致または包含している場合
  for (const std of PHOTO_STANDARD_CATEGORIES) {
    if (cat === std || (cat.length >= 4 && (std.includes(cat) || cat.includes(std)))) {
      return std;
    }
  }

  // 略称・異表記のダイレクトマッピング
  if (/着手前?|着工前?|完成|竣工|全景/.test(cat)) return '着手前及び完成写真';
  if (/施工(状況|中)?|工程|作業状況/.test(cat)) return '施工状況写真';
  if (/出来形(管理)?|検測|寸法|高低差/.test(cat)) return '出来形管理写真';
  if (/品質(管理)?|試験|スランプ|空気量|強度|テスト/.test(cat)) return '品質管理写真';
  if (/(使用)?材料(管理|検収)?|ミルシート|搬入/.test(cat)) return '使用材料写真';
  if (/安全(管理)?|朝礼|KY|パトロール|標識/.test(cat)) return '安全管理写真';
  if (/災害|被災|応急/.test(cat)) return '災害写真';

  // rawCategory が「工事」「一般」「写真」「未分類」等の無意味な値、または空の場合、前後の文脈から推定
  const ctx = `${cat} ${contextText}`.toLowerCase();

  if (/着手前?|着工前?|完成|竣工|全景|全景写真/.test(ctx)) return '着手前及び完成写真';
  if (/出来形|出来高|検測|実測|測定|寸法|幅員|延長|厚さ|高低差|かぶり|ピッチ/.test(ctx)) return '出来形管理写真';
  if (/品質|試験|スランプ|空気量|強度|圧縮強度|供試体|配合|温度測定|密度/.test(ctx)) return '品質管理写真';
  if (/材料|検収|ミルシート|規格証明|受入|搬入|材料確認/.test(ctx)) return '使用材料写真';
  if (/安全|朝礼|ky|危険予知|パトロール|保安|安全帯|ヘルメット|標識|消火/.test(ctx)) return '安全管理写真';
  if (/災害|被災|応急|復旧|崩壊/.test(ctx)) return '災害写真';

  // 推定できなかった場合は「施工状況写真」をデフォルトとする
  return '施工状況写真';
}

/**
 * 日付文字列（YYYYMMDD, YYYY/MM/DD, YYYY-MM-DD, 和暦「令和6年5月1日」等）を標準的な YYYY-MM-DD に正規化
 */
export function normalizeCalsDate(rawDate?: string): string {
  if (!rawDate) return '';
  let trimmed = rawDate.trim();

  // 1. 和暦対応 (例: 令和6年5月10日, 令和06/05/10, R6.5.10, 平成30年10月1日, H30-10-01)
  const warekiRegex = /^(令和|平成|R|H)\s*(\d{1,2})[年/.-]\s*(\d{1,2})[月/.-]\s*(\d{1,2})日?$/i;
  const warekiMatch = trimmed.match(warekiRegex);
  if (warekiMatch) {
    const era = warekiMatch[1].toUpperCase();
    const gengoYear = parseInt(warekiMatch[2], 10);
    const m = warekiMatch[3].padStart(2, '0');
    const d = warekiMatch[4].padStart(2, '0');
    let seirekiYear = 2000;
    if (era.startsWith('令') || era === 'R') {
      seirekiYear = 2018 + gengoYear;
    } else if (era.startsWith('平') || era === 'H') {
      seirekiYear = 1988 + gengoYear;
    }
    return `${seirekiYear}-${m}-${d}`;
  }

  // 2. 年月日表記 (例: 2024年5月10日)
  const jpDateRegex = /^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?$/;
  const jpMatch = trimmed.match(jpDateRegex);
  if (jpMatch) {
    return `${jpMatch[1]}-${jpMatch[2].padStart(2, '0')}-${jpMatch[3].padStart(2, '0')}`;
  }

  // 3. YYYYMMDD (8桁数値)
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.substring(0, 4)}-${trimmed.substring(4, 6)}-${trimmed.substring(6, 8)}`;
  }

  // 4. YYYY/MM/DD or YYYY.MM.DD or YYYY-MM-DD
  if (/^\d{4}[/.-]\d{1,2}[/.-]\d{1,2}$/.test(trimmed)) {
    const parts = trimmed.split(/[/.-]/);
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${parts[0]}-${m}-${d}`;
  }

  // 5. 日付と時刻が結合している場合 (例: 2024-05-10T14:30:00, 2024/05/10 14:30)
  const dtMatch = trimmed.match(/^(\d{4}[/.-]\d{1,2}[/.-]\d{1,2})[T\s]/);
  if (dtMatch) {
    return normalizeCalsDate(dtMatch[1]);
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
  const doc = parser.parseFromString(sanitized, 'text/xml');

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
 * 国土交通省・地方自治体(GioV)電子納品基準の日本語タグ（INDE_C06.DTD等）および英語タグの両方に対応
 */
export function parseIndexXml(xmlString: string): ConstructionInfo {
  const doc = parseXmlString(xmlString);
  const root = doc.documentElement;

  // 1. 工事名称 / 業務名称
  const constructionName = 
    getElementText(root, '工事名称', '工事名', '工事件名', 'construction_name', 'business_name', 'work_name', 'project_name', 'title') || 
    '（名称未設定工事）';

  // 2. 路線・河川名
  const lineRiverName = 
    getElementText(root, '水系-路線情報', '路線河川名', '路線名', '河川名', 'line_river_name', 'route_name', 'river_name');

  // 3. 発注者名称 (<発注者情報> 配下の <発注者-大分類> + <発注者-中分類> を自動結合)
  let clientName = '';
  const clientInfoNodes = findDescendantElements(root, '発注者情報', 'client');
  if (clientInfoNodes.length > 0) {
    const cNode = clientInfoNodes[0];
    const big = getElementText(cNode, '発注者-大分類', 'client_major');
    const mid = getElementText(cNode, '発注者-中分類', 'client_middle');
    if (big && mid) {
      clientName = `${big} ${mid}`;
    } else if (big || mid) {
      clientName = big || mid;
    }
  }
  if (!clientName) {
    clientName = getElementText(root, '発注者名', '発注者', '発注者-大分類', 'client_name', 'orderer_name', 'client');
  }
  if (!clientName) clientName = 'GioV';

  // 4. 請負者・受注者名称 (<受注者情報> 配下の <受注者名>)
  let contractorName = '';
  const contractorInfoNodes = findDescendantElements(root, '受注者情報', 'contractor');
  if (contractorInfoNodes.length > 0) {
    const coNode = contractorInfoNodes[0];
    contractorName = getElementText(coNode, '受注者名', 'contractor_name');
  }
  if (!contractorName) {
    contractorName = getElementText(root, '受注者名', '請負者名', '請負者', '受注者', 'contractor_name', 'company_name', 'contractor', 'consignment_name') || 
      '（施工業者未設定）';
  }

  // 5. 契約番号 / 工事番号
  const contractNumber = 
    getElementText(root, '工事番号', '契約番号', 'contract_number', 'contract_no');

  // 6. 工期 (start_date / end_date)
  const startDate = normalizeCalsDate(
    getElementText(root, '工期開始日', 'start_date', 'term_start', 'term_from', 'work_start_date')
  );
  const endDate = normalizeCalsDate(
    getElementText(root, '工期終了日', 'end_date', 'term_end', 'term_to', 'work_end_date')
  );

  // 7. 工事場所 (<住所情報> 配下の <住所>)
  let place = '';
  const addressNodes = findDescendantElements(root, '住所情報');
  if (addressNodes.length > 0) {
    place = getElementText(addressNodes[0], '住所');
  }
  if (!place) {
    place = getElementText(root, '住所', '工事場所', '施工場所', 'place_description', 'location', 'place', 'address', 'site_address');
  }

  // 8. 監督員・検査員
  const supervisor = 
    getElementText(root, '監督員', '監督員名', '検査員', 'supervisor', 'inspector', 'supervising_engineer');

  // 9. 主任技術者・監理技術者・現場代理人
  const chiefEngineer = 
    getElementText(root, '主任技術者名', '監理技術者名', '現場代理人', 'chief_engineer', 'managing_engineer', 'site_representative', 'engineer');

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
 * 国土交通省「デジタル写真管理情報基準（PHOTO05.DTD等）」の日本語タグおよび英語タグに完全対応
 */
export function parsePhotoXml(xmlString: string): PhotoItem[] {
  const doc = parseXmlString(xmlString);
  const items: PhotoItem[] = [];

  // 各写真要素の探索 (<写真情報>, <photo>, <photo_item>, <picture>, <pic>)
  const photoNodes = findDescendantElements(doc, '写真情報', 'photo', 'photo_item', 'picture', 'pic');

  photoNodes.forEach((node, index) => {
    // 1. 写真ファイル名 (<写真ファイル情報> 内の <写真ファイル名> または直接)
    let fileName = '';
    const fileInfoNodes = findDescendantElements(node, '写真ファイル情報');
    if (fileInfoNodes.length > 0) {
      fileName = getElementText(fileInfoNodes[0], '写真ファイル名', 'photo_file_name', 'file_name');
    }
    if (!fileName) {
      fileName = getElementText(
        node, 
        '写真ファイル名', 
        'photo_file_name', 
        'photo_filename', 
        'file_name', 
        'filename', 
        'pic_file_name', 
        'file'
      );
    }

    // 2. 写真ID
    const serial = getElementText(node, 'シリアル番号', 'serial_number', 'photo_id', 'id');
    const id = serial ? `PHOTO_${serial}` : `PHOTO_${index + 1}`;

    // 3. タイトル (<写真タイトル> / <タイトル>)
    const title = getElementText(
      node, 
      '写真タイトル', 
      'タイトル', 
      'photo_title', 
      'title', 
      'caption', 
      'photo_name', 
      'name'
    ) || (fileName ? fileName.replace(/\.[^.]+$/, '') : `写真 ${index + 1}`);

    // 4. 写真区分 (着手前及び完成写真 / 施工状況写真 / 出来形管理写真 / 安全管理写真 等)
    const rawCategory = getElementText(
      node, 
      '写真区分', 
      '写真-大分類', 
      'photo_category', 
      'category', 
      'photo_kbn', 
      'kbn'
    );

    // 5. 写真種別
    const type = getElementText(
      node, 
      '写真種別', 
      '写真-大分類', 
      'photo_class', 
      'photo_type', 
      'class', 
      'type', 
      'syubetsu'
    ) || '工事写真';

    // 6. 工種 (国交省標準: <工種> / <kou_syu>)
    let workType = getElementText(
      node, 
      '工種', 
      'kou_syu', 
      'kousyu', 
      'work_type', 
      'worktype', 
      'work_category'
    );

    // 7. 種別 (国交省標準: <種別> / <syu_betu>)
    let workKind = getElementText(
      node, 
      '種別', 
      'syu_betu', 
      'syubetu', 
      'work_kind', 
      'workkind'
    );

    // 8. 細別 (国交省標準: <細別> / <sai_betu>)
    let workDetail = getElementText(
      node, 
      '細別', 
      '細別2', 
      'sai_betu', 
      'saibetu', 
      'work_detail', 
      'workdetail'
    );

    // 9. 撮影日・時刻
    const rawDate = getElementText(node, '撮影年月日', '撮影日', 'photo_date', 'date', 'shooting_date', 'shot_date');
    const date = normalizeCalsDate(rawDate);
    const rawTime = getElementText(node, '撮影時刻', '撮影時間', 'photo_time', 'time', 'shooting_time');
    const time = normalizeCalsTime(rawTime);

    // 10. 測点・撮影箇所 (国交省標準: <撮影箇所> / <測点> / <photo_place>)
    let station = getElementText(
      node, 
      '撮影箇所', 
      '測点', 
      'photo_place', 
      'station', 
      'measure_point', 
      'sokuten', 
      'place', 
      'location'
    );

    // 11. 備考・施工管理値・予備
    const remarks = getElementText(
      node, 
      '工種区分予備', 
      '施工管理値', 
      '備考', 
      '説明文', 
      'remarks', 
      'memo', 
      'description', 
      'note'
    );

    // 12. 電子黒板情報（小黒板メタデータ、設計値、実測値等の網羅的抽出）
    const blackboardItems: BlackboardItem[] = [];

    // 設計値・実測値・許容差・測定項目の抽出
    const measureItem = getElementText(node, '測定項目', 'measure_item', 'measurement_item', 'koumoku');
    if (measureItem) {
      blackboardItems.push({ name: '測定項目', value: measureItem });
    }

    const designVal = getElementText(node, '設計値', 'design_value', 'plan_val', 'plan_value', 'sekkei_ti');
    if (designVal) {
      blackboardItems.push({ name: '設計値', value: designVal });
    }

    const measuredVal = getElementText(node, '実測値', 'measured_value', 'actual_val', 'actual_value', 'jissoku_ti');
    if (measuredVal) {
      blackboardItems.push({ name: '実測値', value: measuredVal });
    }

    // 子要素内の小黒板ノードの走査
    const bbItemNodes = findDescendantElements(
      node, 
      '黒板情報', 
      'blackboard_item', 
      'item', 
      'item_info', 
      'kokuban_item'
    );

    bbItemNodes.forEach(bb => {
      const n = getElementText(bb, '項目名', 'name', 'item_name', 'koumoku', 'title');
      const v = getElementText(bb, '値', 'value', 'item_value', 'val', 'content');
      if (n && v) {
        if (!blackboardItems.some(item => item.name === n)) {
          blackboardItems.push({ name: n, value: v });
        }
      }
    });

    // ==================== 電子黒板・タイトルからの情報救済フォールバック ====================
    // 工種が空または無意味（「工事」「一般工種」等）の場合、黒板から救出
    const isGenericWork = (w: string) => !w || ['工事', '一般工種', '工事写真', '本工事', '一般', '写真'].includes(w);
    if (isGenericWork(workType)) {
      const bbWork = blackboardItems.find(i => ['工種', '工事名', '工種名', '工事件名'].includes(i.name))?.value;
      if (bbWork && !isGenericWork(bbWork)) {
        workType = bbWork;
      } else if (workKind && !isGenericWork(workKind)) {
        workType = workKind;
      }
    }

    // 種別が空の場合、黒板から救出
    if (!workKind) {
      const bbKind = blackboardItems.find(i => ['種別', '構造', '工種細目'].includes(i.name))?.value;
      if (bbKind) workKind = bbKind;
    }

    // 細別が空の場合、黒板から救出
    if (!workDetail) {
      const bbDetail = blackboardItems.find(i => ['細別', '作業内容', '施工内容'].includes(i.name))?.value;
      if (bbDetail) workDetail = bbDetail;
    }

    // 測点が空の場合、黒板またはタイトル・備考から救出
    if (!station) {
      const bbStation = blackboardItems.find(i => ['測点', '位置', '撮影箇所', '施工位置', '地点'].includes(i.name))?.value;
      if (bbStation) {
        station = bbStation;
      } else {
        // タイトルや備考から NO.XX などの測点表記を抽出
        const stationMatch = `${title} ${remarks}`.match(/(NO\.?\s*\d+(?:\+\d+(?:\.\d+)?)?|No\.?\s*\d+(?:\+\d+(?:\.\d+)?)?|\d+k\d+m?)/i);
        if (stationMatch) {
          station = stationMatch[0].trim();
        }
      }
    }

    // 重複階層の解消（写真管理ソフトによる「工種:擁壁工 / 種別:擁壁工 / 細別:擁壁工」の同名重複を排除）
    if (workKind === workType) workKind = '';
    if (workDetail === workKind || workDetail === workType) workDetail = '';

    // 工種が未設定で種別がある場合の昇格
    if (!workType && workKind) {
      workType = workKind;
      workKind = '';
    }

    // 救出後の工種・種別・細別・測点を小黒板リストに整合追加
    if (workType && !blackboardItems.some(i => i.name === '工種')) blackboardItems.unshift({ name: '工種', value: workType });
    if (workKind && !blackboardItems.some(i => i.name === '種別')) blackboardItems.push({ name: '種別', value: workKind });
    if (workDetail && !blackboardItems.some(i => i.name === '細別')) blackboardItems.push({ name: '細別', value: workDetail });
    if (station && !blackboardItems.some(i => i.name === '測点')) blackboardItems.push({ name: '測点', value: station });
    if (title && title !== fileName && !blackboardItems.some(i => i.name === '項目')) blackboardItems.push({ name: '項目', value: title });
    if (remarks && !blackboardItems.some(i => i.name === '備考')) blackboardItems.push({ name: '備考', value: remarks });

    // 写真区分の自動推定・正規化（未入力や「工事」固定文字を、タイトル・備考・黒板テキストの文脈から救済）
    const contextText = `${title} ${remarks} ${workType} ${workKind} ${workDetail} ${blackboardItems.map(b => `${b.name}:${b.value}`).join(' ')}`;
    const category = inferPhotoCategory(rawCategory, contextText);

    if (!workType) workType = category || '本工事';

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
 * REPORT_C.XML / MEET.XML / PLAN.XML / OTHRS.XML 等のパース
 * 国交省・広島県の各種電子成果品要領（MEET05.DTD, PLAN05.DTD, OTHRS05.DTD等）に完全対応
 */
export function parseReportXml(xmlString: string): ReportItem[] {
  const doc = parseXmlString(xmlString);
  const items: ReportItem[] = [];

  // 1. 打合せ簿情報 (<打合せ簿情報>) のパース (MEET.XML)
  const meetNodes = findDescendantElements(doc, '打合せ簿情報', 'meet_item', 'meet');
  meetNodes.forEach((node, mIndex) => {
    const serial = getElementText(node, 'シリアル番号', 'serial_number');
    const meetName = getElementText(node, '打合せ簿名称', '名称', 'name', 'title') || `打合せ簿 ${mIndex + 1}`;
    const meetClass = getElementText(node, '工事帳票種類', '打合せ簿種類', '帳票種類', 'type') || '打合せ簿';
    const rawDate = getElementText(node, '発行日付', '受理日付', '作成日', 'date');
    const date = normalizeCalsDate(rawDate);

    // <オリジナルファイル情報> が複数ある場合がある
    const fileInfos = findDescendantElements(node, 'オリジナルファイル情報');
    if (fileInfos.length > 0) {
      fileInfos.forEach((fNode, fIdx) => {
        const fileName = getElementText(fNode, '打合せ簿オリジナルファイル名', 'オリジナルファイル名', 'file_name', 'filename');
        const fileJpName = getElementText(fNode, '打合せ簿オリジナルファイル日本語名', 'オリジナルファイル日本語名');
        const fileContent = getElementText(fNode, 'オリジナルファイル内容', '内容');

        if (fileName) {
          const isKagami = /鏡|かがみ/i.test(fileContent) || (fIdx === 0 && !fileContent);
          const role = isKagami ? '鑑' : (fileContent || fileJpName || `本文 ${fIdx + 1}`);
          const detailSuffix = ` (${role})`;
          items.push({
            id: `MEET_${serial || mIndex + 1}_${fIdx + 1}`,
            title: `${meetName}${detailSuffix}`,
            type: meetClass,
            fileName,
            filePath: fileName,
            createDate: date,
            summary: `${meetClass} / ${meetName} ${detailSuffix}`,
            groupTitle: meetName,
            fileRole: role,
          });
        }
      });
    } else {
      const fileName = getElementText(node, '打合せ簿オリジナルファイル名', 'オリジナルファイル名', 'file_name', 'filename');
      if (fileName) {
        items.push({
          id: `MEET_${serial || mIndex + 1}`,
          title: meetName,
          type: meetClass,
          fileName,
          filePath: fileName,
          createDate: date,
          summary: `${meetClass} / ${meetName}`,
          groupTitle: meetName,
          fileRole: '鑑・本文',
        });
      }
    }
  });

  // 2. 施工計画書情報 (<施工計画書情報>) のパース (PLAN.XML)
  const planNodes = findDescendantElements(doc, '施工計画書情報', 'plan_item', 'plan');
  planNodes.forEach((node, pIndex) => {
    const serial = getElementText(node, 'シリアル番号', 'serial_number');
    const planName = getElementText(node, '施工計画書名称', '名称', 'name', 'title') || `施工計画書 ${pIndex + 1}`;
    const rawDate = getElementText(node, '提出日付', '作成日', 'date');
    const date = normalizeCalsDate(rawDate);

    const fileInfos = findDescendantElements(node, 'オリジナルファイル情報');
    if (fileInfos.length > 0) {
      fileInfos.forEach((fNode, fIdx) => {
        const fileName = getElementText(fNode, '施工計画書オリジナルファイル名', 'オリジナルファイル名', 'file_name', 'filename');
        const fileContent = getElementText(fNode, 'オリジナルファイル内容', '内容');
        const fileJpName = getElementText(fNode, '施工計画書オリジナルファイル日本語名', 'オリジナルファイル日本語名');

        if (fileName) {
          const isKagami = /鏡|かがみ/i.test(fileContent) || (fIdx === 0 && !fileContent);
          const role = isKagami ? '鑑' : (fileContent || fileJpName || `本文 ${fIdx + 1}`);
          const detailSuffix = ` (${role})`;
          items.push({
            id: `PLAN_${serial || pIndex + 1}_${fIdx + 1}`,
            title: `${planName}${detailSuffix}`,
            type: '施工計画書',
            fileName,
            filePath: fileName,
            createDate: date,
            summary: `施工計画書: ${planName} ${detailSuffix}`,
            groupTitle: planName,
            fileRole: role,
          });
        }
      });
    } else {
      const fileName = getElementText(node, '施工計画書オリジナルファイル名', 'オリジナルファイル名', 'file_name');
      if (fileName) {
        items.push({
          id: `PLAN_${serial || pIndex + 1}`,
          title: planName,
          type: '施工計画書',
          fileName,
          filePath: fileName,
          createDate: date,
          summary: `施工計画書: ${planName}`,
          groupTitle: planName,
          fileRole: '鑑・本文',
        });
      }
    }
  });

  // 3. その他資料情報 (<その他資料情報>) のパース (OTHRS.XML)
  const othrsNodes = findDescendantElements(doc, 'その他資料情報', 'othrs_item');
  othrsNodes.forEach((node, oIndex) => {
    const docName = getElementText(node, '資料名', '名称', 'title', 'name') || `その他書類 ${oIndex + 1}`;
    const rawDate = getElementText(node, '作成日付', '作成日', 'date');
    const date = normalizeCalsDate(rawDate);

    const fileInfos = findDescendantElements(node, 'オリジナルファイル情報');
    if (fileInfos.length > 0) {
      fileInfos.forEach((fNode, fIdx) => {
        const fileName = getElementText(fNode, 'オリジナルファイル名', 'file_name', 'filename');
        const fileContent = getElementText(fNode, 'オリジナルファイル内容', '内容');

        if (fileName) {
          const isKagami = /鏡|かがみ/i.test(fileContent) || (fIdx === 0 && !fileContent);
          const role = isKagami ? '鑑' : (fileContent || `添付 ${fIdx + 1}`);
          const detailSuffix = ` (${role})`;
          items.push({
            id: `OTHRS_${oIndex + 1}_${fIdx + 1}`,
            title: `${docName}${detailSuffix}`,
            type: '契約・その他書類',
            fileName,
            filePath: fileName,
            createDate: date,
            summary: `その他資料: ${docName} ${detailSuffix}`,
            groupTitle: docName,
            fileRole: role,
          });
        }
      });
    } else {
      const fileName = getElementText(node, 'オリジナルファイル名', 'file_name');
      if (fileName) {
        items.push({
          id: `OTHRS_${oIndex + 1}`,
          title: docName,
          type: '契約・その他書類',
          fileName,
          filePath: fileName,
          createDate: date,
          summary: `その他資料: ${docName}`,
          groupTitle: docName,
          fileRole: '本紙',
        });
      }
    }
  });

  // 4. 汎用フォールバック (英字タグ: <report_item>, <report>)
  if (items.length === 0) {
    const reportNodes = findDescendantElements(doc, 'report', 'report_item');
    reportNodes.forEach((node, index) => {
      const id = getElementText(node, 'report_id', 'id') || `REP_${index + 1}`;
      const fileName = getElementText(node, 'report_file_name', 'file_name', 'filename', 'file') || '';
      const title = getElementText(node, 'report_title', 'title', 'name', 'subject') || 
        (fileName ? fileName.replace(/\.[^.]+$/, '') : `書類 ${index + 1}`);
      const type = getElementText(node, 'report_type', 'type', 'report_class', 'class') || '報告書類';
      const rawDate = getElementText(node, 'create_date', 'date', 'report_date');
      const createDate = normalizeCalsDate(rawDate);
      const summary = getElementText(node, 'summary', 'remarks', 'description') || '';

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
  }

  return items;
}

/**
 * DRAWINGF.XML / DRAWINGS.XML / DRAWING_C.XML / DRAWING.XML のパース
 * 国土交通省「CAD製図基準（DRAW04.DTD等）」の日本語タグおよび英語タグに完全対応
 */
export function parseDrawingXml(xmlString: string): DrawingItem[] {
  const doc = parseXmlString(xmlString);
  const items: DrawingItem[] = [];

  // 各図面要素の探索 (<図面情報>, <drawing>, <drawing_item>, <draw>)
  const drawingNodes = findDescendantElements(doc, '図面情報', 'drawing', 'drawing_item', 'draw');

  drawingNodes.forEach((node, index) => {
    // 1. 図面番号 / ID
    const drawingNum = getElementText(node, '図面番号', 'drawing_id', 'id');
    const id = drawingNum ? `DRW_${drawingNum}` : `DRW_${index + 1}`;

    // 2. 図面ファイル名 (P21, SFC, PDF 等)
    const fileName = getElementText(
      node, 
      '図面ファイル名', 
      'drawing_file_name', 
      'file_name', 
      'filename', 
      'drawing_file', 
      'pdf_file'
    ) || '';

    // 3. CADファイル名
    const cadFileName = getElementText(
      node, 
      'cad_file_name', 
      'cad_filename', 
      'sxf_file', 
      'sxf_file_name', 
      'cad_file'
    ) || (/\.(p21|sfc)$/i.test(fileName) ? fileName : '');

    // 4. 図面名 / タイトル
    const title = getElementText(
      node, 
      '図面名', 
      'drawing_title', 
      'title', 
      'name', 
      'drawing_name'
    ) || (fileName ? fileName.replace(/\.[^.]+$/, '') : `図面 ${index + 1}`);

    // 5. 図面種別
    const type = getElementText(
      node, 
      '図面種別', 
      'drawing_type', 
      'type', 
      'drawing_class', 
      'class'
    ) || '完成図';

    // 6. 縮尺
    const scale = getElementText(node, '縮尺', 'scale', 'drawing_scale') || '';

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
