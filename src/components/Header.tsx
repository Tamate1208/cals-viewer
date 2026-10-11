import React from 'react';
import type { ConstructionInfo, InspectionRecord } from '../types/cals';

import { 
  Building2, 
  Calendar, 
  Columns2, 
  FileSpreadsheet, 
  FileText, 
  FolderOpen, 
  Image, 
  ShieldCheck, 
  UserCheck 
} from 'lucide-react';

interface HeaderProps {
  constructionInfo: ConstructionInfo;
  inspectionRecords: Record<string, InspectionRecord>;
  totalItemsCount: number;
  viewMode: 'split' | 'doc-only' | 'photo-only';
  onViewModeChange: (mode: 'split' | 'doc-only' | 'photo-only') => void;
  onOpenFolderClick: () => void;
  onOpenReportModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  constructionInfo,
  inspectionRecords,
  totalItemsCount,
  viewMode,
  onViewModeChange,
  onOpenFolderClick,
  onOpenReportModal,
}) => {
  // 検査進捗計算
  const records = Object.values(inspectionRecords);
  const okCount = records.filter(r => r.status === 'ok').length;
  const issueCount = records.filter(r => r.status === 'issue').length;
  const inspectedCount = okCount + issueCount;
  const progressPercent = totalItemsCount > 0 ? Math.round((inspectedCount / totalItemsCount) * 100) : 0;

  return (
    <header className="bg-slate-900 text-slate-100 border-b border-slate-800 shrink-0 select-none shadow-md z-20">
      {/* 上段: アプリタイトル・工事名・アクションボタン */}
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* 左側: アプリ名 ＆ 工事名称 */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 bg-blue-600/30 text-blue-400 border border-blue-500/40 px-2.5 py-1 rounded text-xs font-semibold tracking-wide shrink-0">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>広島県 電子納品検査</span>
          </div>
          <div className="truncate">
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight truncate flex items-center gap-2">
              <span>{constructionInfo.constructionName}</span>
              {constructionInfo.lineRiverName && (
                <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                  {constructionInfo.lineRiverName}
                </span>
              )}
            </h1>
          </div>
        </div>

        {/* 右側: ビュー切替 ＆ アクション */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* 画面分割切り替えボタン */}
          <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-xs">
            <button
              onClick={() => onViewModeChange('split')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition ${
                viewMode === 'split' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="書類と写真を左右に並べて突合検査"
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">左右分割</span>
            </button>
            <button
              onClick={() => onViewModeChange('doc-only')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition ${
                viewMode === 'doc-only' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="書類・図面を全画面表示"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">書類のみ</span>
            </button>
            <button
              onClick={() => onViewModeChange('photo-only')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition ${
                viewMode === 'photo-only' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="工事写真を全画面表示"
            >
              <Image className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">写真のみ</span>
            </button>
          </div>

          {/* 検査調書・指摘エクスポートボタン */}
          <button
            onClick={onOpenReportModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow transition active:scale-95"
            title="検査結果・指摘事項をCSVや印刷で出力"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
            <span>検査調書・出力</span>
            {issueCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-1">
                指摘 {issueCount}
              </span>
            )}
          </button>

          {/* 別フォルダ選択 */}
          <button
            onClick={onOpenFolderClick}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700 transition"
            title="別の電子納品フォルダやZIPを開く"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">フォルダ変更</span>
          </button>
        </div>
      </div>

      {/* 下段: 発注者・請負者・工期 & 検査進捗ゲージ */}
      <div className="bg-slate-950/70 px-4 py-1.5 flex flex-wrap items-center justify-between text-xs text-slate-400 border-t border-slate-800/60 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-1 text-slate-300">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">発注:</span>
            <span className="font-medium text-slate-200">{constructionInfo.clientName || '広島県'}</span>
          </div>
          <div className="flex items-center gap-1 text-slate-300">
            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">受注:</span>
            <span className="font-medium text-slate-200">{constructionInfo.contractorName || '未設定'}</span>
          </div>
          {(constructionInfo.startDate || constructionInfo.endDate) && (
            <div className="flex items-center gap-1 text-slate-300 hidden md:flex">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">工期:</span>
              <span>{constructionInfo.startDate || ''} 〜 {constructionInfo.endDate || ''}</span>
            </div>
          )}
        </div>

        {/* 検査ステータス進捗 */}
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span>検査進捗:</span>
            <span className="font-bold text-slate-200">{inspectedCount} / {totalItemsCount}</span>
            <span className="text-slate-400">({progressPercent}%)</span>
            <span className="text-emerald-400 ml-1">● 適: {okCount}</span>
            {issueCount > 0 && <span className="text-rose-400 ml-1">▲ 要確認: {issueCount}</span>}
          </div>
          {/* プログレスバー */}
          <div className="w-24 sm:w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
            <div 
              className="bg-emerald-500 h-full transition-all duration-300"
              style={{ width: `${totalItemsCount > 0 ? (okCount / totalItemsCount) * 100 : 0}%` }}
            />
            <div 
              className="bg-rose-500 h-full transition-all duration-300"
              style={{ width: `${totalItemsCount > 0 ? (issueCount / totalItemsCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>
    </header>
  );
};
