import JSZip from 'jszip';
import type { DeliveryDataset, DrawingItem, PhotoItem, ReportItem } from '../types/cals';
import {
  decodeXmlBuffer,
  parseConsignmentBoringXml,
  parseConsignmentIndexXml,
  parseConsignmentPhotoXml,
  parseConsignmentReportXml,
  parseDrawingXml,
  parseIndexXml,
  parsePhotoXml,
  parseReportXml,
} from './xmlParser';

interface FileItem {
  name: string;
  relativePath: string;
  blob: Blob;
}

// 開発環境（Vite dev）でのみデバッグ情報をコンソール出力
function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.info(...args);
  }
}

/**
 * 高速ルックアップインデックス
 * 数千ファイルあっても O(1) で即座に検索可能
 */
class FastFileIndex {
  private exactPathMap = new Map<string, FileItem>();
  private fileNameMap = new Map<string, FileItem[]>();
  // 末尾サフィックス（8文字）による高速索引（末尾8文字 -> [{ key, items, order }]）
  private suffixMap = new Map<string, { key: string; items: FileItem[]; order: number }[]>();
  private allKeyEntries: { key: string; items: FileItem[]; order: number }[] = [];
  public xmlItems: FileItem[] = [];
  // 同一 Blob に対する Blob URL の重複発行を防ぐキャッシュ
  private urlCache = new Map<Blob, string>();

  /**
   * Blob から Blob URL を取得（同一 Blob には同じ URL を返す）
   */
  public toUrl(blob: Blob): string {
    let url = this.urlCache.get(blob);
    if (!url) {
      url = URL.createObjectURL(blob);
      this.urlCache.set(blob, url);
    }
    return url;
  }

  constructor(items: FileItem[]) {
    let order = 0;
    for (const item of items) {
      // パス区切りを '/' に正規化
      const normalizedPath = item.relativePath.replace(/\\/g, '/').toLowerCase();
      const nameLower = item.name.toLowerCase();

      // パスマップ
      this.exactPathMap.set(normalizedPath, item);

      // ファイルネームマップ & サフィックス索引
      let existing = this.fileNameMap.get(nameLower);
      if (existing) {
        existing.push(item);
      } else {
        existing = [item];
        this.fileNameMap.set(nameLower, existing);
        const entry = { key: nameLower, items: existing, order: order++ };
        this.allKeyEntries.push(entry);

        if (nameLower.length >= 8) {
          const suffix = nameLower.slice(-8);
          let sList = this.suffixMap.get(suffix);
          if (!sList) {
            sList = [];
            this.suffixMap.set(suffix, sList);
          }
          sList.push(entry);
        }
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
    const subDirs = ['', 'pic/', 'org/', 'org001/', 'org002/', 'dra/', 'pdf/', 'log/', 'data/'];

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
            if (found) return this.toUrl(found.blob);
          }
        }
      }
    }

    // 2. 指定された cleanPath そのもののマッチ
    if (basePrefix) {
      const tryWithPrefix = `${basePrefix.replace(/\\/g, '/').toLowerCase()}${cleanPath}`;
      const found = this.exactPathMap.get(tryWithPrefix);
      if (found) return this.toUrl(found.blob);
    }
    const foundDirect = this.exactPathMap.get(cleanPath);
    if (foundDirect) return this.toUrl(foundDirect.blob);

    // 3. 純粋なファイル名でのマッチ (fileNameMap)
    for (const fn of fileNameVariations) {
      const matches = this.fileNameMap.get(fn);
      if (matches && matches.length > 0) {
        if (matches.length === 1) {
          return this.toUrl(matches[0].blob);
        }
        // 複数ある場合はフォルダヒントを含むものを最優先
        if (folderHint) {
          const hintLower = folderHint.toLowerCase();
          const preferred = matches.find(m => m.relativePath.toLowerCase().includes(hintLower));
          if (preferred) return this.toUrl(preferred.blob);
        }
        return this.toUrl(matches[0].blob);
      }
    }

    // 4. プレフィックス付きファイル名の解決 (例: 「【設計報告書】REPORT05.PDF」等)
    const canUseSuffix = fileNameVariations.every(fn => fn.length >= 8);
    let candidates: { key: string; items: FileItem[]; order: number }[];

    if (canUseSuffix) {
      if (fileNameVariations.length === 1) {
        candidates = this.suffixMap.get(fileNameVariations[0].slice(-8)) || [];
      } else {
        const seen = new Set<string>();
        const merged: { key: string; items: FileItem[]; order: number }[] = [];
        for (const fn of fileNameVariations) {
          const list = this.suffixMap.get(fn.slice(-8));
          if (list) {
            for (const item of list) {
              if (!seen.has(item.key)) {
                seen.add(item.key);
                merged.push(item);
              }
            }
          }
        }
        merged.sort((a, b) => a.order - b.order);
        candidates = merged;
      }
    } else {
      candidates = this.allKeyEntries;
    }

    for (const { key, items } of candidates) {
      for (const fn of fileNameVariations) {
        if (key.endsWith(fn)) {
          if (folderHint) {
            const hintLower = folderHint.toLowerCase();
            const preferred = items.find(m => m.relativePath.toLowerCase().includes(hintLower));
            if (preferred) return this.toUrl(preferred.blob);
          }
          if (items.length > 0) return this.toUrl(items[0].blob);
        }
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

export interface DroppedFileEntry {
  file: File;
  relativePath: string;
}

/**
 * DataTransferItemList または同期抽出済みエントリ配列 (ドラッグ＆ドロップ) から再帰的に全ファイルを走査・収集
 * Chrome推奨の FileSystem Access API (getAsFileSystemHandle) と Safari等の webkitGetAsEntry に両対応
 */
export async function scanDroppedDirectory(
  source: DataTransferItemList | any[],
  onProgress?: (status: string) => void
): Promise<DroppedFileEntry[]> {
  const result: DroppedFileEntry[] = [];
  let scannedCount = 0;

  const notifyCount = () => {
    scannedCount++;
    if (scannedCount % 50 === 0) {
      onProgress?.(`フォルダ内を走査中... (${scannedCount} 件検出)`);
    }
  };

  // 1. DataTransferItemList の場合、同期的に handles または webkitEntries を即時抽出
  const handles: any[] = [];
  const webkitEntries: any[] = [];

  if (source && typeof (source as any).length === 'number') {
    for (let i = 0; i < (source as any).length; i++) {
      const item = (source as any)[i];
      // FileSystem Access API (Chrome 86+)
      if (typeof item.getAsFileSystemHandle === 'function') {
        try {
          const handlePromise = item.getAsFileSystemHandle();
          if (handlePromise) handles.push(handlePromise);
        } catch {
          // ignore
        }
      }
      // webkitGetAsEntry (Safari, Firefox, Chrome fallback)
      if (typeof item.webkitGetAsEntry === 'function') {
        const entry = item.webkitGetAsEntry();
        if (entry) webkitEntries.push(entry);
      } else if (item.isFile || item.isDirectory) {
        webkitEntries.push(item);
      }
    }
  }

  // 2. Chrome等で FileSystemHandle が取得できた場合は優先して再帰走査
  if (handles.length > 0) {
    try {
      const resolvedHandles = (await Promise.all(handles)).filter(Boolean);
      if (resolvedHandles.length > 0) {
        const scanHandle = async (handle: any, currentPath: string): Promise<void> => {
          if (!handle) return;
          if (handle.kind === 'file') {
            const file = await handle.getFile();
            notifyCount();
            result.push({
              file,
              relativePath: currentPath ? `${currentPath}/${file.name}` : file.name,
            });
          } else if (handle.kind === 'directory') {
            const nextPath = currentPath ? `${currentPath}/${handle.name}` : handle.name;
            // @ts-ignore
            for await (const child of handle.values()) {
              await scanHandle(child, nextPath);
            }
          }
        };

        await Promise.all(resolvedHandles.map(h => scanHandle(h, '')));
        if (result.length > 0) {
          return result;
        }
      }
    } catch (e) {
      console.warn('FileSystemHandle scan failed, falling back to webkitEntries:', e);
    }
  }

  // 3. webkitGetAsEntry (Safari または FileSystemHandle未サポート環境) での走査
  const scanWebkitEntry = async (entry: any, currentPath: string): Promise<void> => {
    if (!entry) return;

    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        entry.file((file: File) => {
          notifyCount();
          result.push({
            file,
            relativePath: currentPath ? `${currentPath}/${file.name}` : file.name,
          });
          resolve();
        }, (err: unknown) => {
          console.warn(`ファイル読み取りスキップ (${entry.name}):`, err);
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

      const readAllEntries = async (): Promise<any[]> => {
        const allEntries: any[] = [];
        while (true) {
          const batch = await new Promise<any[]>((resolve) => {
            dirReader.readEntries(resolve, (err: unknown) => {
              console.warn(`ディレクトリエントリ読み取りエラー (${entry.name}):`, err);
              resolve([]);
            });
          });
          if (!batch || batch.length === 0) break;
          allEntries.push(...batch);
        }
        return allEntries;
      };

      const entries = await readAllEntries();
      for (const child of entries) {
        await scanWebkitEntry(child, nextPath);
      }
    }
  };

  await Promise.all(webkitEntries.map(e => scanWebkitEntry(e, '')));
  return result;
}

/**
 * ディレクトリから高速読み込み
 * FileList (input webkitdirectory) または DroppedFileEntry[] (ドラッグ＆ドロップ) に対応
 * INDEX_C.XML または INDEX_D.XML の階層を基準にルートパスを自動検出・正規化
 */
export async function loadFromDirectory(
  fileList: FileList | DroppedFileEntry[],
  onProgress?: (status: string) => void
): Promise<DeliveryDataset> {
  onProgress?.(`全 ${fileList.length} 件のファイルをインデックス化中...`);

  // 1. 各ファイルの正規化パスリストを収集
  interface RawItem {
    file: File;
    rawPath: string;
  }
  const rawItems: RawItem[] = [];
  const len = fileList.length;

  for (let i = 0; i < len; i++) {
    const entry = fileList[i];
    let file: File;
    let path: string;

    if ('file' in entry) {
      file = entry.file;
      path = (entry.relativePath || file.name).replace(/\\/g, '/');
    } else {
      file = entry;
      path = ((entry as File).webkitRelativePath || file.name).replace(/\\/g, '/');
    }
    rawItems.push({ file, rawPath: path });
  }

  // 2. INDEX_C.XML または INDEX_D.XML の位置を検出し、ルートプレフィックスを決定
  let rootPrefix = '';
  let rootFolderName = '電子納品フォルダ';

  const indexItem = rawItems.find(it => {
    const nameLower = it.file.name.toLowerCase();
    return nameLower === 'index_c.xml' || nameLower === 'index_d.xml';
  });

  if (indexItem) {
    const lastSlash = indexItem.rawPath.lastIndexOf('/');
    if (lastSlash !== -1) {
      rootPrefix = indexItem.rawPath.substring(0, lastSlash + 1); // 末尾のスラッシュを含む
      const parts = rootPrefix.split('/').filter(Boolean);
      if (parts.length > 0) {
        rootFolderName = parts[parts.length - 1];
      }
    }
  } else {
    // 見つからない場合は最初のファイルの第1階層をフォールバック
    if (rawItems.length > 0 && rawItems[0].rawPath.includes('/')) {
      const parts = rawItems[0].rawPath.split('/');
      rootPrefix = parts[0] + '/';
      rootFolderName = parts[0];
    }
  }

  // 3. ルートプレフィックスを除去して FileItem を構築
  const items: FileItem[] = [];
  for (const it of rawItems) {
    let relPath = it.rawPath;
    if (rootPrefix && relPath.startsWith(rootPrefix)) {
      relPath = relPath.substring(rootPrefix.length);
    } else if (relPath.includes('/')) {
      relPath = relPath.replace(/^[^/]+\//, '');
    }

    items.push({
      name: it.file.name,
      relativePath: relPath,
      blob: it.file,
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

  const entries = Object.entries(loadedZip.files).filter(([, zipEntry]) => !zipEntry.dir);
  onProgress?.(`全 ${entries.length} 件のエントリを展開中...`);

  // 一定数ずつ並列展開（格納順は元のエントリ順を維持）
  const CONCURRENCY = 8;
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const chunk = entries.slice(i, i + CONCURRENCY);
    const chunkItems = await Promise.all(
      chunk.map(async ([relativePath, zipEntry]) => ({
        name: relativePath.split('/').pop() || relativePath,
        relativePath,
        blob: await zipEntry.async('blob'),
      }))
    );
    items.push(...chunkItems);
  }

  const rootFolderName = zipFile.name.replace(/\.zip$/i, '');
  const index = new FastFileIndex(items);
  return processIndex(index, rootFolderName, onProgress);
}

/**
 * データセットが保持する Blob URL をすべて解放する
 * （別の電子納品データへ切り替える際のメモリ解放用。data: URL 等は対象外）
 */
export function revokeDatasetBlobUrls(dataset: DeliveryDataset | null): void {
  if (!dataset) return;
  const urls = new Set<string>();
  const collect = (url?: string) => {
    if (url && url.startsWith('blob:')) urls.add(url);
  };
  dataset.photos.forEach(p => collect(p.fileUrl));
  dataset.reports.forEach(r => collect(r.fileUrl));
  dataset.drawings.forEach(d => collect(d.fileUrl));
  dataset.otherFiles.forEach(f => collect(f.fileUrl));
  urls.forEach(url => URL.revokeObjectURL(url));
}

/**
 * FastFileIndex から CALS データを構築
 * INDEXがCなら土木工事、Dなら業務委託で入り口から切り分ける
 */
async function processIndex(
  index: FastFileIndex,
  folderName: string,
  onProgress?: (status: string) => void
): Promise<DeliveryDataset> {
  onProgress?.('成果品種別 (INDEX_C.XML / INDEX_D.XML) を判定中...');

  // 成果品種別の判定
  const indexDEntries = index.findXml('INDEX_D.XML', 'INDEX_D03.XML', 'INDEX_D02.XML');
  const indexCEntries = index.findXml('INDEX_C.XML', 'INDEX_C06.XML', 'INDEX_C05.XML', 'INDEX_C04.XML');

  let isConsignment = false;
  if (indexDEntries.length > 0) {
    isConsignment = true;
  } else if (indexCEntries.length > 0) {
    isConsignment = false;
  } else {
    // パターン検索
    const matchedD = index.findXmlByPattern(/^index_?d.*\.xml$/i);
    const matchedC = index.findXmlByPattern(/^index_?c.*\.xml$/i);
    if (matchedD.length > 0) {
      isConsignment = true;
    } else if (matchedC.length > 0) {
      isConsignment = false;
    } else {
      // フォールバック: BORING.XML や REPORT.XML があれば業務委託
      const boringXmls = index.findXml('BORING.XML');
      isConsignment = boringXmls.length > 0;
    }
  }

  if (isConsignment) {
    devLog('CALS モード判定: 【業務委託成果品 (INDEX_D)】');
    return processConsignmentIndex(index, folderName, onProgress);
  } else {
    devLog('CALS モード判定: 【土木工事成果品 (INDEX_C)】');
    return processConstructionIndex(index, folderName, onProgress);
  }
}

/**
 * 業務委託成果品 (INDEX_D.XML) 専用データローダー
 */
async function processConsignmentIndex(
  index: FastFileIndex,
  folderName: string,
  onProgress?: (status: string) => void
): Promise<DeliveryDataset> {
  onProgress?.('【業務委託】管理ファイル (INDEX_D.XML) を解析中...');

  // 1. INDEX_D.XML の解析
  let constructionInfo = {
    deliveryType: 'consignment' as const,
    constructionName: folderName,
    lineRiverName: '',
    clientName: 'GioV',
    contractorName: '',
    contractNumber: '',
    startDate: '',
    endDate: '',
    place: '',
    supervisor: '',
    chiefEngineer: '',
    overview: '',
    keywords: [] as string[],
  };

  let indexEntries = index.findXml('INDEX_D.XML', 'INDEX_D03.XML', 'INDEX_D02.XML');
  if (indexEntries.length === 0) {
    indexEntries = index.findXmlByPattern(/^index_?d.*\.xml$/i);
  }

  let basePrefix = '';
  if (indexEntries.length > 0) {
    try {
      const buffer = await indexEntries[0].blob.arrayBuffer();
      const xmlText = decodeXmlBuffer(buffer);
      const parsed = parseConsignmentIndexXml(xmlText);
      devLog(`INDEX_D XML (${indexEntries[0].relativePath}) parsed:`, parsed);

      if (parsed.constructionName && parsed.constructionName !== '（名称未設定業務）') {
        constructionInfo.constructionName = parsed.constructionName;
      }
      if (parsed.lineRiverName) constructionInfo.lineRiverName = parsed.lineRiverName;
      if (parsed.clientName) constructionInfo.clientName = parsed.clientName;
      if (parsed.contractorName) constructionInfo.contractorName = parsed.contractorName;
      if (parsed.contractNumber) constructionInfo.contractNumber = parsed.contractNumber;
      if (parsed.startDate) constructionInfo.startDate = parsed.startDate;
      if (parsed.endDate) constructionInfo.endDate = parsed.endDate;
      if (parsed.place) constructionInfo.place = parsed.place;
      if (parsed.supervisor) constructionInfo.supervisor = parsed.supervisor;
      if (parsed.chiefEngineer) constructionInfo.chiefEngineer = parsed.chiefEngineer;
      if (parsed.overview) constructionInfo.overview = parsed.overview;
      if (parsed.keywords) constructionInfo.keywords = parsed.keywords;

      const lastSlash = indexEntries[0].relativePath.lastIndexOf('/');
      if (lastSlash >= 0) {
        basePrefix = indexEntries[0].relativePath.substring(0, lastSlash + 1).toLowerCase();
      }
    } catch (e) {
      console.warn('INDEX_D XML parse failed:', e);
    }
  }

  // 2. 業務写真 (PHOTO/PHOTO.XML - PHOTO04等) の解析
  onProgress?.('【業務委託】写真XML (PHOTO.XML) を解析中...');
  let photos: PhotoItem[] = [];
  let photoXmlEntries = index.findXml('PHOTO.XML', 'PHOTO_D.XML', 'PHOTO04.XML');
  if (photoXmlEntries.length === 0) {
    photoXmlEntries = index.findXmlByPattern(/^photo.*\.xml$/i);
  }

  if (photoXmlEntries.length > 0) {
    for (const entry of photoXmlEntries) {
      try {
        const buffer = await entry.blob.arrayBuffer();
        const xmlText = decodeXmlBuffer(buffer);
        const parsed = parseConsignmentPhotoXml(xmlText);
        devLog(`PHOTO_D XML (${entry.relativePath}) parsed count:`, parsed.length);
        photos.push(...parsed);
      } catch (e) {
        console.warn('PHOTO_D XML parse failed:', e);
      }
    }

    const idSet = new Set<string>();
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      if (idSet.has(p.id)) {
        p.id = `${p.id}_${i + 1}`;
      }
      idSet.add(p.id);
      p.fileUrl = index.resolveBlobUrl(p.fileName, 'PHOTO', basePrefix);
    }
  } else {
    const imageItems = index.getImageItems();
    photos = imageItems.map((img, idx) => ({
      id: `IMG_D_${idx + 1}`,
      title: img.name,
      category: '調査・測量',
      type: '業務委託写真',
      workType: '写真データ',
      workKind: '',
      workDetail: '',
      date: '',
      fileName: img.name,
      filePath: img.relativePath,
      fileUrl: index.toUrl(img.blob),
      blackboardItems: [],
    }));
  }

  // 3. 業務報告書類 (REPORT/REPORT.XML) の解析
  onProgress?.('【業務委託】報告書XML (REPORT.XML) を解析中...');
  let reports: ReportItem[] = [];
  let reportXmlEntries = index.findXml('REPORT.XML', 'REPORT_D.XML', 'REP03.XML', 'REP04.XML');
  if (reportXmlEntries.length === 0) {
    reportXmlEntries = index.findXmlByPattern(/^report.*\.xml$/i);
  }

  if (reportXmlEntries.length > 0) {
    for (const entry of reportXmlEntries) {
      try {
        const buffer = await entry.blob.arrayBuffer();
        const xmlText = decodeXmlBuffer(buffer);
        const parsed = parseConsignmentReportXml(xmlText);
        devLog(`REPORT_D XML (${entry.relativePath}) parsed count:`, parsed.length);
        reports.push(...parsed);
      } catch (e) {
        console.warn('REPORT_D XML parse failed:', e);
      }
    }
  }

  // 4. 地質・ボーリング調査 (BORING/BORING.XML) の解析 & 電子柱状図PDF統合
  onProgress?.('【業務委託】地質調査XML (BORING.XML) と電子柱状図PDFを検索中...');
  let boringXmlEntries = index.findXml('BORING.XML', 'BORING_D.XML', 'BRG0150.XML');
  if (boringXmlEntries.length === 0) {
    boringXmlEntries = index.findXmlByPattern(/^boring.*\.xml$/i);
  }

  if (boringXmlEntries.length > 0) {
    for (const bEntry of boringXmlEntries) {
      try {
        const buffer = await bEntry.blob.arrayBuffer();
        const xmlText = decodeXmlBuffer(buffer);
        const parsedBoring = parseConsignmentBoringXml(xmlText);
        devLog(`BORING XML (${bEntry.relativePath}) parsed count:`, parsedBoring.length);
        reports.push(...parsedBoring);
      } catch (e) {
        console.warn('BORING XML parse failed:', e);
      }
    }
  }

  // 報告書・柱状図の重複ID解消 & Blob URL 紐付け
  const repIdSet = new Set<string>();
  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    if (repIdSet.has(r.id)) {
      r.id = `${r.id}_${i + 1}`;
    }
    repIdSet.add(r.id);

    // 柱状図の場合は BORING フォルダ優先、報告書の場合は REPORT フォルダ優先
    const folderHint = r.type === '地質柱状図' ? 'BORING' : 'REPORT';
    r.fileUrl = index.resolveBlobUrl(r.fileName, folderHint, basePrefix);
  }

  // 5. 設計図面 (DRAWING/DRAWING.XML) の解析
  onProgress?.('【業務委託】設計図面XML (DRAWING.XML) を解析中...');
  let drawings: DrawingItem[] = [];
  let drawingXmlEntries = index.findXml('DRAWING.XML', 'DRAWING_D.XML', 'DRAW03.XML', 'DRAW04.XML');
  if (drawingXmlEntries.length === 0) {
    drawingXmlEntries = index.findXmlByPattern(/^drawing.*\.xml$/i);
  }

  if (drawingXmlEntries.length > 0) {
    for (const entry of drawingXmlEntries) {
      try {
        const buffer = await entry.blob.arrayBuffer();
        const xmlText = decodeXmlBuffer(buffer);
        const parsed = parseDrawingXml(xmlText);
        devLog(`DRAWING_D XML (${entry.relativePath}) parsed count:`, parsed.length);
        drawings.push(...parsed);
      } catch (e) {
        console.warn('DRAWING_D XML parse failed:', e);
      }
    }

    const idSet = new Set<string>();
    for (let i = 0; i < drawings.length; i++) {
      const d = drawings[i];
      if (idSet.has(d.id)) {
        d.id = `${d.id}_${i + 1}`;
      }
      idSet.add(d.id);
      d.fileUrl = index.resolveBlobUrl(d.fileName, 'DRAWING', basePrefix);
    }
  }

  onProgress?.('【業務委託】解析完了！画面を描画しています...');

  return {
    deliveryType: 'consignment',
    constructionInfo,
    photos,
    reports,
    drawings,
    otherFiles: [],
    loadedAt: new Date().toLocaleString('ja-JP'),
    folderName,
  };
}

/**
 * 土木工事成果品 (INDEX_C.XML) 専用データローダー
 */
async function processConstructionIndex(
  index: FastFileIndex,
  folderName: string,
  onProgress?: (status: string) => void
): Promise<DeliveryDataset> {
  onProgress?.('【土木工事】管理ファイル (INDEX_C.XML) を解析中...');

  // 1. INDEX_C.XML の探索
  let constructionInfo = {
    deliveryType: 'construction' as const,
    constructionName: folderName,
    lineRiverName: '',
    clientName: 'GioV',
    contractorName: '',
    contractNumber: '',
    startDate: '',
    endDate: '',
    place: '',
    supervisor: '',
    chiefEngineer: '',
  };

  let indexEntries = index.findXml('INDEX_C.XML', 'INDEX.XML', 'INDEX_M.XML');
  if (indexEntries.length === 0) {
    indexEntries = index.findXmlByPattern(/^index.*\.xml$/i);
  }

  let basePrefix = '';

  if (indexEntries.length > 0) {
    for (const entry of indexEntries) {
      try {
        const buffer = await entry.blob.arrayBuffer();
        const xmlText = decodeXmlBuffer(buffer);
        const parsed = parseIndexXml(xmlText);
        devLog(`INDEX_C XML (${entry.relativePath}) parsed:`, parsed);

        if (parsed.constructionName && parsed.constructionName !== '（名称未設定工事）') {
          constructionInfo.constructionName = parsed.constructionName;
        }
        if (parsed.lineRiverName) constructionInfo.lineRiverName = parsed.lineRiverName;
        if (parsed.clientName && parsed.clientName !== 'GioV') constructionInfo.clientName = parsed.clientName;
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
        console.warn('INDEX_C XML parse failed:', e);
      }
    }
  }

  // 2. 工事写真 (PHOTO_C.XML) の解析
  onProgress?.('【土木工事】写真XML (PHOTO_C.XML) を解析中...');
  let photos: PhotoItem[] = [];
  let photoXmlEntries = index.findXml('PHOTO_C.XML', 'PHOTO.XML', 'PHOTO_M.XML');
  if (photoXmlEntries.length === 0) {
    photoXmlEntries = index.findXmlByPattern(/^photo.*\.xml$/i);
  }

  if (photoXmlEntries.length > 0) {
    for (const entry of photoXmlEntries) {
      try {
        const buffer = await entry.blob.arrayBuffer();
        const xmlText = decodeXmlBuffer(buffer);
        const parsed = parsePhotoXml(xmlText);
        devLog(`PHOTO_C XML (${entry.relativePath}) parsed count:`, parsed.length);
        photos.push(...parsed);
      } catch (e) {
        console.warn('PHOTO_C XML parse failed:', e);
      }
    }

    const idSet = new Set<string>();
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      if (idSet.has(p.id)) {
        p.id = `${p.id}_${i + 1}`;
      }
      idSet.add(p.id);

      if (!p.workType || p.workType.trim() === '') {
        p.workType = p.type || '一般工種';
      }
      if (!p.category || p.category.trim() === '') {
        p.category = '施工中';
      }

      p.fileUrl = index.resolveBlobUrl(p.fileName, 'PHOTO', basePrefix);
    }
  } else {
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
      fileUrl: index.toUrl(img.blob),
      blackboardItems: [],
    }));
  }

  // 3. 工事帳票 (MEET.XML, PLAN.XML, OTHRS.XML) の解析
  onProgress?.('【土木工事】帳票XML (MEET.XML / PLAN.XML / OTHRS.XML) を解析中...');
  let reports: ReportItem[] = [];
  let reportXmlEntries = index.findXml(
    'MEET_C.XML', 
    'MEET.XML', 
    'PLAN_C.XML', 
    'PLAN.XML', 
    'OTHRS_C.XML', 
    'OTHRS.XML',
    'REPORT_C.XML', 
    'REPORT.XML'
  );
  if (reportXmlEntries.length === 0) {
    reportXmlEntries = index.findXmlByPattern(/^(meet|plan|othrs|report).*\.xml$/i);
  }

  if (reportXmlEntries.length > 0) {
    for (const entry of reportXmlEntries) {
      try {
        const buffer = await entry.blob.arrayBuffer();
        const xmlText = decodeXmlBuffer(buffer);
        const parsed = parseReportXml(xmlText);
        devLog(`REPORT_C XML (${entry.relativePath}) parsed count:`, parsed.length);
        reports.push(...parsed);
      } catch (e) {
        console.warn('REPORT_C XML parse failed:', e);
      }
    }

    const idSet = new Set<string>();
    for (let i = 0; i < reports.length; i++) {
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
      fileUrl: index.toUrl(pdf.blob),
    }));
  }

  // 4. 完成図面 (DRAWINGF.XML / DRAWING_C.XML) の解析
  onProgress?.('【土木工事】完成図面XML (DRAWINGF.XML / DRAWING_C.XML) を解析中...');
  let drawings: DrawingItem[] = [];
  let drawingXmlEntries = index.findXml(
    'DRAWINGF.XML', 
    'DRAWINGS.XML', 
    'DRAWING_C.XML', 
    'DRAWING.XML'
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
        devLog(`DRAWING_C XML (${entry.relativePath}) parsed count:`, parsed.length);
        drawings.push(...parsed);
      } catch (e) {
        console.warn('DRAWING_C XML parse failed:', e);
      }
    }

    const idSet = new Set<string>();
    for (let i = 0; i < drawings.length; i++) {
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
      fileUrl: index.toUrl(pdf.blob),
    }));
  }

  onProgress?.('【土木工事】解析完了！画面を描画しています...');

  return {
    deliveryType: 'construction',
    constructionInfo,
    photos,
    reports,
    drawings,
    otherFiles: [],
    loadedAt: new Date().toLocaleString('ja-JP'),
    folderName,
  };
}
