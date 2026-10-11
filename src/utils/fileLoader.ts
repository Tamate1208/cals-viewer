import JSZip from 'jszip';
import type { DeliveryDataset, DrawingItem, PhotoItem, ReportItem } from '../types/cals';
import { decodeXmlBuffer, parseDrawingXml, parseIndexXml, parsePhotoXml, parseReportXml } from './xmlParser';

interface FileItem {
  name: string;
  relativePath: string;
  blob: Blob;
}

/**
 * 高速ルックアップインデックス
 * 数千ファイルあっても O(1) で即座に検索可能
 */
class FastFileIndex {
  private exactPathMap = new Map<string, FileItem>();
  private fileNameMap = new Map<string, FileItem[]>();
  public xmlItems: FileItem[] = [];

  constructor(items: FileItem[]) {
    for (const item of items) {
      const relLower = item.relativePath.toLowerCase();
      const nameLower = item.name.toLowerCase();

      // パスマップ
      this.exactPathMap.set(relLower, item);

      // ファイルネームマップ
      const existing = this.fileNameMap.get(nameLower);
      if (existing) {
        existing.push(item);
      } else {
        this.fileNameMap.set(nameLower, [item]);
      }

      // XMLファイルは別途高速キャッシュ
      if (nameLower.endsWith('.xml')) {
        this.xmlItems.push(item);
      }
    }
  }

  /**
   * 指定名のXMLアイテムを高速取得 (大文字小文字無視、パス後方一致)
   */
  public findXml(targetName: string): FileItem[] {
    const targetLower = targetName.toLowerCase();
    const result: FileItem[] = [];
    for (const item of this.xmlItems) {
      if (item.name.toLowerCase() === targetLower || item.relativePath.toLowerCase().endsWith('/' + targetLower)) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * ファイル名およびフォルダヒントから Blob URL を O(1) 瞬時解決
   */
  public resolveBlobUrl(fileName: string, folderHint?: string, basePrefix?: string): string | undefined {
    if (!fileName) return undefined;
    const cleanName = fileName.trim().replace(/^[\/\\]+/, '').toLowerCase();

    // 1. basePrefix + folderHint + cleanName (例: "photo/pic00001.jpg")
    if (basePrefix && folderHint) {
      const p1 = `${basePrefix}${folderHint.toLowerCase()}/${cleanName}`;
      const item1 = this.exactPathMap.get(p1);
      if (item1) return URL.createObjectURL(item1.blob);

      // サブフォルダ (例: "photo/pic/pic00001.jpg" や "report/org/rep00001.pdf")
      const p2 = `${basePrefix}${folderHint.toLowerCase()}/pic/${cleanName}`;
      const item2 = this.exactPathMap.get(p2);
      if (item2) return URL.createObjectURL(item2.blob);

      const p3 = `${basePrefix}${folderHint.toLowerCase()}/org/${cleanName}`;
      const item3 = this.exactPathMap.get(p3);
      if (item3) return URL.createObjectURL(item3.blob);
    }

    // 2. フォルダヒント付きパス (basePrefixなし)
    if (folderHint) {
      const p4 = `${folderHint.toLowerCase()}/${cleanName}`;
      const item4 = this.exactPathMap.get(p4);
      if (item4) return URL.createObjectURL(item4.blob);
    }

    // 3. ファイル名での一意マッチ
    const matches = this.fileNameMap.get(cleanName);
    if (matches && matches.length > 0) {
      if (matches.length === 1) {
        return URL.createObjectURL(matches[0].blob);
      }
      // 複数ある場合はフォルダヒントを含むものを優先
      if (folderHint) {
        const hintLower = folderHint.toLowerCase();
        const preferred = matches.find(m => m.relativePath.toLowerCase().includes(hintLower));
        if (preferred) return URL.createObjectURL(preferred.blob);
      }
      return URL.createObjectURL(matches[0].blob);
    }

    return undefined;
  }

  /**
   * 画像拡張子（.jpg, .jpeg, .png）のファイルを抽出（XMLがない場合のフォールバック）
   */
  public getImageItems(): FileItem[] {
    const list: FileItem[] = [];
    for (const [_, items] of this.fileNameMap) {
      for (const item of items) {
        if (/\.(jpe?g|png|webp)$/i.test(item.name)) {
          list.push(item);
        }
      }
    }
    return list;
  }

  /**
   * PDFファイルを抽出（XMLがない場合のフォールバック）
   */
  public getPdfItems(excludeDrawing = true): FileItem[] {
    const list: FileItem[] = [];
    for (const [_, items] of this.fileNameMap) {
      for (const item of items) {
        if (item.name.toLowerCase().endsWith('.pdf')) {
          const isDrawing = item.relativePath.toLowerCase().includes('drawing');
          if (excludeDrawing ? !isDrawing : isDrawing) {
            list.push(item);
          }
        }
      }
    }
    return list;
  }
}

/**
 * ディレクトリから高速読み込み
 */
export async function loadFromDirectory(
  fileList: FileList,
  onProgress?: (status: string) => void
): Promise<DeliveryDataset> {
  onProgress?.(`全 ${fileList.length} 件のファイルをインデックス化中...`);

  const items: FileItem[] = [];
  let rootFolderName = '電子納品フォルダ';

  const len = fileList.length;
  for (let i = 0; i < len; i++) {
    const file = fileList[i];
    const path = (file as any).webkitRelativePath || file.name;
    const parts = path.split('/');
    if (parts.length > 1 && rootFolderName === '電子納品フォルダ') {
      rootFolderName = parts[0];
    }
    items.push({
      name: file.name,
      relativePath: path.replace(/^[^\/]+\//, ''), // トップフォルダ名を除去
      blob: file,
    });
  }

  const index = new FastFileIndex(items);
  return processIndex(index, rootFolderName, onProgress);
}

/**
 * ZIPファイルから高速読み込み
 */
export async function loadFromZip(
  zipFile: File,
  onProgress?: (status: string) => void
): Promise<DeliveryDataset> {
  onProgress?.('ZIPアーカイブを展開中...');
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(zipFile);
  const items: FileItem[] = [];

  const entries = Object.entries(loadedZip.files);
  onProgress?.(`全 ${entries.length} 件のエントリを展開中...`);

  for (const [relativePath, zipEntry] of entries) {
    if (zipEntry.dir) continue;
    const blob = await zipEntry.async('blob');
    const name = relativePath.split('/').pop() || relativePath;
    items.push({
      name,
      relativePath,
      blob,
    });
  }

  const rootFolderName = zipFile.name.replace(/\.zip$/i, '');
  const index = new FastFileIndex(items);
  return processIndex(index, rootFolderName, onProgress);
}

/**
 * FastFileIndex から CALS データを構築（ミリ秒単位で完了）
 */
async function processIndex(
  index: FastFileIndex,
  folderName: string,
  onProgress?: (status: string) => void
): Promise<DeliveryDataset> {
  onProgress?.('INDEX_C.XML を解析中...');

  // 1. INDEX_C.XML または INDEX_D.XML の探索
  let constructionInfo = {
    constructionName: folderName,
    lineRiverName: '',
    clientName: '広島県',
    contractorName: '',
  };

  const indexEntries = index.findXml('INDEX_C.XML').concat(index.findXml('INDEX_D.XML'));
  let basePrefix = '';

  if (indexEntries.length > 0) {
    const primaryIndex = indexEntries[0];
    const buffer = await primaryIndex.blob.arrayBuffer();
    const xmlText = decodeXmlBuffer(buffer);
    constructionInfo = parseIndexXml(xmlText);

    if (!constructionInfo.constructionName || constructionInfo.constructionName === '（名称未設定工事）') {
      constructionInfo.constructionName = folderName;
    }

    const lastSlash = primaryIndex.relativePath.lastIndexOf('/');
    if (lastSlash >= 0) {
      basePrefix = primaryIndex.relativePath.substring(0, lastSlash + 1).toLowerCase();
    }
  }

  // 2. PHOTO.XML の解析
  onProgress?.('工事写真XML (PHOTO.XML) を高速解析中...');
  let photos: PhotoItem[] = [];
  const photoXmlEntries = index.findXml('PHOTO.XML');

  if (photoXmlEntries.length > 0) {
    for (const entry of photoXmlEntries) {
      try {
        const buffer = await entry.blob.arrayBuffer();
        const xmlText = decodeXmlBuffer(buffer);
        photos.push(...parsePhotoXml(xmlText));
      } catch (e) {
        console.warn('PHOTO.XML parse failed:', e);
      }
    }

    // 重複IDの解決 & Blob URL O(1) 紐付け
    const idSet = new Set<string>();
    const photoCount = photos.length;
    for (let i = 0; i < photoCount; i++) {
      const p = photos[i];
      if (idSet.has(p.id)) {
        p.id = `${p.id}_${i + 1}`;
      }
      idSet.add(p.id);
      p.fileUrl = index.resolveBlobUrl(p.fileName, 'PHOTO', basePrefix);
    }
  } else {
    // フォールバック: 画像ファイルから生成
    const imageItems = index.getImageItems();
    photos = imageItems.map((img, idx) => ({
      id: `IMG_${idx + 1}`,
      title: img.name,
      category: '施工中',
      type: '工事写真',
      workType: '写真データ',
      workKind: '',
      workDetail: '',
      date: '',
      fileName: img.name,
      filePath: img.relativePath,
      fileUrl: URL.createObjectURL(img.blob),
      blackboardItems: [],
    }));
  }

  // 3. REPORT.XML の解析
  onProgress?.('報告書類XML (REPORT.XML) を解析中...');
  let reports: ReportItem[] = [];
  const reportXmlEntries = index.findXml('REPORT.XML');

  if (reportXmlEntries.length > 0) {
    for (const entry of reportXmlEntries) {
      try {
        const buffer = await entry.blob.arrayBuffer();
        const xmlText = decodeXmlBuffer(buffer);
        reports.push(...parseReportXml(xmlText));
      } catch (e) {
        console.warn('REPORT.XML parse failed:', e);
      }
    }

    const idSet = new Set<string>();
    const repCount = reports.length;
    for (let i = 0; i < repCount; i++) {
      const r = reports[i];
      if (idSet.has(r.id)) {
        r.id = `${r.id}_${i + 1}`;
      }
      idSet.add(r.id);
      r.fileUrl = index.resolveBlobUrl(r.fileName, 'REPORT', basePrefix);
    }
  } else {
    const pdfItems = index.getPdfItems(true);
    reports = pdfItems.map((pdf, idx) => ({
      id: `REP_${idx + 1}`,
      title: pdf.name.replace(/\.pdf$/i, ''),
      type: '報告書類',
      fileName: pdf.name,
      filePath: pdf.relativePath,
      fileUrl: URL.createObjectURL(pdf.blob),
    }));
  }

  // 4. DRAWING.XML の解析
  onProgress?.('完成図面XML (DRAWING.XML) を解析中...');
  let drawings: DrawingItem[] = [];
  const drawingXmlEntries = index.findXml('DRAWING.XML');

  if (drawingXmlEntries.length > 0) {
    for (const entry of drawingXmlEntries) {
      try {
        const buffer = await entry.blob.arrayBuffer();
        const xmlText = decodeXmlBuffer(buffer);
        drawings.push(...parseDrawingXml(xmlText));
      } catch (e) {
        console.warn('DRAWING.XML parse failed:', e);
      }
    }

    const idSet = new Set<string>();
    const drwCount = drawings.length;
    for (let i = 0; i < drwCount; i++) {
      const d = drawings[i];
      if (idSet.has(d.id)) {
        d.id = `${d.id}_${i + 1}`;
      }
      idSet.add(d.id);
      d.fileUrl = index.resolveBlobUrl(d.fileName, 'DRAWING', basePrefix);
    }
  } else {
    const drawingPdfItems = index.getPdfItems(false);
    drawings = drawingPdfItems.map((pdf, idx) => ({
      id: `DRW_${idx + 1}`,
      title: pdf.name.replace(/\.pdf$/i, ''),
      type: '完成図面',
      fileName: pdf.name,
      filePath: pdf.relativePath,
      fileUrl: URL.createObjectURL(pdf.blob),
    }));
  }

  onProgress?.('解析完了！画面を描画しています...');

  return {
    constructionInfo,
    photos,
    reports,
    drawings,
    otherFiles: [], // 無駄なBlob生成を完全廃止
    loadedAt: new Date().toLocaleString('ja-JP'),
    folderName,
  };
}
