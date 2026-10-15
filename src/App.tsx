import React, { useCallback, useRef, useState } from 'react';
import type { DeliveryDataset, InspectionRecord } from './types/cals';
import { revokeDatasetBlobUrls } from './utils/fileLoader';
import {
  buildDrawingRecord,
  buildPhotoRecord,
  buildReportRecord,
  clearStoredRecords,
  loadStoredRecords,
  saveStoredRecords,
} from './utils/inspectionRecord';

import { Header } from './components/Header';
import { FileDropZone } from './components/FileDropZone';
import { DocumentViewer } from './components/DocumentViewer';
import { PhotoViewer } from './components/PhotoViewer';
import { InspectionTreeNav } from './components/InspectionTreeNav';
import { InspectionReportView } from './components/InspectionReportView';
import { SubWindowPortal } from './components/SubWindowPortal';
import { FileText, Image as ImageIcon, ArrowRight, ShieldCheck, ExternalLink, CheckCircle2 } from 'lucide-react';

export const App: React.FC = () => {
  const [dataset, setDataset] = useState<DeliveryDataset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'doc-only' | 'photo-only'>('doc-only');
  const [subWindowMode, setSubWindowMode] = useState<'doc-only' | 'photo-only' | null>(null);
  const [showModeSelectModal, setShowModeSelectModal] = useState(false);
  const [inspectionRecords, setInspectionRecords] = useState<Record<string, InspectionRecord>>({});
  const [showReportModal, setShowReportModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 選択中のアイテムID
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [docTab, setDocTab] = useState<'reports' | 'drawings' | 'index'>('reports');

  // トースト表示（前回の非表示タイマーを解除してから表示し、重なりで早期に消えるのを防ぐ）
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string, durationMs: number) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, durationMs);
  };

  // フォルダ選択画面へ戻る（前データの Blob URL を解放）
  const handleOpenFolder = () => {
    revokeDatasetBlobUrls(dataset);
    setDataset(null);
  };

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

    const savedRecords = loadStoredRecords(newDataset.constructionInfo);
    if (savedRecords) {
      setInspectionRecords(savedRecords);
      const count = Object.keys(savedRecords).length;
      if (count > 0) {
        const okC = Object.values(savedRecords).filter(r => r.status === 'ok').length;
        const issueC = Object.values(savedRecords).filter(r => r.status === 'issue').length;
        showToast(`前回の検査記録（適: ${okC}件 / 指摘: ${issueC}件）を自動復元しました`, 4000);
      }
    } else {
      setInspectionRecords({});
    }
  };

  // ツリーから書類を選択
  const handleTreeSelectReport = useCallback((id: string) => {
    setSelectedReportId(id);
    setDocTab('reports');
  }, []);

  // ツリーから図面を選択
  const handleTreeSelectDrawing = useCallback((id: string) => {
    setSelectedDrawingId(id);
    setDocTab('drawings');
  }, []);

  // メイン画面ツリー用コールバック (useCallbackでメモ化し無駄な再レンダリングを遮断)
  const handleSelectIndexMain = useCallback(() => {
    setDocTab('index');
    setViewMode('doc-only');
  }, []);

  const handleSelectReportMain = useCallback((id: string) => {
    handleTreeSelectReport(id);
    setViewMode('doc-only');
  }, [handleTreeSelectReport]);

  const handleSelectDrawingMain = useCallback((id: string) => {
    handleTreeSelectDrawing(id);
    setViewMode('doc-only');
  }, [handleTreeSelectDrawing]);

  const handleSelectPhotoMain = useCallback((id: string) => {
    setSelectedPhotoId(id);
    setViewMode('photo-only');
  }, []);

  // サブウィンドウ画面ツリー用コールバック
  const handleSelectIndexSub = useCallback(() => {
    setDocTab('index');
    setSubWindowMode('doc-only');
  }, []);

  const handleSelectReportSub = useCallback((id: string) => {
    handleTreeSelectReport(id);
    setSubWindowMode('doc-only');
  }, [handleTreeSelectReport]);

  const handleSelectDrawingSub = useCallback((id: string) => {
    handleTreeSelectDrawing(id);
    setSubWindowMode('doc-only');
  }, [handleTreeSelectDrawing]);

  const handleSelectPhotoSub = useCallback((id: string) => {
    setSelectedPhotoId(id);
    setSubWindowMode('photo-only');
  }, []);

  // 検査記録の更新 ＆ localStorage 保存
  const handleUpdateInspection = (record: InspectionRecord) => {
    setInspectionRecords((prev) => {
      const updated = {
        ...prev,
        [record.targetId]: record,
      };

      if (dataset) {
        saveStoredRecords(dataset.constructionInfo, updated);
      }

      return updated;
    });
  };

  // 書類・写真の有無判定
  const hasDocs = !!dataset && (dataset.reports.length > 0 || dataset.drawings.length > 0);
  const hasPhotos = !!dataset && dataset.photos.length > 0;

  // 合計点検対象数
  const totalItemsCount = (dataset?.photos.length || 0) + (dataset?.reports.length || 0) + (dataset?.drawings.length || 0);

  // 指摘（issue）以外の未確認アイテムを一括で「適（ok）」にする
  const handleBulkMarkOk = () => {
    if (!dataset) return;

    const inspectedCount = Object.keys(inspectionRecords).length;
    const uninspected = totalItemsCount - inspectedCount;
    const issueCount = Object.values(inspectionRecords).filter(r => r.status === 'issue').length;

    if (uninspected <= 0) {
      alert('すべてのアイテムがすでに検査済みです。');
      return;
    }

    const confirmed = window.confirm(
      `【未確認アイテムの一括確認】\n\n` +
      `現在チェック済みの「要確認・指摘（${issueCount} 件）」はそのまま維持し、\n` +
      `残りの未確認アイテム（${uninspected} 件）をすべて「適（確認済）」にします。\n\n` +
      `よろしいですか？`
    );
    if (!confirmed) return;

    const updated: Record<string, InspectionRecord> = { ...inspectionRecords };
    const now = new Date().toLocaleString('ja-JP');

    // 1. 写真
    dataset.photos.forEach(p => {
      if (!updated[p.id] || updated[p.id].status !== 'issue') {
        updated[p.id] = buildPhotoRecord(p, 'ok', updated[p.id]?.notes, now);
      }
    });

    // 2. 報告書
    dataset.reports.forEach(r => {
      if (!updated[r.id] || updated[r.id].status !== 'issue') {
        updated[r.id] = buildReportRecord(r, 'ok', updated[r.id]?.notes, now);
      }
    });

    // 3. 図面
    dataset.drawings.forEach(d => {
      if (!updated[d.id] || updated[d.id].status !== 'issue') {
        updated[d.id] = buildDrawingRecord(d, 'ok', updated[d.id]?.notes, now);
      }
    });

    setInspectionRecords(updated);
    saveStoredRecords(dataset.constructionInfo, updated);

    showToast(`未確認の ${uninspected} 件を一括で「適」に更新しました`, 3500);
  };

  // 検査記録のリセット（初期化）
  const handleResetInspection = () => {
    if (!dataset) return;
    const confirmed = window.confirm(
      `【検査記録のリセット】\n\n` +
      `現在の工事・業務に関するすべての検査結果（適・指摘・メモ）を初期化します。\n\n` +
      `本当によろしいですか？（この操作は元に戻せません）`
    );
    if (!confirmed) return;

    setInspectionRecords({});
    clearStoredRecords(dataset.constructionInfo);

    showToast('検査記録をリセットしました', 3000);
  };

  // 検査記録のJSONバックアップ読込（インポート）
  const handleImportBackup = (importedRecords: Record<string, InspectionRecord>) => {
    if (!dataset) return;
    setInspectionRecords(importedRecords);
    saveStoredRecords(dataset.constructionInfo, importedRecords);
    showToast(`バックアップから ${Object.keys(importedRecords).length} 件の記録を復元しました`, 4000);
  };

  // 別窓を閉じるハンドラ（参照を固定）
  const handleCloseSubWindow = useCallback(() => {
    setSubWindowMode(null);
  }, []);

  // 別窓（サブウィンドウ）の開閉トグル
  const handleToggleSubWindow = () => {
    if (subWindowMode) {
      setSubWindowMode(null);
    } else {
      // 現在の viewMode の相手側を別窓で開く
      setSubWindowMode(viewMode === 'doc-only' ? 'photo-only' : 'doc-only');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-text print:h-auto print:min-h-full print:overflow-visible print:bg-white print:text-black">
      {!dataset ? (
        <FileDropZone
          onDatasetLoaded={handleDatasetLoaded}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
        />
      ) : (
        <>
          <div className="print:hidden">
            <Header
              constructionInfo={dataset.constructionInfo}
              inspectionRecords={inspectionRecords}
              totalItemsCount={totalItemsCount}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onOpenFolderClick={handleOpenFolder}
              onOpenReportModal={() => setShowReportModal(true)}
              hasDocs={hasDocs}
              hasPhotos={hasPhotos}
              onToggleSubWindow={handleToggleSubWindow}
              isSubWindowOpen={!!subWindowMode}
              onBulkMarkOk={handleBulkMarkOk}
            />
          </div>

          <main className="flex-1 flex overflow-hidden print:hidden">
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
              onSelectIndex={handleSelectIndexMain}
              onSelectReport={handleSelectReportMain}
              onSelectDrawing={handleSelectDrawingMain}
              onSelectPhoto={handleSelectPhotoMain}
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
              reports={dataset.reports}
              drawings={dataset.drawings}
              photos={dataset.photos}
              totalItemsCount={totalItemsCount}
              onBulkMarkOk={handleBulkMarkOk}
              onResetInspection={handleResetInspection}
              onImportBackup={handleImportBackup}
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                  {/* 書類・図面で起動 */}
                  <button
                    onClick={() => {
                      setViewMode('doc-only');
                      setShowModeSelectModal(false);
                    }}
                    className="p-4 rounded-xl bg-slate-800/90 hover:bg-blue-950/40 border border-slate-700 hover:border-blue-500 text-left transition flex flex-col justify-between group shadow-lg cursor-pointer"
                  >
                    <div>
                      <div className="w-9 h-9 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition">
                        <FileText className="w-5 h-5" />
                      </div>
                      <h4 className="text-sm font-bold text-white mb-1 flex items-center justify-between">
                        <span>書類・図面検査</span>
                        <ArrowRight className="w-3.5 h-3.5 text-blue-400 opacity-0 group-hover:opacity-100 transition-transform group-hover:translate-x-1" />
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        報告書、打合せ簿、計算書、完成図面を全画面で閲覧・検査します。
                      </p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-slate-700/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">データ件数:</span>
                      <span className="font-bold text-blue-400">
                        {dataset.reports.length + dataset.drawings.length} 件
                      </span>
                    </div>
                  </button>

                  {/* 写真で起動 */}
                  <button
                    onClick={() => {
                      setViewMode('photo-only');
                      setShowModeSelectModal(false);
                    }}
                    className="p-4 rounded-xl bg-slate-800/90 hover:bg-emerald-950/40 border border-slate-700 hover:border-emerald-500 text-left transition flex flex-col justify-between group shadow-lg cursor-pointer"
                  >
                    <div>
                      <div className="w-9 h-9 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                      <h4 className="text-sm font-bold text-white mb-1 flex items-center justify-between">
                        <span>{dataset.constructionInfo.deliveryType === 'consignment' ? '業務写真検査' : '工事写真検査'}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-400 opacity-0 group-hover:opacity-100 transition-transform group-hover:translate-x-1" />
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        工種・大分類ツリーと連続スクロールで写真台帳を検査します。
                      </p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-slate-700/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">写真枚数:</span>
                      <span className="font-bold text-emerald-400">
                        {dataset.photos.length} 枚
                      </span>
                    </div>
                  </button>

                  {/* 2画面（別窓）で両方同時に開く */}
                  <button
                    onClick={() => {
                      setViewMode('doc-only');
                      setSubWindowMode('photo-only');
                      setShowModeSelectModal(false);
                    }}
                    className="p-4 rounded-xl bg-purple-950/30 hover:bg-purple-900/40 border border-purple-500/50 hover:border-purple-400 text-left transition flex flex-col justify-between group shadow-lg cursor-pointer"
                  >
                    <div>
                      <div className="w-9 h-9 rounded-lg bg-purple-600/30 text-purple-300 flex items-center justify-center mb-2.5 group-hover:scale-110 transition">
                        <ExternalLink className="w-5 h-5" />
                      </div>
                      <h4 className="text-sm font-bold text-purple-200 mb-1 flex items-center justify-between">
                        <span>2画面で両方開く</span>
                        <ArrowRight className="w-3.5 h-3.5 text-purple-300 opacity-0 group-hover:opacity-100 transition-transform group-hover:translate-x-1" />
                      </h4>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        メイン窓に書類、別窓に写真を同時に開き、マルチ画面で並列検査します。
                      </p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-purple-500/30 flex items-center justify-between text-[11px]">
                      <span className="text-purple-300 font-semibold">2画面並列</span>
                      <span className="font-bold text-purple-300">おすすめ ⧉</span>
                    </div>
                  </button>
                </div>

                <div className="text-[11px] text-slate-500">
                  ※ 検査中も画面上部のヘッダーボタン「別窓で開く ↗」からいつでも別ウィンドウを呼び出せます
                </div>
              </div>
            </div>
          )}

          {/* ==================== 別窓（サブウィンドウ）ポータル ==================== */}
          {subWindowMode && dataset && (
            <SubWindowPortal
              title={`GioV 電子納品 - ${
                subWindowMode === 'photo-only'
                  ? (dataset.constructionInfo.deliveryType === 'consignment' ? '業務写真ビューア' : '工事写真ビューア')
                  : '書類・図面ビューア'
              }`}
              onClose={handleCloseSubWindow}
              width={1280}
              height={850}
            >
              <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-text">
                {/* サブウィンドウ専用ヘッダー */}
                <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-between shrink-0 select-none shadow">
                  <div className="flex items-center gap-3">
                    <span className="bg-purple-900/60 text-purple-300 border border-purple-500/50 text-[11px] font-bold px-2 py-0.5 rounded tracking-wide">
                      別窓ビュー
                    </span>
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>
                        {subWindowMode === 'photo-only'
                          ? (dataset.constructionInfo.deliveryType === 'consignment' ? '業務写真検査' : '工事写真検査')
                          : '書類・図面検査'}
                      </span>
                      <span className="text-xs font-normal text-slate-400">
                        （{dataset.constructionInfo.constructionName}）
                      </span>
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSubWindowMode(null)}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs border border-slate-700 transition"
                    >
                      この窓を閉じる
                    </button>
                  </div>
                </div>

                {/* サブウィンドウのメイン領域（ツリー ＋ ビューア） */}
                <div className="flex-1 flex overflow-hidden">
                  <InspectionTreeNav
                    reports={dataset.reports}
                    drawings={dataset.drawings}
                    photos={dataset.photos}
                    selectedReportId={selectedReportId}
                    selectedDrawingId={selectedDrawingId}
                    selectedPhotoId={selectedPhotoId}
                    isIndexSelected={docTab === 'index'}
                    inspectionRecords={inspectionRecords}
                    viewMode={subWindowMode}
                    onViewModeChange={setSubWindowMode}
                    onSelectIndex={handleSelectIndexSub}
                    onSelectReport={handleSelectReportSub}
                    onSelectDrawing={handleSelectDrawingSub}
                    onSelectPhoto={handleSelectPhotoSub}
                  />
                  <div className="flex-1 flex overflow-hidden">
                    {subWindowMode === 'doc-only' ? (
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
                </div>
              </div>
            </SubWindowPortal>
          )}
        </>
      )}

      {/* 操作・復元通知トースト */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-emerald-500/80 text-emerald-300 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs sm:text-sm font-semibold animate-in slide-in-from-bottom-3 duration-200 print:hidden">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default App;
