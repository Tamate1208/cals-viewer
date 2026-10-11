import React, { useRef, useState } from 'react';
import { 
  FolderArchive, 
  FolderSearch, 
  Info, 
  Layers, 
  ShieldCheck, 
  Sparkles, 
  UploadCloud,
  Loader2
} from 'lucide-react';
import { loadFromDirectory, loadFromZip } from '../utils/fileLoader';
import { getSampleHiroshimaDataset } from '../utils/sampleData';
import type { DeliveryDataset } from '../types/cals';

interface FileDropZoneProps {
  onDatasetLoaded: (dataset: DeliveryDataset) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  onDatasetLoaded,
  isLoading,
  setIsLoading,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>('電子納品データを解析中...');

  const directoryInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // フォルダ選択処理
  const handleDirectorySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsLoading(true);
      setErrorMessage(null);
      setProgressMessage(`全 ${files.length} 件のファイルを検出しました。解析を開始します...`);
      // ブラウザにローディング画面を100%確実に描画させるためメインスレッドを解放
      await new Promise(r => setTimeout(r, 80));

      const dataset = await loadFromDirectory(files, (msg) => setProgressMessage(msg));
      onDatasetLoaded(dataset);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`読み込み中にエラーが発生しました: ${err.message || '不明なエラー'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ZIPファイル選択処理
  const handleZipSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    try {
      setIsLoading(true);
      setErrorMessage(null);
      setProgressMessage('ZIPアーカイブを展開中...');
      await new Promise(r => setTimeout(r, 80));

      const dataset = await loadFromZip(file, (msg) => setProgressMessage(msg));
      onDatasetLoaded(dataset);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`ZIP展開・読み込み中にエラーが発生しました: ${err.message || '不明なエラー'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ドラッグ＆ドロップ処理
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    try {
      setIsLoading(true);
      setErrorMessage(null);

      // ZIPファイルがドロップされた場合
      if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
        setProgressMessage('ZIPアーカイブを展開中...');
        await new Promise(r => setTimeout(r, 80));
        const dataset = await loadFromZip(files[0], (msg) => setProgressMessage(msg));
        onDatasetLoaded(dataset);
        return;
      }

      // フォルダまたは複数ファイル
      setProgressMessage(`全 ${files.length} 件のファイルを検出しました。解析を開始します...`);
      await new Promise(r => setTimeout(r, 80));
      const dataset = await loadFromDirectory(files, (msg) => setProgressMessage(msg));
      onDatasetLoaded(dataset);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`ファイルの読み込みに失敗しました: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 広島県模擬サンプルのロード
  const handleLoadSample = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setProgressMessage('サンプルデータを展開中...');
    await new Promise(r => setTimeout(r, 60));
    const sample = getSampleHiroshimaDataset();
    onDatasetLoaded(sample);
    setIsLoading(false);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 bg-slate-950 text-slate-100 overflow-y-auto relative">
      {/* 全画面ローディングオーバーレイ（ファイル選択後、確実に表示される） */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
            {/* 大きなスピナー */}
            <div className="relative mb-5">
              <div className="w-16 h-16 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
              <Loader2 className="w-8 h-8 text-blue-400 absolute inset-0 m-auto animate-pulse" />
            </div>

            <h3 className="text-lg font-bold text-white mb-2">
              電子納品データを読み込み中
            </h3>
            
            {/* リアルタイム進捗メッセージ */}
            <p className="text-sm font-medium text-blue-400 mb-4 min-h-[1.5rem]">
              {progressMessage}
            </p>

            {/* パルスプログレスバー */}
            <div className="w-full bg-slate-800 rounded-full h-2 mb-4 overflow-hidden relative">
              <div className="bg-gradient-to-r from-blue-600 to-emerald-400 h-full w-full animate-pulse" />
            </div>

            <div className="text-[11px] text-slate-400 space-y-1">
              <div>・サーバーへのアップロードは行っていません（完全ローカル解析）</div>
              <div>・INDEX_C.XML / PHOTO / REPORT を自動インデックス化中</div>
            </div>
          </div>
        </div>
      )}

      {/* 隠しインプット */}
      <input
        type="file"
        ref={directoryInputRef}
        onChange={handleDirectorySelect}
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        multiple
        className="hidden"
      />
      <input
        type="file"
        ref={zipInputRef}
        onChange={handleZipSelect}
        accept=".zip"
        className="hidden"
      />

      <div className="max-w-2xl w-full flex flex-col items-center">
        {/* タイトルバッジ */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/40 border border-blue-500/40 text-blue-300 text-xs font-semibold mb-4">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span>GioV 土木公共工事 電子納品検査支援アプリ (スタンドアロン版)</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-white text-center mb-2 tracking-tight">
          電子納品データを開いて検査を開始
        </h2>
        <p className="text-sm text-slate-400 text-center mb-8 max-w-lg">
          納品ディスクやフォルダ、またはZIPファイルを指定するだけで、工事情報・工事写真・電子黒板・報告書・図面を安全にブラウザ内解析します。
        </p>

        {/* ドロップゾーン */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`w-full p-8 sm:p-12 border-2 border-dashed rounded-2xl transition flex flex-col items-center justify-center text-center backdrop-blur-sm ${
            isDragOver 
              ? 'border-blue-400 bg-blue-950/40 scale-[1.01]' 
              : 'border-slate-700 bg-slate-900/60 hover:border-slate-600'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-5 shadow-inner">
            <UploadCloud className="w-8 h-8" />
          </div>

          <h3 className="text-lg font-bold text-slate-100 mb-1">
            フォルダまたはZIPファイルをここにドラッグ＆ドロップ
          </h3>
          <p className="text-xs text-slate-400 mb-6">
            国土交通省・地方自治体(GioV)基準の INDEX_C.XML / PHOTO / REPORT / DRAWING フォルダに対応
          </p>

          {/* ボタン2種 */}
          <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-md">
            <button
              type="button"
              onClick={() => directoryInputRef.current?.click()}
              className="flex-1 min-w-[180px] flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/20 transition active:scale-95 cursor-pointer"
            >
              <FolderSearch className="w-4 h-4" />
              <span>納品フォルダを選択</span>
            </button>

            <button
              type="button"
              onClick={() => zipInputRef.current?.click()}
              className="flex-1 min-w-[180px] flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-semibold transition active:scale-95 cursor-pointer"
            >
              <FolderArchive className="w-4 h-4 text-amber-400" />
              <span>ZIPファイルを選択</span>
            </button>
          </div>
        </div>

        {/* エラーメッセージ */}
        {errorMessage && (
          <div className="mt-4 p-3 bg-red-950/80 border border-red-700 text-red-200 text-xs rounded-lg max-w-md w-full text-center">
            {errorMessage}
          </div>
        )}

        {/* 模擬サンプルですぐ試すボタン */}
        <div className="mt-8 flex flex-col items-center">
          <div className="text-xs text-slate-500 mb-2 font-medium">お手元にデータがない場合</div>
          <button
            type="button"
            onClick={handleLoadSample}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-600/50 text-emerald-300 text-xs font-semibold shadow transition active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>GioV 道路改良工事のサンプルデータで試す</span>
          </button>
        </div>

        {/* 特徴説明フッター */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-xs text-slate-400">
          <div className="bg-slate-900/40 border border-slate-800 p-3.5 rounded-xl flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-200 mb-0.5">完全オフライン＆高セキュリティ</div>
              <div>データは端末内（ブラウザメモリ）でのみ解析。外部サーバーへの送信は一切行いません。</div>
            </div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800 p-3.5 rounded-xl flex items-start gap-2.5">
            <Layers className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-200 mb-0.5">書類検査・写真検査の最適ビュー</div>
              <div>画面全体を活用し、書類・図面PDFや工種体系スクロール写真台帳を見やすく精細に検査できます。</div>
            </div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800 p-3.5 rounded-xl flex items-start gap-2.5">
            <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-200 mb-0.5">Shift-JIS / UTF-8 自動判別</div>
              <div>国交省および自治体(GioV)の電子納品基準で多用されるShift-JIS XMLを自動判別して正常表示。</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
