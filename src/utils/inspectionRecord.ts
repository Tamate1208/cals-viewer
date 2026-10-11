import type { DrawingItem, InspectionRecord, PhotoItem, ReportItem } from '../types/cals';

/**
 * 写真アイテムから InspectionRecord のメタ情報・初期レコードを生成
 */
export function buildPhotoRecord(
  photo: PhotoItem,
  status: 'ok' | 'issue' | 'pending',
  notes = '',
  updatedAt?: string
): InspectionRecord {
  return {
    targetId: photo.id,
    targetType: 'photo',
    targetTitle: photo.title || photo.fileName,
    status,
    notes,
    updatedAt: updatedAt || new Date().toLocaleString('ja-JP'),
    fileName: photo.fileName,
    groupTitle: photo.workType || photo.category,
    fileRole: photo.workKind ? `${photo.workKind}${photo.workDetail ? ' / ' + photo.workDetail : ''}` : undefined,
    subCategory: photo.category,
    locationOrDate: [photo.station ? `測点: ${photo.station}` : '', photo.date ? `撮影: ${photo.date}` : ''].filter(Boolean).join(' | '),
  };
}

/**
 * 報告書類アイテムから InspectionRecord を生成
 */
export function buildReportRecord(
  report: ReportItem,
  status: 'ok' | 'issue' | 'pending',
  notes = '',
  updatedAt?: string
): InspectionRecord {
  return {
    targetId: report.id,
    targetType: 'report',
    targetTitle: report.title || report.fileName,
    status,
    notes,
    updatedAt: updatedAt || new Date().toLocaleString('ja-JP'),
    fileName: report.fileName,
    groupTitle: report.groupTitle || report.type,
    fileRole: report.fileRole,
    subCategory: report.type,
    locationOrDate: report.createDate,
  };
}

/**
 * 図面アイテムから InspectionRecord を生成
 */
export function buildDrawingRecord(
  drawing: DrawingItem,
  status: 'ok' | 'issue' | 'pending',
  notes = '',
  updatedAt?: string
): InspectionRecord {
  return {
    targetId: drawing.id,
    targetType: 'drawing',
    targetTitle: drawing.title || drawing.fileName,
    status,
    notes,
    updatedAt: updatedAt || new Date().toLocaleString('ja-JP'),
    fileName: drawing.fileName,
    groupTitle: drawing.type,
    fileRole: drawing.scale ? `縮尺: ${drawing.scale}` : undefined,
    subCategory: drawing.type,
  };
}

/**
 * 既存レコードに欠損しているメタ情報がある場合、マスターデータから補完
 */
export function resolveRecordMeta(
  r: InspectionRecord,
  reports: ReportItem[] = [],
  drawings: DrawingItem[] = [],
  photos: PhotoItem[] = []
): {
  fileName?: string;
  groupTitle?: string;
  fileRole?: string;
  subCategory?: string;
  locationOrDate?: string;
} {
  let fileName = r.fileName;
  let groupTitle = r.groupTitle;
  let fileRole = r.fileRole;
  let subCategory = r.subCategory;
  let locationOrDate = r.locationOrDate;

  if (r.targetType === 'report') {
    const doc = reports.find(d => d.id === r.targetId);
    if (doc) {
      fileName = fileName || doc.fileName;
      groupTitle = groupTitle || doc.groupTitle || doc.type;
      fileRole = fileRole || doc.fileRole;
      subCategory = subCategory || doc.type;
      locationOrDate = locationOrDate || doc.createDate;
    }
  } else if (r.targetType === 'drawing') {
    const dwg = drawings.find(d => d.id === r.targetId);
    if (dwg) {
      fileName = fileName || dwg.fileName;
      groupTitle = groupTitle || dwg.type;
      fileRole = fileRole || (dwg.scale ? `縮尺: ${dwg.scale}` : undefined);
      subCategory = subCategory || dwg.type;
    }
  } else if (r.targetType === 'photo') {
    const pic = photos.find(p => p.id === r.targetId);
    if (pic) {
      fileName = fileName || pic.fileName;
      groupTitle = groupTitle || pic.workType || pic.category;
      fileRole = fileRole || (pic.workKind ? `${pic.workKind}${pic.workDetail ? ' / ' + pic.workDetail : ''}` : undefined);
      subCategory = subCategory || pic.category;
      locationOrDate = locationOrDate || [pic.station ? `測点: ${pic.station}` : '', pic.date ? `撮影: ${pic.date}` : ''].filter(Boolean).join(' | ');
    }
  }

  return { fileName, groupTitle, fileRole, subCategory, locationOrDate };
}

// ==================== localStorage 入出力 ====================

export function getStorageKey(constructionName: string): string {
  return `cals_inspection_${constructionName}`;
}

export function loadStoredRecords(constructionName: string): Record<string, InspectionRecord> | null {
  try {
    const saved = localStorage.getItem(getStorageKey(constructionName));
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (isValidInspectionBackup(parsed)) {
      return parsed;
    }
    return null;
  } catch (e) {
    console.warn('localStorage load failed:', e);
    return null;
  }
}

export function saveStoredRecords(constructionName: string, records: Record<string, InspectionRecord>): void {
  try {
    localStorage.setItem(getStorageKey(constructionName), JSON.stringify(records));
  } catch (e) {
    console.warn('localStorage save failed:', e);
  }
}

export function clearStoredRecords(constructionName: string): void {
  try {
    localStorage.removeItem(getStorageKey(constructionName));
  } catch (e) {
    console.warn('localStorage remove failed:', e);
  }
}

// ==================== バックアップJSONの型検証 ====================

export function isValidInspectionBackup(obj: unknown): obj is Record<string, InspectionRecord> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  for (const [_, v] of Object.entries(obj)) {
    if (!v || typeof v !== 'object') return false;
    const rec = v as Partial<InspectionRecord>;
    if (typeof rec.targetId !== 'string' || typeof rec.targetType !== 'string' || typeof rec.status !== 'string') {
      return false;
    }
  }
  return true;
}
