import React, { useState } from 'react';
import type { DeliveryDataset, InspectionRecord } from './types/cals';

import { Header } from './components/Header';
import { FileDropZone } from './components/FileDropZone';
import { SplitPane } from './components/SplitPane';
import { DocumentViewer } from './components/DocumentViewer';
import { PhotoViewer } from './components/PhotoViewer';
import { InspectionTreeNav } from './components/InspectionTreeNav';
import { InspectionReportView } from './components/InspectionReportView';

export const App: React.FC = () => {
  const [dataset, setDataset] = useState<DeliveryDataset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'doc-only' | 'photo-only'>('split');
  const [inspectionRecords, setInspectionRecords] = useState<Record<string, InspectionRecord>>({});
  const [showReportModal, setShowReportModal] = useState(false);

  // 選択中のアイテムID
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [docTab, setDocTab] = useState<'reports' | 'drawings' | 'index'>('reports');

  // データセットがロードされた時に初期化 & localStorage から過去の検査記録を復元
  const handleDatasetLoaded = (newDataset: DeliveryDataset) => {
    setDataset(newDataset);
    setSelectedReportId(newDataset.reports[0]?.id || null);
    setSelectedDrawingId(newDataset.drawings[0]?.id || null);
    setSelectedPhotoId(newDataset.photos[0]?.id || null);
    setDocTab('index'); // 初期表示はツリー先頭の工事基本情報（INDEX）

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
              onSelectIndex={() => setDocTab('index')}
              onSelectReport={handleTreeSelectReport}
              onSelectDrawing={handleTreeSelectDrawing}
              onSelectPhoto={setSelectedPhotoId}
            />

            {/* メイン: 書類・写真の左右分割ビュー */}
            <div className="flex-1 flex overflow-hidden">
              <SplitPane
                viewMode={viewMode}
                left={
                  <DocumentViewer
                    constructionInfo={dataset.constructionInfo}
                    reports={dataset.reports}
                    drawings={dataset.drawings}
                    selectedReportId={selectedReportId}
                    selectedDrawingId={selectedDrawingId}
                    activeTab={docTab}
                    inspectionRecords={inspectionRecords}
                    onSelectReport={setSelectedReportId}
                    onSelectDrawing={setSelectedDrawingId}
                    onActiveTabChange={setDocTab}
                    onUpdateInspection={handleUpdateInspection}
                  />
                }
                right={
                  <PhotoViewer
                    photos={dataset.photos}
                    selectedPhotoId={selectedPhotoId}
                    inspectionRecords={inspectionRecords}
                    onSelectPhoto={setSelectedPhotoId}
                    onUpdateInspection={handleUpdateInspection}
                  />
                }
              />
            </div>
          </main>

          {showReportModal && (
            <InspectionReportView
              constructionInfo={dataset.constructionInfo}
              inspectionRecords={inspectionRecords}
              onClose={() => setShowReportModal(false)}
            />
          )}
        </>
      )}
    </div>
  );
};

export default App;

