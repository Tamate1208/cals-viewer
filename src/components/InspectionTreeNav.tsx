import React, { useState, useMemo } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  FileText, 
  FolderGit2, 
  Image as ImageIcon, 
  CheckCircle2, 
  AlertCircle, 
  Folder, 
  FolderOpen, 
  PanelLeftClose, 
  PanelLeftOpen, 
  Search, 
  Layers,
  ChevronsDown,
  ChevronsUp,
  Tag,
  FileSpreadsheet
} from 'lucide-react';
import type { DrawingItem, InspectionRecord, PhotoItem, ReportItem } from '../types/cals';

interface InspectionTreeNavProps {
  reports: ReportItem[];
  drawings: DrawingItem[];
  photos: PhotoItem[];
  selectedReportId: string | null;
  selectedDrawingId: string | null;
  selectedPhotoId: string | null;
  isIndexSelected?: boolean;
  inspectionRecords: Record<string, InspectionRecord>;
  onSelectIndex?: () => void;
  onSelectReport: (id: string) => void;
  onSelectDrawing: (id: string) => void;
  onSelectPhoto: (id: string) => void;
}

export const InspectionTreeNav: React.FC<InspectionTreeNavProps> = ({
  reports,
  drawings,
  photos,
  selectedReportId,
  selectedDrawingId,
  selectedPhotoId,
  isIndexSelected = false,
  inspectionRecords,
  onSelectIndex,
  onSelectReport,
  onSelectDrawing,
  onSelectPhoto,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'docs' | 'photos'>('docs');
  const [searchQuery, setSearchQuery] = useState('');

  // フォルダの展開/折りたたみ状態を管理（デフォルトは閉じた状態）
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (key: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isFolderOpen = (key: string) => {
    // 検索入力時は該当項目が見えるよう自動展開
    if (searchQuery.trim() !== '') return true;
    return !!expandedFolders[key];
  };

  // すべて展開
  const handleExpandAll = () => {
    const allKeys: Record<string, boolean> = {};
    // 書類キー
    Object.entries(docGroups).forEach(([cat, groupMap]) => {
      allKeys[`doc_cat_${cat}`] = true;
      Object.keys(groupMap).forEach(gt => {
        allKeys[`doc_sub_${cat}_${gt}`] = true;
      });
    });
    // 写真キー
    Object.entries(photoGroups).forEach(([wt, cats]) => {
      allKeys[`photo_wt_${wt}`] = true;
      Object.entries(cats).forEach(([cat, titles]) => {
        allKeys[`photo_cat_${wt}_${cat}`] = true;
        Object.keys(titles).forEach(t => {
          allKeys[`photo_title_${wt}_${cat}_${t}`] = true;
        });
      });
    });
    setExpandedFolders(allKeys);
  };

  // すべて閉じる
  const handleCollapseAll = () => {
    setExpandedFolders({});
  };

  // ==================== 書類ツリーの階層化 ====================
  // 帳票大分類 (MEET / PLAN / OTHRS / 図面) -> 帳票件名 (9月度履行報告書 等) -> [鑑, 本文...]
  const docGroups = useMemo(() => {
    const groups: Record<string, Record<string, { type: 'report' | 'drawing'; items: (ReportItem | DrawingItem)[] }>> = {};

    reports.forEach(r => {
      const typeName = r.type || '一般書類';
      const groupName = r.groupTitle || r.title || '書類';

      if (!groups[typeName]) {
        groups[typeName] = {};
      }
      if (!groups[typeName][groupName]) {
        groups[typeName][groupName] = { type: 'report', items: [] };
      }
      groups[typeName][groupName].items.push(r);
    });

    if (drawings.length > 0) {
      groups['完成図面・設計図'] = {
        '完成図面一式': { type: 'drawing', items: drawings },
      };
    }

    return groups;
  }, [reports, drawings]);

  // ==================== 写真ツリーの階層化 ====================
  // 工種 (砂防堰堤) -> 写真区分 (施工状況写真) -> 項目/タイトル (ICT掘削状況) -> 写真リスト
  const photoGroups = useMemo(() => {
    const groups: Record<string, Record<string, Record<string, PhotoItem[]>>> = {};

    photos.forEach(p => {
      const workType = p.workType || '一般工種';
      const category = p.category || '施工中';
      const titleGroup = p.title || '写真項目';

      if (!groups[workType]) {
        groups[workType] = {};
      }
      if (!groups[workType][category]) {
        groups[workType][category] = {};
      }
      if (!groups[workType][category][titleGroup]) {
        groups[workType][category][titleGroup] = [];
      }
      groups[workType][category][titleGroup].push(p);
    });

    return groups;
  }, [photos]);

  // 検索フィルター（書類）
  const filteredDocGroups = useMemo(() => {
    if (!searchQuery) return docGroups;
    const query = searchQuery.toLowerCase();
    const result: typeof docGroups = {};

    Object.entries(docGroups).forEach(([catName, groupMap]) => {
      const matchedGroups: typeof groupMap = {};
      Object.entries(groupMap).forEach(([gTitle, data]) => {
        const matchedItems = data.items.filter(item => 
          item.title.toLowerCase().includes(query) || 
          gTitle.toLowerCase().includes(query) ||
          catName.toLowerCase().includes(query)
        );
        if (matchedItems.length > 0) {
          matchedGroups[gTitle] = { type: data.type, items: matchedItems };
        }
      });
      if (Object.keys(matchedGroups).length > 0) {
        result[catName] = matchedGroups;
      }
    });

    return result;
  }, [docGroups, searchQuery]);

  // 検索フィルター（写真）
  const filteredPhotoGroups = useMemo(() => {
    if (!searchQuery) return photoGroups;
    const query = searchQuery.toLowerCase();
    const result: typeof photoGroups = {};

    Object.entries(photoGroups).forEach(([wt, cats]) => {
      const matchedCats: typeof cats = {};
      Object.entries(cats).forEach(([cat, titles]) => {
        const matchedTitles: typeof titles = {};
        Object.entries(titles).forEach(([titleName, list]) => {
          const matched = list.filter(p => 
            p.title.toLowerCase().includes(query) || 
            p.station?.toLowerCase().includes(query) ||
            p.remarks?.toLowerCase().includes(query) ||
            wt.toLowerCase().includes(query) ||
            cat.toLowerCase().includes(query)
          );
          if (matched.length > 0) {
            matchedTitles[titleName] = matched;
          }
        });
        if (Object.keys(matchedTitles).length > 0) {
          matchedCats[cat] = matchedTitles;
        }
      });
      if (Object.keys(matchedCats).length > 0) {
        result[wt] = matchedCats;
      }
    });

    return result;
  }, [photoGroups, searchQuery]);

  // 折りたたまれている場合のミニバー
  if (!isOpen) {
    return (
      <div className="w-10 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-3 select-none shrink-0 z-20">
        <button
          onClick={() => setIsOpen(true)}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition mb-4"
          title="検査ツリーを展開"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>

        <button
          onClick={() => { setIsOpen(true); setActiveTab('docs'); }}
          className={`p-1.5 rounded-lg transition mb-2 ${
            activeTab === 'docs' ? 'text-blue-400 bg-blue-600/20' : 'text-slate-500 hover:text-slate-300'
          }`}
          title="書類ツリー"
        >
          <FileText className="w-4 h-4" />
        </button>

        <button
          onClick={() => { setIsOpen(true); setActiveTab('photos'); }}
          className={`p-1.5 rounded-lg transition ${
            activeTab === 'photos' ? 'text-blue-400 bg-blue-600/20' : 'text-slate-500 hover:text-slate-300'
          }`}
          title="写真ツリー"
        >
          <ImageIcon className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const totalDocsCount = reports.length + drawings.length;
  const totalPhotosCount = photos.length;

  return (
    <div className="w-64 sm:w-72 bg-slate-950 border-r border-slate-800 flex flex-col h-full select-none shrink-0 z-20">
      {/* ツリーヘッダー */}
      <div className="p-2.5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/40">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
          <Layers className="w-4 h-4 text-blue-400" />
          <span>検査対象ツリー</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExpandAll}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
            title="すべて展開"
          >
            <ChevronsDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCollapseAll}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
            title="すべて閉じる"
          >
            <ChevronsUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition ml-1"
            title="ツリーパネルを隠す"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* タブ切り替え: 書類・図面 / 工事写真 */}
      <div className="grid grid-cols-2 p-1.5 gap-1 bg-slate-900/60 border-b border-slate-800 shrink-0 text-xs">
        <button
          onClick={() => setActiveTab('docs')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-semibold transition ${
            activeTab === 'docs'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>書類 ({totalDocsCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('photos')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-semibold transition ${
            activeTab === 'photos'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>写真 ({totalPhotosCount})</span>
        </button>
      </div>

      {/* 検索入力 */}
      <div className="p-2 border-b border-slate-800 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder={activeTab === 'docs' ? "書類・帳票を検索..." : "工種・項目・測点を検索..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-2 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* ツリーコンテンツ */}
      <div className="flex-1 overflow-y-auto p-2 text-xs divide-y divide-transparent">
        {activeTab === 'docs' ? (
          /* ==================== 書類ツリー (工事基本情報 + 大分類 > 帳票名 > 鑑・本文) ==================== */
          <div>
            {/* 工事基本情報 (INDEX_C.XML) */}
            {(!searchQuery || 
              '工事基本情報'.toLowerCase().includes(searchQuery.toLowerCase()) || 
              'index'.toLowerCase().includes(searchQuery.toLowerCase()) || 
              '工事概要'.toLowerCase().includes(searchQuery.toLowerCase()) ||
              '概要'.toLowerCase().includes(searchQuery.toLowerCase())
            ) && (
              <div className="mb-2 pb-2 border-b border-slate-800">
                <button
                  onClick={() => onSelectIndex?.()}
                  className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition font-semibold ${
                    isIndexSelected
                      ? 'bg-blue-600/25 text-blue-300 border border-blue-500/50 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileSpreadsheet className={`w-4 h-4 shrink-0 ${isIndexSelected ? 'text-blue-400' : 'text-emerald-400'}`} />
                    <span className="truncate text-xs">工事基本情報 (INDEX)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 bg-slate-850 px-1.5 py-0.5 rounded border border-slate-750 shrink-0">
                    概要
                  </span>
                </button>
              </div>
            )}

            {Object.keys(filteredDocGroups).length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-xs">該当する書類がありません</div>
            ) : (
              <div className="space-y-1">
              {Object.entries(filteredDocGroups).map(([catName, groupMap]) => {
                const catKey = `doc_cat_${catName}`;
                const catOpen = isFolderOpen(catKey);
                const totalInCat = Object.values(groupMap).reduce((acc, g) => acc + g.items.length, 0);

                return (
                  <div key={catName} className="select-none">
                    {/* 第1階層: 帳票種別 (打合せ簿, 施工計画書, 完成図面 等) */}
                    <div
                      onClick={() => toggleFolder(catKey)}
                      className="flex items-center justify-between p-1.5 rounded hover:bg-slate-900 cursor-pointer text-slate-200 font-semibold group transition"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {catOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        )}
                        <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="truncate group-hover:text-white">{catName}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded-full shrink-0">
                        {totalInCat}
                      </span>
                    </div>

                    {/* 第2階層: 帳票件名 (9月度履行報告書, 施工計画書(当初) 等) */}
                    {catOpen && (
                      <div className="ml-3 pl-2 border-l border-slate-800 space-y-1 mt-0.5">
                        {Object.entries(groupMap).map(([gTitle, data]) => {
                          const subKey = `doc_sub_${catName}_${gTitle}`;
                          const subOpen = isFolderOpen(subKey);
                          const items = data.items;
                          const isSingle = items.length === 1 && items[0].title === gTitle;

                          // 単独ファイルの場合は階層を深くせず直接表示
                          if (isSingle) {
                            const item = items[0];
                            const isDrawing = data.type === 'drawing';
                            const isSelected = isDrawing ? item.id === selectedDrawingId : item.id === selectedReportId;
                            const rec = inspectionRecords[item.id];

                            return (
                              <button
                                key={item.id}
                                onClick={() => isDrawing ? onSelectDrawing(item.id) : onSelectReport(item.id)}
                                className={`w-full text-left p-1 rounded flex items-start gap-1.5 transition ${
                                  isSelected
                                    ? 'bg-blue-600/25 text-blue-300 font-semibold border border-blue-500/40'
                                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                                }`}
                              >
                                <div className="mt-0.5 shrink-0">
                                  {rec?.status === 'ok' ? (
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  ) : rec?.status === 'issue' ? (
                                    <AlertCircle className="w-3 h-3 text-rose-400" />
                                  ) : isDrawing ? (
                                    <FolderGit2 className="w-3 h-3 text-slate-500" />
                                  ) : (
                                    <FileText className="w-3 h-3 text-slate-500" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1 truncate text-xs">{item.title}</div>
                              </button>
                            );
                          }

                          return (
                            <div key={gTitle}>
                              <div
                                onClick={() => toggleFolder(subKey)}
                                className="flex items-center justify-between p-1 rounded hover:bg-slate-900/60 cursor-pointer text-slate-300 font-medium group transition"
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  {subOpen ? (
                                    <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                                  )}
                                  {subOpen ? (
                                    <FolderOpen className="w-3 h-3 text-blue-400 shrink-0" />
                                  ) : (
                                    <Folder className="w-3 h-3 text-slate-500 shrink-0" />
                                  )}
                                  <span className="text-[11px] truncate group-hover:text-slate-100">{gTitle}</span>
                                </div>
                                <span className="text-[9px] text-slate-500 bg-slate-900 px-1.5 py-0.2 rounded shrink-0">
                                  {items.length}
                                </span>
                              </div>

                              {/* 第3階層: 鑑・本文・添付ファイルリスト */}
                              {subOpen && (
                                <div className="ml-3 pl-2 border-l border-slate-800/70 space-y-0.5 mt-0.5">
                                  {items.map((item) => {
                                    const isDrawing = data.type === 'drawing';
                                    const isSelected = isDrawing ? item.id === selectedDrawingId : item.id === selectedReportId;
                                    const rec = inspectionRecords[item.id];
                                    const role = ('fileRole' in item && item.fileRole) ? item.fileRole : '本紙';

                                    return (
                                      <button
                                        key={item.id}
                                        onClick={() => isDrawing ? onSelectDrawing(item.id) : onSelectReport(item.id)}
                                        className={`w-full text-left p-1 rounded flex items-start gap-1.5 transition ${
                                          isSelected
                                            ? 'bg-blue-600/25 text-blue-300 font-semibold border border-blue-500/40'
                                            : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                                        }`}
                                      >
                                        <div className="mt-0.5 shrink-0">
                                          {rec?.status === 'ok' ? (
                                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                          ) : rec?.status === 'issue' ? (
                                            <AlertCircle className="w-3 h-3 text-rose-400" />
                                          ) : (
                                            <FileText className="w-3 h-3 text-slate-500" />
                                          )}
                                        </div>
                                        <div className="min-w-0 flex-1 truncate text-[11px]">
                                          <span className="font-semibold text-slate-300 mr-1">[{role}]</span>
                                          <span>{item.fileName}</span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>
        ) : (
          /* ==================== 工事写真ツリー (工種 > 区分 > 項目 > 写真) ==================== */
          Object.keys(filteredPhotoGroups).length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-xs">該当する写真がありません</div>
          ) : (
            <div className="space-y-1">
              {Object.entries(filteredPhotoGroups).map(([workType, cats]) => {
                const wtKey = `photo_wt_${workType}`;
                const wtOpen = isFolderOpen(wtKey);
                const totalInWt = Object.values(cats).reduce(
                  (acc, titles) => acc + Object.values(titles).reduce((a, l) => a + l.length, 0), 
                  0
                );

                return (
                  <div key={workType} className="select-none">
                    {/* 第1階層: 工種 (砂防堰堤 等) */}
                    <div
                      onClick={() => toggleFolder(wtKey)}
                      className="flex items-center justify-between p-1.5 rounded hover:bg-slate-900 cursor-pointer text-slate-200 font-semibold group transition"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {wtOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        )}
                        <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate group-hover:text-white">{workType}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded-full shrink-0">
                        {totalInWt}
                      </span>
                    </div>

                    {/* 第2階層: 写真区分 (施工状況写真, 着手前及び完成写真 等) */}
                    {wtOpen && (
                      <div className="ml-3 pl-2 border-l border-slate-800 space-y-1 mt-0.5">
                        {Object.entries(cats).map(([category, titles]) => {
                          const catKey = `photo_cat_${workType}_${category}`;
                          const catOpen = isFolderOpen(catKey);
                          const totalInCat = Object.values(titles).reduce((a, l) => a + l.length, 0);

                          return (
                            <div key={category}>
                              <div
                                onClick={() => toggleFolder(catKey)}
                                className="flex items-center justify-between p-1 rounded hover:bg-slate-900/60 cursor-pointer text-slate-300 font-medium group transition"
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  {catOpen ? (
                                    <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                                  )}
                                  <span className="text-[11px] truncate group-hover:text-slate-100">{category}</span>
                                </div>
                                <span className="text-[9px] text-slate-500 bg-slate-900 px-1.5 py-0.2 rounded shrink-0">
                                  {totalInCat}
                                </span>
                              </div>

                              {/* 第3階層: 項目/写真タイトル (ICT掘削状況, 床掘完了 等) */}
                              {catOpen && (
                                <div className="ml-3 pl-2 border-l border-slate-800/60 space-y-0.5 mt-0.5">
                                  {Object.entries(titles).map(([titleName, photoList]) => {
                                    const titleKey = `photo_title_${workType}_${category}_${titleName}`;
                                    const titleOpen = isFolderOpen(titleKey);

                                    return (
                                      <div key={titleName}>
                                        <div
                                          onClick={() => toggleFolder(titleKey)}
                                          className="flex items-center justify-between p-1 rounded hover:bg-slate-900/80 cursor-pointer text-slate-400 group transition"
                                        >
                                          <div className="flex items-center gap-1 truncate">
                                            {titleOpen ? (
                                              <ChevronDown className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                                            ) : (
                                              <ChevronRight className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                                            )}
                                            <Tag className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                            <span className="text-[10px] font-medium truncate group-hover:text-slate-200">
                                              {titleName}
                                            </span>
                                          </div>
                                          <span className="text-[9px] text-slate-500 bg-slate-900 px-1 py-0.2 rounded shrink-0">
                                            {photoList.length}
                                          </span>
                                        </div>

                                        {/* 第4階層: 写真アイテム (測点・ファイル名) */}
                                        {titleOpen && (
                                          <div className="ml-3 pl-2 border-l border-slate-800/40 space-y-0.5 mt-0.5">
                                            {photoList.map((photo) => {
                                              const isSelected = photo.id === selectedPhotoId;
                                              const rec = inspectionRecords[photo.id];

                                              return (
                                                <button
                                                  key={photo.id}
                                                  onClick={() => onSelectPhoto(photo.id)}
                                                  className={`w-full text-left p-1 rounded flex items-start gap-1.5 transition ${
                                                    isSelected
                                                      ? 'bg-blue-600/25 text-blue-300 font-semibold border border-blue-500/40'
                                                      : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                                                  }`}
                                                >
                                                  <div className="mt-0.5 shrink-0">
                                                    {rec?.status === 'ok' ? (
                                                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                                    ) : rec?.status === 'issue' ? (
                                                      <AlertCircle className="w-3 h-3 text-rose-400" />
                                                    ) : (
                                                      <ImageIcon className="w-3 h-3 text-slate-500" />
                                                    )}
                                                  </div>
                                                  <div className="min-w-0 flex-1">
                                                    <div className="truncate text-[10px] leading-tight text-slate-300">
                                                      {photo.station || photo.fileName}
                                                    </div>
                                                    {photo.date && (
                                                      <div className="text-[9px] text-slate-500">{photo.date}</div>
                                                    )}
                                                  </div>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
};
