import React from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  ExternalLink, 
  FileSpreadsheet,
  Download,
  Compass
} from 'lucide-react';
import type { ConstructionInfo, DrawingItem, InspectionRecord, ReportItem } from '../types/cals';


interface DocumentViewerProps {
  constructionInfo: ConstructionInfo;
  reports: ReportItem[];
  drawings: DrawingItem[];
  selectedReportId?: string | null;
  selectedDrawingId?: string | null;
  activeTab?: 'reports' | 'drawings' | 'index';
  inspectionRecords: Record<string, InspectionRecord>;
  onActiveTabChange?: (tab: 'reports' | 'drawings' | 'index') => void;
  onUpdateInspection: (record: InspectionRecord) => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  constructionInfo,
  reports,
  drawings,
  selectedReportId: controlledReportId,
  selectedDrawingId: controlledDrawingId,
  activeTab = 'reports',
  inspectionRecords,
  onUpdateInspection,
}) => {
  const selectedReportId = controlledReportId || reports[0]?.id || null;
  const selectedDrawingId = controlledDrawingId || drawings[0]?.id || null;

  // 選択中のアイテム
  const currentReport = reports.find(r => r.id === selectedReportId) || reports[0];
  const currentDrawing = drawings.find(d => d.id === selectedDrawingId) || drawings[0];

  // 現在表示中の対象
  const currentItem = activeTab === 'reports' ? currentReport : activeTab === 'drawings' ? currentDrawing : null;
  const currentItemId = currentItem ? currentItem.id : null;
  const currentRecord = currentItemId ? inspectionRecords[currentItemId] : undefined;

  // 検査ステータス更新
  const handleSetStatus = (status: 'ok' | 'issue') => {
    if (!currentItem) return;
    const isDoc = activeTab === 'reports';
    const reportItem = isDoc ? (currentItem as ReportItem) : undefined;
    const drawingItem = !isDoc ? (currentItem as DrawingItem) : undefined;

    onUpdateInspection({
      targetId: currentItem.id,
      targetType: isDoc ? 'report' : 'drawing',
      targetTitle: currentItem.title,
      status: currentRecord?.status === status ? 'pending' : status,
      notes: currentRecord?.notes || '',
      updatedAt: new Date().toLocaleString('ja-JP'),
      fileName: currentItem.fileName,
      groupTitle: reportItem?.groupTitle || (isDoc ? currentItem.type : '完成図面'),
      fileRole: reportItem?.fileRole || (drawingItem?.scale ? `縮尺: ${drawingItem.scale}` : undefined),
      subCategory: currentItem.type,
      locationOrDate: reportItem?.createDate,
    });
  };

  const handleUpdateNotes = (notes: string) => {
    if (!currentItem) return;
    const isDoc = activeTab === 'reports';
    const reportItem = isDoc ? (currentItem as ReportItem) : undefined;
    const drawingItem = !isDoc ? (currentItem as DrawingItem) : undefined;

    onUpdateInspection({
      targetId: currentItem.id,
      targetType: isDoc ? 'report' : 'drawing',
      targetTitle: currentItem.title,
      status: currentRecord?.status || 'issue',
      notes,
      updatedAt: new Date().toLocaleString('ja-JP'),
      fileName: currentItem.fileName,
      groupTitle: reportItem?.groupTitle || (isDoc ? currentItem.type : '完成図面'),
      fileRole: reportItem?.fileRole || (drawingItem?.scale ? `縮尺: ${drawingItem.scale}` : undefined),
      subCategory: currentItem.type,
      locationOrDate: reportItem?.createDate,
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 text-slate-100 border-r border-slate-800">
      {/* 工事概要（INDEX）選択時 */}
      {activeTab === 'index' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>工事基本情報（INDEX_C.XML）</span>
            </h3>
            <table className="w-full text-xs border-collapse">
              <tbody>
                <tr className="border-b border-slate-800/80">
                  <th className="py-2.5 px-3 bg-slate-900 text-slate-400 text-left font-medium w-1/3">工事名称</th>
                  <td className="py-2.5 px-3 text-slate-100 font-bold">{constructionInfo.constructionName}</td>
                </tr>
                <tr className="border-b border-slate-800/80">
                  <th className="py-2.5 px-3 bg-slate-900 text-slate-400 text-left font-medium">路線・河川名</th>
                  <td className="py-2.5 px-3 text-slate-200">{constructionInfo.lineRiverName || 'ー'}</td>
                </tr>
                <tr className="border-b border-slate-800/80">
                  <th className="py-2.5 px-3 bg-slate-900 text-slate-400 text-left font-medium">発注者</th>
                  <td className="py-2.5 px-3 text-slate-200">{constructionInfo.clientName}</td>
                </tr>
                <tr className="border-b border-slate-800/80">
                  <th className="py-2.5 px-3 bg-slate-900 text-slate-400 text-left font-medium">請負者（受注者）</th>
                  <td className="py-2.5 px-3 text-slate-200">{constructionInfo.contractorName}</td>
                </tr>
                <tr className="border-b border-slate-800/80">
                  <th className="py-2.5 px-3 bg-slate-900 text-slate-400 text-left font-medium">契約番号</th>
                  <td className="py-2.5 px-3 text-slate-200">{constructionInfo.contractNumber || 'ー'}</td>
                </tr>
                <tr className="border-b border-slate-800/80">
                  <th className="py-2.5 px-3 bg-slate-900 text-slate-400 text-left font-medium">工期</th>
                  <td className="py-2.5 px-3 text-slate-200">
                    {constructionInfo.startDate || ''} 〜 {constructionInfo.endDate || ''}
                  </td>
                </tr>
                <tr className="border-b border-slate-800/80">
                  <th className="py-2.5 px-3 bg-slate-900 text-slate-400 text-left font-medium">工事場所</th>
                  <td className="py-2.5 px-3 text-slate-200">{constructionInfo.place || 'ー'}</td>
                </tr>
                <tr className="border-b border-slate-800/80">
                  <th className="py-2.5 px-3 bg-slate-900 text-slate-400 text-left font-medium">監督員</th>
                  <td className="py-2.5 px-3 text-slate-200">{constructionInfo.supervisor || 'ー'}</td>
                </tr>
                <tr>
                  <th className="py-2.5 px-3 bg-slate-900 text-slate-400 text-left font-medium">主任/監理技術者</th>
                  <td className="py-2.5 px-3 text-slate-200">{constructionInfo.chiefEngineer || 'ー'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* 報告書 または 図面ペイン (一覧サイドバーを廃止し全幅プレビュー表示) */
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-900">
          {currentItem ? (
              <>
                {/* プレビュー上部ヘッダー */}
                <div className="p-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                      {currentItem.title}
                    </h3>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>ファイル: {currentItem.fileName}</span>
                      {currentItem.filePath && <span className="text-slate-500">({currentItem.filePath})</span>}
                    </div>
                  </div>

                  {currentItem.fileUrl && (
                    <a
                      href={currentItem.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-slate-200 text-xs bg-slate-800 rounded hover:bg-slate-700 transition shrink-0"
                      title="別タブで開く"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">別窓</span>
                    </a>
                  )}
                </div>

                {/* PDF/CAD/インラインプレビュー本体 */}
                <div className="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center">
                  {(() => {
                    const isCad = /\.(p21|sfc|dwg|dxf)$/i.test(currentItem.fileName || '');
                    if (isCad) {
                      return (
                        <div className="p-8 max-w-lg text-center flex flex-col items-center bg-slate-900/60 border border-slate-800 rounded-2xl shadow-xl">
                          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4 shadow-inner">
                            <Compass className="w-8 h-8" />
                          </div>
                          <span className="text-[11px] font-semibold text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20 mb-2">
                            SXF (P21) CAD図面データ
                          </span>
                          <h4 className="text-base font-bold text-slate-100 mb-2 leading-snug">
                            {currentItem.title}
                          </h4>
                          <div className="text-xs text-slate-400 space-y-1 mb-6 bg-slate-950/80 p-3 rounded-lg border border-slate-800 w-full text-left">
                            <div className="flex justify-between">
                              <span className="text-slate-500">ファイル名:</span>
                              <span className="font-mono text-slate-300">{currentItem.fileName}</span>
                            </div>
                            {('scale' in currentItem) && (currentItem as any).scale && (
                              <div className="flex justify-between">
                                <span className="text-slate-500">縮尺:</span>
                                <span className="text-slate-300">{(currentItem as any).scale}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-slate-500">形式:</span>
                              <span className="text-slate-300">電子納品 CAD図面 (ISO 10303-21)</span>
                            </div>
                          </div>
                          {currentItem.fileUrl ? (
                            <a
                              href={currentItem.fileUrl}
                              download={currentItem.fileName}
                              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/20 transition active:scale-95"
                            >
                              <Download className="w-4 h-4" />
                              <span>CAD図面ファイルをダウンロード</span>
                            </a>
                          ) : (
                            <p className="text-xs text-amber-400">ファイルの実体が読み込まれていません</p>
                          )}
                          <p className="text-[11px] text-slate-500 mt-3">
                            ※SXF形式（.p21）は専用CADビューアまたは武蔵等のCADソフトで詳細を閲覧できます
                          </p>
                        </div>
                      );
                    }

                    if (currentItem.fileUrl) {
                      return (
                        <iframe
                          src={currentItem.fileUrl}
                          title={currentItem.title}
                          className="w-full h-full border-none bg-white"
                        />
                      );
                    }

                    return (
                      <div className="p-8 text-center text-slate-500 flex flex-col items-center">
                        <FileText className="w-12 h-12 text-slate-700 mb-3" />
                        <p className="text-sm font-medium">プレビューファイルが見つかりません</p>
                        <p className="text-xs text-slate-600 mt-1">（{currentItem.fileName} は未格納または別フォルダにあります）</p>
                      </div>
                    );
                  })()}
                </div>

                {/* 下部: 検査確認バー */}
                <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSetStatus('ok')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        currentRecord?.status === 'ok'
                          ? 'bg-emerald-600 text-white shadow'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-emerald-400'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{currentRecord?.status === 'ok' ? '確認済 (適)' : '確認済みにする'}</span>
                    </button>

                    <button
                      onClick={() => handleSetStatus('issue')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        currentRecord?.status === 'issue'
                          ? 'bg-rose-600 text-white shadow'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-rose-400'
                      }`}
                    >
                      <AlertCircle className="w-4 h-4" />
                      <span>{currentRecord?.status === 'issue' ? '要確認・指摘中' : '要確認・指摘'}</span>
                    </button>
                  </div>

                  {/* 指摘・メモ入力 */}
                  <div className="flex-1 max-w-md">
                    <input
                      type="text"
                      placeholder="検査指摘事項・確認メモ（例: 印影確認、別紙参照など）"
                      value={currentRecord?.notes || ''}
                      onChange={(e) => handleUpdateNotes(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-slate-500 text-sm">
                書類を選択してください
              </div>
            )}
          </div>
      )}
    </div>
  );
};
