import type { ConstructionInfo, DrawingItem, InspectionRecord, PhotoItem, ReportItem } from '../types/cals';

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

/**
 * 工事名 ＋ 工事番号/設計書コード（契約番号）等による一意キーの生成
 */
export function getStorageKey(target: ConstructionInfo | string): string {
  if (typeof target === 'string') {
    return `cals_inspection_${target.trim()}`;
  }
  const name = target.constructionName.trim();
  // 1. 工事番号 または 設計書コード（contractNumber に格納）
  const code = (target.contractNumber || '').trim();
  // 2. コードが未設定の場合のフォールバック（工期開始日 または 発注者名）
  const fallback = !code ? (target.startDate || target.clientName || '').trim() : '';

  const suffix = code || fallback;
  return suffix ? `cals_inspection_${name}_${suffix}` : `cals_inspection_${name}`;
}

/**
 * 旧仕様のキー（工事名のみ）を取得（互換性マイグレーション用）
 */
export function getLegacyStorageKey(target: ConstructionInfo | string): string {
  const name = typeof target === 'string' ? target.trim() : target.constructionName.trim();
  return `cals_inspection_${name}`;
}

export function loadStoredRecords(target: ConstructionInfo | string): Record<string, InspectionRecord> | null {
  try {
    const newKey = getStorageKey(target);
    const saved = localStorage.getItem(newKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (isValidInspectionBackup(parsed)) {
        return parsed;
      }
    }

    // 新キーで見つからない場合、旧キー（工事名のみ）からマイグレーション探索
    const legacyKey = getLegacyStorageKey(target);
    if (legacyKey !== newKey) {
      const legacySaved = localStorage.getItem(legacyKey);
      if (legacySaved) {
        const parsed = JSON.parse(legacySaved);
        if (isValidInspectionBackup(parsed)) {
          // 新キーに移行保存
          localStorage.setItem(newKey, legacySaved);
          // 旧キーを整理
          localStorage.removeItem(legacyKey);
          return parsed;
        }
      }
    }

    return null;
  } catch (e) {
    console.warn('localStorage load failed:', e);
    return null;
  }
}

export function saveStoredRecords(target: ConstructionInfo | string, records: Record<string, InspectionRecord>): void {
  try {
    const key = getStorageKey(target);
    localStorage.setItem(key, JSON.stringify(records));
  } catch (e) {
    console.warn('localStorage save failed:', e);
  }
}

export function clearStoredRecords(target: ConstructionInfo | string): void {
  try {
    const newKey = getStorageKey(target);
    localStorage.removeItem(newKey);
    const legacyKey = getLegacyStorageKey(target);
    if (legacyKey !== newKey) {
      localStorage.removeItem(legacyKey);
    }
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
