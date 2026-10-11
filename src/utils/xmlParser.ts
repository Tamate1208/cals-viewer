import type { BlackboardItem, ConstructionInfo, DrawingItem, PhotoItem, ReportItem } from '../types/cals';


/**
 * ArrayBuffer からテキストを Shift-JIS または UTF-8 としてデコード
 */
export function decodeXmlBuffer(buffer: ArrayBuffer): string {
  // まず先頭を UTF-8 で読んで encoding 属性を調べる
  const headBytes = new Uint8Array(buffer.slice(0, 500));
  const headText = new TextDecoder('utf-8', { fatal: false }).decode(headBytes);
  
  let encoding = 'utf-8';
  if (/encoding=["'](shift[_-]?jis|sjis|cp932|windows-31j)["']/i.test(headText)) {
    encoding = 'shift-jis';
  } else if (/encoding=["'](euc-jp)["']/i.test(headText)) {
    encoding = 'euc-jp';
  }

  try {
    const decoder = new TextDecoder(encoding);
    return decoder.decode(buffer);
  } catch (e) {
    // フォールバック: shift-jis で試す
    try {
      return new TextDecoder('shift-jis').decode(buffer);
    } catch {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }
}

/**
 * 大文字・小文字を許容して子要素または子孫要素からテキストを取得
 */
export function getElementText(parent: Element, ...tagNames: string[]): string {
  for (const name of tagNames) {
    // Direct children first
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (child.tagName.toLowerCase() === name.toLowerCase()) {
        return child.textContent?.trim() || '';
      }
    }
    // Query selector fallback
    const el = parent.querySelector(name) || parent.querySelector(name.toLowerCase()) || parent.querySelector(name.toUpperCase());
    if (el && el.textContent) {
      return el.textContent.trim();
    }
  }
  return '';
}

/**
 * DOMParser を使って XML 文字列をパース
 */
export function parseXmlString(xmlString: string): Document {
  // DTD参照などが原因でブラウザでエラーになることがあるため、<!DOCTYPE ...> を一時的に除去またはサニタイズ
  const sanitized = xmlString.replace(/<!DOCTYPE[\s\S]*?>/i, '');
  const parser = new DOMParser();
  return parser.parseFromString(sanitized, 'text/xml');
}

/**
 * INDEX_C.XML または INDEX_D.XML のパース
 */
export function parseIndexXml(xmlString: string): ConstructionInfo {
  const doc = parseXmlString(xmlString);
  const root = doc.documentElement;

  const info: ConstructionInfo = {
    constructionName: getElementText(root, 'construction_name', 'CONSTRUCTION_NAME', 'title', 'TITLE') || '（名称未設定工事）',
    lineRiverName: getElementText(root, 'line_river_name', 'LINE_RIVER_NAME', 'route_name', 'ROUTE_NAME'),
    clientName: getElementText(root, 'client_name', 'CLIENT_NAME', 'orderer_name', 'ORDERER_NAME') || '広島県',
    contractorName: getElementText(root, 'contractor_name', 'CONTRACTOR_NAME', 'company_name', 'COMPANY_NAME') || '（施工業者未設定）',
    contractNumber: getElementText(root, 'contract_number', 'CONTRACT_NUMBER'),
    startDate: getElementText(root, 'start_date', 'START_DATE', 'term_start', 'TERM_START'),
    endDate: getElementText(root, 'end_date', 'END_DATE', 'term_end', 'TERM_END'),
    place: getElementText(root, 'place', 'PLACE', 'location', 'LOCATION'),
    supervisor: getElementText(root, 'supervisor', 'SUPERVISOR', 'inspector', 'INSPECTOR'),
    chiefEngineer: getElementText(root, 'chief_engineer', 'CHIEF_ENGINEER', 'engineer', 'ENGINEER'),
  };

  return info;
}

/**
 * PHOTO.XML のパース
 */
export function parsePhotoXml(xmlString: string): PhotoItem[] {
  const doc = parseXmlString(xmlString);
  const items: PhotoItem[] = [];

  const photoNodes = doc.querySelectorAll('photo_item, PHOTO_ITEM, photo, PHOTO');

  photoNodes.forEach((node, index) => {
    // 直下に要素があるか
    const id = getElementText(node, 'photo_id', 'PHOTO_ID', 'id', 'ID') || `PHOTO_${index + 1}`;
    const title = getElementText(node, 'photo_title', 'PHOTO_TITLE', 'title', 'TITLE') || `写真 ${index + 1}`;
    const category = getElementText(node, 'photo_category', 'PHOTO_CATEGORY', 'category', 'CATEGORY') || '施工中';
    const type = getElementText(node, 'photo_type', 'PHOTO_TYPE', 'type', 'TYPE') || '出来形管理';
    const workType = getElementText(node, 'work_type', 'WORK_TYPE') || '一般工種';
    const workKind = getElementText(node, 'work_kind', 'WORK_KIND') || '';
    const workDetail = getElementText(node, 'work_detail', 'WORK_DETAIL') || '';
    const date = getElementText(node, 'photo_date', 'PHOTO_DATE', 'date', 'DATE', 'shooting_date') || '';
    const time = getElementText(node, 'photo_time', 'PHOTO_TIME', 'time', 'TIME') || '';
    const station = getElementText(node, 'station', 'STATION', 'measure_point', 'MEASURE_POINT') || '';
    const remarks = getElementText(node, 'remarks', 'REMARKS', 'memo', 'MEMO', 'description') || '';
    const fileName = getElementText(node, 'file_name', 'FILE_NAME', 'filename', 'FILENAME') || '';

    // 電子黒板情報や設計値・実測値の抽出
    const blackboardItems: BlackboardItem[] = [];
    
    // 測点
    if (station) blackboardItems.push({ name: '測点', value: station });
    // 設計値・実測値のタグがある場合
    const designVal = getElementText(node, 'design_value', 'DESIGN_VALUE', 'plan_val');
    if (designVal) blackboardItems.push({ name: '設計値', value: designVal });
    const measuredVal = getElementText(node, 'measured_value', 'MEASURED_VALUE', 'actual_val');
    if (measuredVal) blackboardItems.push({ name: '実測値', value: measuredVal });
    
    // 子要素の黒板情報やテーブル情報
    const bbNodes = node.querySelectorAll('blackboard_item, item, info, ITEM, INFO');
    bbNodes.forEach(bb => {
      const n = getElementText(bb, 'name', 'NAME', 'item_name');
      const v = getElementText(bb, 'value', 'VALUE', 'item_value');
      if (n && v) {
        blackboardItems.push({ name: n, value: v });
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
 * REPORT.XML のパース
 */
export function parseReportXml(xmlString: string): ReportItem[] {
  const doc = parseXmlString(xmlString);
  const items: ReportItem[] = [];

  const reportNodes = doc.querySelectorAll('report_item, REPORT_ITEM, report, REPORT');

  reportNodes.forEach((node, index) => {
    const id = getElementText(node, 'report_id', 'REPORT_ID', 'id', 'ID') || `REP_${index + 1}`;
    const title = getElementText(node, 'report_title', 'REPORT_TITLE', 'title', 'TITLE') || `報告書 ${index + 1}`;
    const type = getElementText(node, 'report_type', 'REPORT_TYPE', 'type', 'TYPE') || '書類';
    const fileName = getElementText(node, 'file_name', 'FILE_NAME', 'filename', 'FILENAME') || '';
    const createDate = getElementText(node, 'create_date', 'CREATE_DATE', 'date', 'DATE') || '';
    const summary = getElementText(node, 'summary', 'SUMMARY', 'remarks', 'REMARKS') || '';

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
 * DRAWING.XML のパース
 */
export function parseDrawingXml(xmlString: string): DrawingItem[] {
  const doc = parseXmlString(xmlString);
  const items: DrawingItem[] = [];

  const drawingNodes = doc.querySelectorAll('drawing_item, DRAWING_ITEM, drawing, DRAWING');

  drawingNodes.forEach((node, index) => {
    const id = getElementText(node, 'drawing_id', 'DRAWING_ID', 'id', 'ID') || `DRW_${index + 1}`;
    const title = getElementText(node, 'drawing_title', 'DRAWING_TITLE', 'title', 'TITLE') || `図面 ${index + 1}`;
    const type = getElementText(node, 'drawing_type', 'DRAWING_TYPE', 'type', 'TYPE') || '完成図';
    const fileName = getElementText(node, 'file_name', 'FILE_NAME', 'filename', 'FILENAME') || '';
    const cadFileName = getElementText(node, 'cad_file_name', 'CAD_FILE_NAME', 'sxf_file') || '';
    const scale = getElementText(node, 'scale', 'SCALE') || '';

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
