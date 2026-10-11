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
      // パス区切りを '/' に正規化
      const normalizedPath = item.relativePath.replace(/\\/g, '/').toLowerCase();
      const nameLower = item.name.toLowerCase();

      // パスマップ
      this.exactPathMap.set(normalizedPath, item);

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
   * 指定名のXMLアイテムを高速取得
   */
  public findXml(...targetNames: string[]): FileItem[] {
    const targets = targetNames.map(t => t.toLowerCase());
    const result: FileItem[] = [];
    for (const item of this.xmlItems) {
      const nameLower = item.name.toLowerCase();
      const relLower = item.relativePath.replace(/\\/g, '/').toLowerCase();
      for (const t of targets) {
        if (nameLower === t || relLower.endsWith('/' + t)) {
          if (!result.includes(item)) {
            result.push(item);
          }
        }
      }
    }
    return result;
  }

  /**
   * 正規表現パターンでXMLファイルを探索（例: /^(photo|meet|plan).*\.xml$/i）
   */
  public findXmlByPattern(pattern: RegExp): FileItem[] {
    const result: FileItem[] = [];
    for (const item of this.xmlItems) {
      const name = item.name;
      const rel = item.relativePath.replace(/\\/g, '/');
      if (pattern.test(name) || pattern.test(rel)) {
        if (!result.includes(item)) {
          result.push(item);
        }
      }
    }
    return result;
  }

  /**
   * ファイル名およびフォルダヒントから Blob URL を O(1) 瞬時解決
   * (PHOTO/PIC/PXXXXXXX.JPG, MEET/ORG/MXXXX.PDF, DRAWINGF/*.P21 等の深い階層も確実に捕捉)
   */
  public resolveBlobUrl(fileName: string, folderHint?: string, basePrefix?: string): string | undefined {
    if (!fileName) return undefined;
    const rawClean = fileName.trim().replace(/^[/\\]+/, '').replace(/\\/g, '/').replace(/^\.\//, '');
    const baseFileName = (rawClean.split('/').pop() || rawClean).toLowerCase();
    const cleanPath = rawClean.toLowerCase();

    // 1. パスマップでの探索 (basePrefix + folderHint + パスバリエーション)
    const prefixes = [basePrefix ? basePrefix.replace(/\\/g, '/').toLowerCase() : '', ''];
    const hints = folderHint ? [folderHint.toLowerCase(), ''] : [''];
    const subDirs = ['', 'pic/', 'org/', 'org001/', 'org002/', 'dra/', 'pdf/'];

    // 拡張子バリエーション (.jpg <-> .jpeg 等)
    const fileNameVariations = [baseFileName];
    if (baseFileName.endsWith('.jpg')) {
      fileNameVariations.push(baseFileName.replace(/\.jpg$/, '.jpeg'));
    } else if (baseFileName.endsWith('.jpeg')) {
      fileNameVariations.push(baseFileName.replace(/\.jpeg$/, '.jpg'));
    }

    for (const pfx of prefixes) {
      for (const h of hints) {
        for (const sub of subDirs) {
          for (const fn of fileNameVariations) {
            const tryPath = `${pfx}${h ? h + '/' : ''}${sub}${fn}`;
            const found = this.exactPathMap.get(tryPath);
            if (found) return URL.createObjectURL(found.blob);
          }
        }
      }
    }

    // 2. 指定された cleanPath そのもののマッチ
    if (basePrefix) {
      const tryWithPrefix = `${basePrefix.replace(/\\/g, '/').toLowerCase()}${cleanPath}`;
      const found = this.exactPathMap.get(tryWithPrefix);
      if (found) return URL.createObjectURL(found.blob);
    }
    const foundDirect = this.exactPathMap.get(cleanPath);
    if (foundDirect) return URL.createObjectURL(foundDirect.blob);

    // 3. 純粋なファイル名でのマッチ (fileNameMap)
    for (const fn of fileNameVariations) {
      const matches = this.fileNameMap.get(fn);
      if (matches && matches.length > 0) {
        if (matches.length === 1) {
          return URL.createObjectURL(matches[0].blob);
        }
        // 複数ある場合はフォルダヒントを含むものを最優先
        if (folderHint) {
          const hintLower = folderHint.toLowerCase();
          const preferred = matches.find(m => m.relativePath.toLowerCase().includes(hintLower));
          if (preferred) return URL.createObjectURL(preferred.blob);
        }
        return URL.createObjectURL(matches[0].blob);
      }
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
          const isDrawing = item.relativePath.toLowerCase().includes('drawing') || item.relativePath.toLowerCase().includes('dra');
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
      relativePath: path.replace(/^[^/]+\//, ''), // トップフォルダ名を除去
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
  onProgress?.('管理ファイル (INDEX_C.XML / INDEX_D.XML) を解析中...');

  // 1. INDEX_C.XML または INDEX_D.XML の探索
  let constructionInfo = {
    constructionName: folderName,
    lineRiverName: '',
    clientName: '広島県',
    contractorName: '',
    contractNumber: '',
    startDate: '',
    endDate: '',
    place: '',
    supervisor: '',
    chiefEngineer: '',
  };

  let indexEntries = index.findXml('INDEX_C.XML', 'INDEX_D.XML', 'INDEX.XML', 'INDEX_M.XML');
  if (indexEntries.length === 0) {
    indexEntries = index.findXmlByPattern(/^index.*\.xml$/i);
  }

  let basePrefix = '';

  if (indexEntries.length > 0) {
    // 複数の INDEX XML（工事写真側・成果品側など）を統合
    for (const entry of indexEntries) {
      try {
        const buffer = await entry.blob.arrayBuffer();
        const xmlText = decodeXmlBuffer(buffer);
        const parsed = parseIndexXml(xmlText);
        console.info(`INDEX XML (${entry.relativePath}) parsed:`, parsed);

        // より詳しい情報で更新
        if (parsed.constructionName && parsed.constructionName !== '（名称未設定工事）') {
          constructionInfo.constructionName = parsed.constructionName;
        }
        if (parsed.lineRiverName) constructionInfo.lineRiverName = parsed.lineRiverName;
        if (parsed.clientName && parsed.clientName !== '広島県') constructionInfo.clientName = parsed.clientName;
        if (parsed.contractorName && parsed.contractorName !== '（施工業者未設定）') constructionInfo.contractorName = parsed.contractorName;
        if (parsed.contractNumber) constructionInfo.contractNumber = parsed.contractNumber;
        if (parsed.startDate) constructionInfo.startDate = parsed.startDate;
        if (parsed.endDate) constructionInfo.endDate = parsed.endDate;
        if (parsed.place) constructionInfo.place = parsed.place;
        if (parsed.supervisor) constructionInfo.supervisor = parsed.supervisor;
        if (parsed.chiefEngineer) constructionInfo.chiefEngineer = parsed.chiefEngineer;

        const lastSlash = entry.relativePath.lastIndexOf('/');
        if (lastSlash >= 0 && !basePrefix) {
          basePrefix = entry.relativePath.substring(0, lastSlash + 1).toLowerCase();
        }
      } catch (e) {
        console.warn('INDEX XML parse failed:', e);
      }
    }
  }

  // 2. PHOTO_C.XML / PHOTO.XML / PHOTO_D.XML の解析
  onProgress?.('工事写真XML (PHOTO_C.XML / PHOTO.XML) を解析中...');
  let photos: PhotoItem[] = [];
  let photoXmlEntries = index.findXml('PHOTO_C.XML', 'PHOTO.XML', 'PHOTO_D.XML', 'PHOTO_M.XML');
  if (photoXmlEntries.length === 0) {
    photoXmlEntries = index.findXmlByPattern(/^photo.*\.xml$/i);
  }

  if (photoXmlEntries.length > 0) {
    for (const entry of photoXmlEntries) {
      try {
        const buffer = await entry.blob.arrayBuffer();
        const xmlText = decodeXmlBuffer(buffer);
        const parsed = parsePhotoXml(xmlText);
        console.info(`PHOTO XML (${entry.relativePath}) parsed count:`, parsed.length);
        photos.push(...parsed);
      } catch (e) {
        console.warn('PHOTO XML parse failed:', e);
      }
    }

    // 重複IDの解決 & Blob URL O(1) 紐付け & ツリー用データのサニタイズ
    const idSet = new Set<string>();
    const photoCount = photos.length;
    for (let i = 0; i < photoCount; i++) {
      const p = photos[i];
      if (idSet.has(p.id)) {
        p.id = `${p.id}_${i + 1}`;
      }
      idSet.add(p.id);

      // 工種や区分の空欄補完（ツリーが崩れないように）
      if (!p.workType || p.workType.trim() === '') {
        p.workType = p.type || '一般工種';
      }
      if (!p.category || p.category.trim() === '') {
        p.category = '施工中';
      }

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

  // 3. 報告書類XML (REPORT.XML, MEET.XML, PLAN.XML, OTHRS.XML) の解析
  onProgress?.('報告書類XML (MEET.XML / PLAN.XML / OTHRS.XML / REPORT.XML) を解析中...');
  let reports: ReportItem[] = [];
  let reportXmlEntries = index.findXml(
    'REPORT_C.XML', 
    'REPORT.XML', 
    'REPORT_D.XML', 
    'MEET_C.XML', 
    'MEET.XML', 
    'MEET_D.XML', 
    'PLAN_C.XML', 
    'PLAN.XML', 
    'PLAN_D.XML',
    'OTHRS_C.XML',
    'OTHRS.XML',
    'OTHRS_D.XML'
  );
  if (reportXmlEntries.length === 0) {
    reportXmlEntries = index.findXmlByPattern(/^(report|meet|plan|othrs).*\.xml$/i);
  }

  if (reportXmlEntries.length > 0) {
    for (const entry of reportXmlEntries) {
      try {
        const buffer = await entry.blob.arrayBuffer();
        const xmlText = decodeXmlBuffer(buffer);
        const parsed = parseReportXml(xmlText);
        console.info(`REPORT XML (${entry.relativePath}) parsed count:`, parsed.length);
        reports.push(...parsed);
      } catch (e) {
        console.warn('REPORT XML parse failed:', e);
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

  // 4. DRAWING_C.XML / DRAWING.XML / DRAWINGF.XML / DRAWINGS.XML の解析
  onProgress?.('完成図面XML (DRAWINGF.XML / DRAWING_C.XML) を解析中...');
  let drawings: DrawingItem[] = [];
  let drawingXmlEntries = index.findXml(
    'DRAWINGF.XML', 
    'DRAWINGS.XML', 
    'DRAWING_C.XML', 
    'DRAWING.XML', 
    'DRAWING_D.XML',
    'DRAWING_M.XML'
  );
  if (drawingXmlEntries.length === 0) {
    drawingXmlEntries = index.findXmlByPattern(/^(drawing|draw).*\.xml$/i);
  }

  if (drawingXmlEntries.length > 0) {
    for (const entry of drawingXmlEntries) {
      try {
        const buffer = await entry.blob.arrayBuffer();
        const xmlText = decodeXmlBuffer(buffer);
        const parsed = parseDrawingXml(xmlText);
        console.info(`DRAWING XML (${entry.relativePath}) parsed count:`, parsed.length);
        drawings.push(...parsed);
      } catch (e) {
        console.warn('DRAWING XML parse failed:', e);
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
    otherFiles: [],
    loadedAt: new Date().toLocaleString('ja-JP'),
    folderName,
  };
}
