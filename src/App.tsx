import React, { useState } from 'react';
import type { DeliveryDataset, InspectionRecord } from './types/cals';

import { Header } from './components/Header';
import { FileDropZone } from './components/FileDropZone';
import { DocumentViewer } from './components/DocumentViewer';
import { PhotoViewer } from './components/PhotoViewer';
import { InspectionTreeNav } from './components/InspectionTreeNav';
import { InspectionReportView } from './components/InspectionReportView';
import { FileText, Image as ImageIcon, ArrowRight, ShieldCheck } from 'lucide-react';

export const App: React.FC = () => {
  const [dataset, setDataset] = useState<DeliveryDataset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'doc-only' | 'photo-only'>('doc-only');
  const [showModeSelectModal, setShowModeSelectModal] = useState(false);
  const [inspectionRecords, setInspectionRecords] = useState<Record<string, InspectionRecord>>({});
  const [showReportModal, setShowReportModal] = useState(false);

  // 選択中のアイテムID
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [docTab, setDocTab] = useState<'reports' | 'drawings' | 'index'>('reports');

  // データセットがロードされた時に初期化 & 検査対象選択の判定
  const handleDatasetLoaded = (newDataset: DeliveryDataset) => {
    setDataset(newDataset);
    setSelectedReportId(newDataset.reports[0]?.id || null);
    setSelectedDrawingId(newDataset.drawings[0]?.id || null);
    setSelectedPhotoId(newDataset.photos[0]?.id || null);
    setDocTab('index'); // 初期表示はツリー先頭の工事基本情報（INDEX）

    const hasDocs = newDataset.reports.length > 0 || newDataset.drawings.length > 0;
    const hasPhotos = newDataset.photos.length > 0;

    // 書類と写真の両方がある場合は、どちらで開始するか選択モーダルを表示
    if (hasDocs && hasPhotos) {
      setShowModeSelectModal(true);
      setViewMode('doc-only'); // モーダル決定前の初期値
    } else if (hasPhotos && !hasDocs) {
      setViewMode('photo-only');
      setShowModeSelectModal(false);
    } else {
      setViewMode('doc-only');
      setShowModeSelectModal(false);
    }

    const storageKey = `cals_inspection_${newDataset.constructionInfo.constructionName}`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setInspectionRecords(JSON.parse(saved));
      } else {
        setInspectionRecords({});
      }
    } catch {
      setInspectionRecords({});
    }
  };

  // ツリーから書類を選択
  const handleTreeSelectReport = (id: string) => {
    setSelectedReportId(id);
    setDocTab('reports');
  };

  // ツリーから図面を選択
  const handleTreeSelectDrawing = (id: string) => {
    setSelectedDrawingId(id);
    setDocTab('drawings');
  };

  // 検査記録の更新 ＆ localStorage 保存
  const handleUpdateInspection = (record: InspectionRecord) => {
    setInspectionRecords((prev) => {
      const updated = {
        ...prev,
        [record.targetId]: record,
      };

      if (dataset) {
        const storageKey = `cals_inspection_${dataset.constructionInfo.constructionName}`;
        try {
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (e) {
          console.warn('localStorage save failed:', e);
        }
      }

      return updated;
    });
  };

  // 書類・写真の有無判定
  const hasDocs = !!dataset && (dataset.reports.length > 0 || dataset.drawings.length > 0);
  const hasPhotos = !!dataset && dataset.photos.length > 0;

  // 合計点検対象数
  const totalItemsCount = (dataset?.photos.length || 0) + (dataset?.reports.length || 0) + (dataset?.drawings.length || 0);

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-text">
      {!dataset ? (
        <FileDropZone
          onDatasetLoaded={handleDatasetLoaded}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
        />
      ) : (
        <>
          <Header
            constructionInfo={dataset.constructionInfo}
            inspectionRecords={inspectionRecords}
            totalItemsCount={totalItemsCount}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onOpenFolderClick={() => setDataset(null)}
            onOpenReportModal={() => setShowReportModal(true)}
            hasDocs={hasDocs}
            hasPhotos={hasPhotos}
          />

          <main className="flex-1 flex overflow-hidden">
            {/* 左側: 種別・階層ツリーナビゲーション */}
            <InspectionTreeNav
              reports={dataset.reports}
              drawings={dataset.drawings}
              photos={dataset.photos}
              selectedReportId={selectedReportId}
              selectedDrawingId={selectedDrawingId}
              selectedPhotoId={selectedPhotoId}
              isIndexSelected={docTab === 'index'}
              inspectionRecords={inspectionRecords}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onSelectIndex={() => setDocTab('index')}
              onSelectReport={handleTreeSelectReport}
              onSelectDrawing={handleTreeSelectDrawing}
              onSelectPhoto={setSelectedPhotoId}
            />

            {/* メイン: 書類または写真の全画面ビュー（左右分離を完全廃止） */}
            <div className="flex-1 flex overflow-hidden">
              {viewMode === 'doc-only' ? (
                <DocumentViewer
                  constructionInfo={dataset.constructionInfo}
                  reports={dataset.reports}
                  drawings={dataset.drawings}
                  selectedReportId={selectedReportId}
                  selectedDrawingId={selectedDrawingId}
                  activeTab={docTab}
                  inspectionRecords={inspectionRecords}
                  onActiveTabChange={setDocTab}
                  onUpdateInspection={handleUpdateInspection}
                />
              ) : (
                <PhotoViewer
                  photos={dataset.photos}
                  selectedPhotoId={selectedPhotoId}
                  inspectionRecords={inspectionRecords}
                  onSelectPhoto={setSelectedPhotoId}
                  onUpdateInspection={handleUpdateInspection}
                />
              )}
            </div>
          </main>

          {/* 検査調書出力モーダル */}
          {showReportModal && (
            <InspectionReportView
              constructionInfo={dataset.constructionInfo}
              inspectionRecords={inspectionRecords}
              onClose={() => setShowReportModal(false)}
            />
          )}

          {/* ==================== 起動時 検査対象選択ダイアログ ==================== */}
          {showModeSelectModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
              <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 sm:p-8 max-w-xl w-full shadow-2xl flex flex-col text-center">
                <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mx-auto mb-4">
                  <ShieldCheck className="w-8 h-8" />
                </div>

                <h3 className="text-xl font-bold text-white mb-1">
                  検査対象を選択してください
                </h3>
                <p className="text-xs text-slate-400 mb-6 max-w-md mx-auto">
                  読み込みデータ内に【書類・図面】と【工事写真】の両方が見つかりました。どちらの検査から開始しますか？
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  {/* 書類・図面で起動 */}
                  <button
                    onClick={() => {
                      setViewMode('doc-only');
                      setShowModeSelectModal(false);
                    }}
                    className="p-5 rounded-xl bg-slate-800/90 hover:bg-blue-950/40 border border-slate-700 hover:border-blue-500 text-left transition flex flex-col justify-between group shadow-lg cursor-pointer"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center mb-3 group-hover:scale-110 transition">
                        <FileText className="w-5 h-5" />
                      </div>
                      <h4 className="text-base font-bold text-white mb-1 flex items-center justify-between">
                        <span>書類・図面検査</span>
                        <ArrowRight className="w-4 h-4 text-blue-400 opacity-0 group-hover:opacity-100 transition-transform group-hover:translate-x-1" />
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        施工計画書、工事打合せ簿、試験表、完成図面を全画面で閲覧・検査します。
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-700/80 flex items-center justify-between text-xs">
                      <span className="text-slate-400">データ件数:</span>
                      <span className="font-bold text-blue-400">
                        {dataset.reports.length + dataset.drawings.length} 件
                      </span>
                    </div>
                  </button>

                  {/* 工事写真で起動 */}
                  <button
                    onClick={() => {
                      setViewMode('photo-only');
                      setShowModeSelectModal(false);
                    }}
                    className="p-5 rounded-xl bg-slate-800/90 hover:bg-emerald-950/40 border border-slate-700 hover:border-emerald-500 text-left transition flex flex-col justify-between group shadow-lg cursor-pointer"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-110 transition">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                      <h4 className="text-base font-bold text-white mb-1 flex items-center justify-between">
                        <span>工事写真検査</span>
                        <ArrowRight className="w-4 h-4 text-emerald-400 opacity-0 group-hover:opacity-100 transition-transform group-hover:translate-x-1" />
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        工種体系（工種＞種別＞細別）スマートツリーと連続スクロールで写真台帳を検査します。
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-700/80 flex items-center justify-between text-xs">
                      <span className="text-slate-400">写真枚数:</span>
                      <span className="font-bold text-emerald-400">
                        {dataset.photos.length} 枚
                      </span>
                    </div>
                  </button>
                </div>

                <div className="text-[11px] text-slate-500">
                  ※ 検査中も画面上部のヘッダーボタンからいつでも瞬時に切り替えられます
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default App;
