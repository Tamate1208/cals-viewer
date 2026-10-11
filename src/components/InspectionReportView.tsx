import React from 'react';
import { 
  X, 
  Download, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck 
} from 'lucide-react';
import type { ConstructionInfo, InspectionRecord } from '../types/cals';


interface InspectionReportViewProps {
  constructionInfo: ConstructionInfo;
  inspectionRecords: Record<string, InspectionRecord>;
  onClose: () => void;
}

export const InspectionReportView: React.FC<InspectionReportViewProps> = ({
  constructionInfo,
  inspectionRecords,
  onClose,
}) => {
  const records = Object.values(inspectionRecords);
  const okRecords = records.filter(r => r.status === 'ok');
  const issueRecords = records.filter(r => r.status === 'issue');

  // CSVダウンロード処理 (UTF-8 BOM付き)
  const handleExportCsv = () => {
    const headers = ['対象種別', '対象タイトル', '検査結果', '指摘事項・確認メモ', '確認日時'];
    const rows = records.map(r => [
      r.targetType === 'photo' ? '工事写真' : r.targetType === 'report' ? '報告書類' : '完成図面',
      `"${r.targetTitle.replace(/"/g, '""')}"`,
      r.status === 'ok' ? '適 (確認済)' : r.status === 'issue' ? '要確認 (指摘)' : '未確認',
      `"${(r.notes || '').replace(/"/g, '""')}"`,
      r.updatedAt || '',
    ]);

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
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden print:m-0 print:p-0 print:border-none print:w-full print:max-h-full print:bg-white print:text-black">
        {/* モーダルヘッダー */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0 print:border-b-2 print:border-black print:bg-white">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg print:hidden">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white print:text-black">
                土木公共工事 電子納品検査調書・指摘事項一覧
              </h2>
              <div className="text-xs text-slate-400 print:text-gray-600">
                工事名: {constructionInfo.constructionName} | 発注者: {constructionInfo.clientName}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow transition"
              title="Excelで開けるCSVを出力"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV出力</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold shadow transition"
              title="検査調書を印刷またはPDF保存"
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

        {/* サマリーカード */}
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
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
              <div className="text-[11px] text-slate-400 print:text-gray-600 font-medium">作成日時</div>
              <div className="text-xs font-semibold text-slate-200 print:text-black mt-2">
                {new Date().toLocaleDateString('ja-JP')}
              </div>
            </div>
          </div>

          {/* 指摘事項ハイライト */}
          {issueRecords.length > 0 && (
            <div className="bg-rose-950/30 border border-rose-800/80 rounded-xl p-4">
              <h3 className="text-xs sm:text-sm font-bold text-rose-300 mb-2 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <span>要確認・指摘事項 ({issueRecords.length} 件)</span>
              </h3>
              <div className="space-y-2">
                {issueRecords.map((r) => (
                  <div key={r.targetId} className="bg-slate-950/80 p-2.5 rounded-lg border border-rose-900/40 text-xs">
                    <div className="flex items-center justify-between text-slate-300 font-medium mb-1">
                      <span>[{r.targetType === 'photo' ? '写真' : r.targetType === 'report' ? '書類' : '図面'}] {r.targetTitle}</span>
                      <span className="text-[10px] text-slate-500">{r.updatedAt}</span>
                    </div>
                    <div className="text-rose-200 bg-rose-950/50 p-2 rounded border border-rose-900/50 font-medium">
                      指摘メモ: {r.notes || '（指摘内容未記入）'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 全記録テーブル */}
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-200 mb-2 print:text-black">
              検査点検一覧
            </h3>
            {records.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                点検記録がまだありません。写真や書類で「確認済」または「要確認」ボタンを押すとここに反映されます。
              </div>
            ) : (
              <div className="border border-slate-800 rounded-xl overflow-hidden print:border-gray-400">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 print:bg-gray-100 print:text-black">
                    <tr>
                      <th className="py-2 px-3">区分</th>
                      <th className="py-2 px-3">対象項目</th>
                      <th className="py-2 px-3">判定</th>
                      <th className="py-2 px-3">指摘事項 / メモ</th>
                      <th className="py-2 px-3">確認日時</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 print:divide-gray-300">
                    {records.map((r) => (
                      <tr key={r.targetId} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-400 print:text-black">
                          {r.targetType === 'photo' ? '工事写真' : r.targetType === 'report' ? '報告書類' : '図面'}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-200 print:text-black">
                          {r.targetTitle}
                        </td>
                        <td className="py-2 px-3">
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
                        <td className="py-2 px-3 text-slate-300 print:text-black">
                          {r.notes || 'ー'}
                        </td>
                        <td className="py-2 px-3 text-[10px] text-slate-500 print:text-gray-600">
                          {r.updatedAt}
                        </td>
                      </tr>
                    ))}
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
