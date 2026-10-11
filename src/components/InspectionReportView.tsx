import React, { useRef } from 'react';
import { 
  X, 
  Download, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck,
  CheckCheck,
  FileJson,
  Upload,
  RotateCcw
} from 'lucide-react';
import type { ConstructionInfo, DrawingItem, InspectionRecord, PhotoItem, ReportItem } from '../types/cals';

interface InspectionReportViewProps {
  constructionInfo: ConstructionInfo;
  inspectionRecords: Record<string, InspectionRecord>;
  reports?: ReportItem[];
  drawings?: DrawingItem[];
  photos?: PhotoItem[];
  onClose: () => void;
  totalItemsCount?: number;
  onBulkMarkOk?: () => void;
  onResetInspection?: () => void;
  onImportBackup?: (records: Record<string, InspectionRecord>) => void;
}

export const InspectionReportView: React.FC<InspectionReportViewProps> = ({
  constructionInfo,
  inspectionRecords,
  reports = [],
  drawings = [],
  photos = [],
  onClose,
  totalItemsCount = 0,
  onBulkMarkOk,
  onResetInspection,
  onImportBackup,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const records = Object.values(inspectionRecords);
  const okRecords = records.filter(r => r.status === 'ok');
  const issueRecords = records.filter(r => r.status === 'issue');
  const uninspectedCount = totalItemsCount > records.length ? totalItemsCount - records.length : 0;

  // 書類・図面・写真の詳細メタデータを解決（保存済み値 優先、未保存時はIDから逆引き）
  const resolveMeta = (r: InspectionRecord) => {
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
  };

  // JSONバックアップ保存（エクスポート）
  const handleExportJson = () => {
    const jsonStr = JSON.stringify(inspectionRecords, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `検査記録バックアップ_${constructionInfo.constructionName}_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // JSONバックアップ読込（インポート）
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (typeof parsed === 'object' && parsed !== null) {
          if (onImportBackup) {
            onImportBackup(parsed);
          }
        } else {
          alert('有効な検査記録JSONファイルではありません。');
        }
      } catch (e) {
        console.error('JSON parse error:', e);
        alert('JSONファイルの読み込みに失敗しました。');
      }
    };
    reader.readAsText(file);
    // 次回同一ファイルでも発火するようにリセット
    e.target.value = '';
  };

  // CSVダウンロード処理 (UTF-8 BOM付き) - ファイル名や大分類を網羅
  const handleExportCsv = () => {
    const photoLabel = constructionInfo.deliveryType === 'consignment' ? '業務写真' : '工事写真';
    const headers = ['区分', '大分類・帳票名', '対象項目', 'ファイル名', '役割・細別', '測点・作成日', '判定', '指摘事項・確認メモ', '確認日時'];
    const rows = records.map(r => {
      const meta = resolveMeta(r);
      return [
        r.targetType === 'photo' ? photoLabel : r.targetType === 'report' ? '報告書類' : '完成図面',
        `"${(meta.groupTitle || '').replace(/"/g, '""')}"`,
        `"${r.targetTitle.replace(/"/g, '""')}"`,
        `"${(meta.fileName || '').replace(/"/g, '""')}"`,
        `"${(meta.fileRole || '').replace(/"/g, '""')}"`,
        `"${(meta.locationOrDate || '').replace(/"/g, '""')}"`,
        r.status === 'ok' ? '適 (確認済)' : r.status === 'issue' ? '要確認 (指摘)' : '未確認',
        `"${(r.notes || '').replace(/"/g, '""')}"`,
        r.updatedAt || '',
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `検査指摘調書_${constructionInfo.constructionName}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 印刷ダイアログの呼び出し
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 print:static print:inset-auto print:z-auto print:p-0 print:bg-white print:block print:overflow-visible print:h-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden print:static print:border-none print:w-full print:max-w-none print:max-h-none print:h-auto print:overflow-visible print:bg-white print:text-black print:shadow-none print:block">
        {/* モーダルヘッダー */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0 print:border-b-2 print:border-black print:bg-white">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg print:hidden">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white print:text-black">
                {constructionInfo.deliveryType === 'consignment' ? '業務委託成果' : '土木公共工事'} 電子納品検査調書・指摘事項一覧
              </h2>
              <div className="text-xs text-slate-400 print:text-gray-600">
                {constructionInfo.deliveryType === 'consignment' ? '業務名' : '工事名'}: {constructionInfo.constructionName} | 発注者: {constructionInfo.clientName}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow transition"
              title="Excelで開ける詳細CSVを出力（ファイル名・帳票グループ付き）"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV出力</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold shadow transition"
              title="検査調書を印刷またはPDF保存（全ページ出力対応）"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>印刷 / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* サマリー ＆ データ管理バー */}
        <div className="p-6 overflow-y-auto space-y-5 print:p-6 print:overflow-visible print:h-auto print:block print:space-y-4">
          {/* 検査データ管理・一括操作バー (印刷非表示) */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-2">
              {onBulkMarkOk && uninspectedCount > 0 && (
                <button
                  onClick={onBulkMarkOk}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition active:scale-95"
                  title="指摘（要確認）以外の未確認アイテムを一括で「適」にします"
                >
                  <CheckCheck className="w-4 h-4 text-emerald-200" />
                  <span>未確認を一括適にする（残り {uninspectedCount} 件）</span>
                </button>
              )}
              {uninspectedCount === 0 && totalItemsCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-2.5 py-1 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>全アイテム検査完了 (100%)</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* JSONバックアップ保存 */}
              <button
                onClick={handleExportJson}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition active:scale-95"
                title="検査結果・指摘事項をJSONファイルとして保存（別PCや後日の検査再開に使用可能）"
              >
                <FileJson className="w-3.5 h-3.5 text-blue-400" />
                <span>JSON保存</span>
              </button>

              {/* JSONバックアップ読込 */}
              {onImportBackup && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition active:scale-95"
                    title="以前保存したJSONバックアップから検査記録を復元"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-400" />
                    <span>JSON読込</span>
                  </button>
                </>
              )}

              {/* 記録リセット */}
              {onResetInspection && records.length > 0 && (
                <button
                  onClick={onResetInspection}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-100 border border-rose-800/60 rounded-lg text-xs font-medium transition active:scale-95"
                  title="この工事の検査記録を初期化"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                  <span>記録リセット</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4 print-avoid-break">
            <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl print:border print:border-gray-300">
              <div className="text-[11px] text-slate-400 print:text-gray-600 font-medium">点検記録件数</div>
              <div className="text-xl font-bold text-white print:text-black mt-1">{records.length} 件</div>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-800/60 p-3 rounded-xl print:border print:border-gray-300">
              <div className="text-[11px] text-emerald-400 print:text-gray-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>確認済 (適)</span>
              </div>
              <div className="text-xl font-bold text-emerald-300 print:text-black mt-1">{okRecords.length} 件</div>
            </div>
            <div className="bg-rose-950/40 border border-rose-800/60 p-3 rounded-xl print:border print:border-gray-300">
              <div className="text-[11px] text-rose-400 print:text-gray-600 font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>指摘・要確認</span>
              </div>
              <div className="text-xl font-bold text-rose-300 print:text-black mt-1">{issueRecords.length} 件</div>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl print:border print:border-gray-300">
              <div className="text-[11px] text-slate-400 print:text-gray-600 font-medium">調書作成日時</div>
              <div className="text-xs font-semibold text-slate-200 print:text-black mt-2">
                {new Date().toLocaleDateString('ja-JP')}
              </div>
            </div>
          </div>

          {/* 全記録テーブル */}
          <div className="pt-2">
            <h3 className="text-xs sm:text-sm font-bold text-slate-200 mb-2 print:text-black">
              全項目 検査点検一覧 ({records.length} 件)
            </h3>
            {records.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                点検記録がまだありません。写真や書類で「確認済」または「要確認」ボタンを押すとここに反映されます。
              </div>
            ) : (
              <div className="border border-slate-800 rounded-xl overflow-hidden print:border-gray-400 print:rounded-none">
                <table className="w-full text-xs text-left border-collapse print:text-black">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 print:bg-gray-100 print:text-black print:table-header-group">
                    <tr>
                      <th className="py-2 px-3 shrink-0">区分</th>
                      <th className="py-2 px-3">大分類・帳票名</th>
                      <th className="py-2 px-3">対象項目 / ファイル名</th>
                      <th className="py-2 px-3">役割 / 測点・日付</th>
                      <th className="py-2 px-3">判定</th>
                      <th className="py-2 px-3">指摘事項 / メモ</th>
                      <th className="py-2 px-3">確認日時</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 print:divide-gray-300">
                    {records.map((r) => {
                      const meta = resolveMeta(r);
                      return (
                        <tr key={r.targetId} className="hover:bg-slate-800/30 print:break-inside-avoid print-avoid-break">
                          <td className="py-2 px-3 text-slate-400 print:text-black whitespace-nowrap">
                            {r.targetType === 'photo' ? (constructionInfo.deliveryType === 'consignment' ? '業務写真' : '工事写真') : r.targetType === 'report' ? '報告書類' : '完成図面'}
                          </td>
                          <td className="py-2 px-3 text-slate-300 print:text-gray-900 font-medium">
                            {meta.groupTitle || 'ー'}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-100 print:text-black">
                            <div>{r.targetTitle}</div>
                            {meta.fileName && (
                              <div className="text-[11px] font-mono text-blue-400 print:text-blue-700">
                                {meta.fileName}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-300 print:text-gray-700 text-[11px]">
                            {meta.fileRole && <div>{meta.fileRole}</div>}
                            {meta.locationOrDate && <div className="text-slate-400 print:text-gray-500">{meta.locationOrDate}</div>}
                            {!meta.fileRole && !meta.locationOrDate && 'ー'}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            {r.status === 'ok' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold print:text-green-700">
                                <CheckCircle2 className="w-3.5 h-3.5" /> 適
                              </span>
                            ) : r.status === 'issue' ? (
                              <span className="inline-flex items-center gap-1 text-rose-400 font-semibold print:text-red-700">
                                <AlertCircle className="w-3.5 h-3.5" /> 要確認
                              </span>
                            ) : (
                              <span className="text-slate-500">未確認</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-300 print:text-black max-w-xs">
                            {r.notes || 'ー'}
                          </td>
                          <td className="py-2 px-3 text-[10px] text-slate-500 print:text-gray-600 whitespace-nowrap">
                            {r.updatedAt}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* モーダルフッター */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex justify-end print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
