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
  Layers
} from 'lucide-react';
import type { DrawingItem, InspectionRecord, PhotoItem, ReportItem } from '../types/cals';

interface InspectionTreeNavProps {
  reports: ReportItem[];
  drawings: DrawingItem[];
  photos: PhotoItem[];
  selectedReportId: string | null;
  selectedDrawingId: string | null;
  selectedPhotoId: string | null;
  inspectionRecords: Record<string, InspectionRecord>;
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
  inspectionRecords,
  onSelectReport,
  onSelectDrawing,
  onSelectPhoto,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'docs' | 'photos'>('docs');
  const [searchQuery, setSearchQuery] = useState('');

  // フォルダの展開/折りたたみ状態を管理
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (key: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key], // デフォルトは展開(true)とするため反転
    }));
  };

  const isFolderOpen = (key: string) => {
    return expandedFolders[key] !== false; // デフォルト展開
  };

  // 書類の種別グループ化
  const docGroups = useMemo(() => {
    const groups: Record<string, { type: 'report' | 'drawing'; items: (ReportItem | DrawingItem)[] }> = {};

    reports.forEach(r => {
      const typeName = r.type || '一般書類';
      if (!groups[typeName]) {
        groups[typeName] = { type: 'report', items: [] };
      }
      groups[typeName].items.push(r);
    });

    if (drawings.length > 0) {
      groups['完成図面・施工図'] = { type: 'drawing', items: drawings };
    }

    return groups;
  }, [reports, drawings]);

  // 写真の工種・写真区分グループ化
  const photoGroups = useMemo(() => {
    const groups: Record<string, Record<string, PhotoItem[]>> = {};

    photos.forEach(p => {
      const workType = p.workType || '一般工種';
      const category = p.category || '施工中';

      if (!groups[workType]) {
        groups[workType] = {};
      }
      if (!groups[workType][category]) {
        groups[workType][category] = [];
      }
      groups[workType][category].push(p);
    });

    return groups;
  }, [photos]);

  // 検索フィルター
  const filteredDocGroups = useMemo(() => {
    if (!searchQuery) return docGroups;
    const query = searchQuery.toLowerCase();
    const result: typeof docGroups = {};

    Object.entries(docGroups).forEach(([groupName, data]) => {
      const matched = data.items.filter(item => 
        item.title.toLowerCase().includes(query) || groupName.toLowerCase().includes(query)
      );
      if (matched.length > 0) {
        result[groupName] = { type: data.type, items: matched };
      }
    });
    return result;
  }, [docGroups, searchQuery]);

  const filteredPhotoGroups = useMemo(() => {
    if (!searchQuery) return photoGroups;
    const query = searchQuery.toLowerCase();
    const result: typeof photoGroups = {};

    Object.entries(photoGroups).forEach(([wt, cats]) => {
      let hasMatch = false;
      const matchedCats: Record<string, PhotoItem[]> = {};

      Object.entries(cats).forEach(([cat, list]) => {
        const matched = list.filter(p => 
          p.title.toLowerCase().includes(query) || 
          p.station?.toLowerCase().includes(query) ||
          wt.toLowerCase().includes(query) ||
          cat.toLowerCase().includes(query)
        );
        if (matched.length > 0) {
          matchedCats[cat] = matched;
          hasMatch = true;
        }
      });

      if (hasMatch) {
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
          className={`p-2 rounded-lg transition mb-2 ${activeTab === 'docs' ? 'text-blue-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}
          title="書類ツリー"
        >
          <FileText className="w-4 h-4" />
        </button>

        <button
          onClick={() => { setIsOpen(true); setActiveTab('photos'); }}
          className={`p-2 rounded-lg transition ${activeTab === 'photos' ? 'text-blue-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}
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
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
          title="ツリーを閉じる"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
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
            placeholder={activeTab === 'docs' ? "書類をツリー内検索..." : "工種・写真を検索..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-2 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* ツリーコンテンツ */}
      <div className="flex-1 overflow-y-auto p-2 text-xs divide-y divide-transparent">
        {activeTab === 'docs' ? (
          /* ==================== 書類ツリー ==================== */
          Object.keys(filteredDocGroups).length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-xs">該当する書類がありません</div>
          ) : (
            <div className="space-y-1">
              {Object.entries(filteredDocGroups).map(([groupName, data]) => {
                const folderKey = `doc_${groupName}`;
                const open = isFolderOpen(folderKey);
                const items = data.items;

                return (
                  <div key={groupName} className="select-none">
                    {/* フォルダ行 */}
                    <div
                      onClick={() => toggleFolder(folderKey)}
                      className="flex items-center justify-between p-1.5 rounded hover:bg-slate-900 cursor-pointer text-slate-300 font-medium group transition"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {open ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        )}
                        {open ? (
                          <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : (
                          <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        )}
                        <span className="truncate group-hover:text-white">{groupName}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.2 rounded-full shrink-0">
                        {items.length}
                      </span>
                    </div>

                    {/* 書類アイテムリスト */}
                    {open && (
                      <div className="ml-4 pl-2 border-l border-slate-800 space-y-0.5 mt-0.5">
                        {items.map((item) => {
                          const isDrawing = data.type === 'drawing';
                          const isSelected = isDrawing ? item.id === selectedDrawingId : item.id === selectedReportId;
                          const rec = inspectionRecords[item.id];

                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                if (isDrawing) {
                                  onSelectDrawing(item.id);
                                } else {
                                  onSelectReport(item.id);
                                }
                              }}
                              className={`w-full text-left p-1.5 rounded flex items-start gap-1.5 transition ${
                                isSelected
                                  ? 'bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/40'
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
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-xs leading-tight">{item.title}</div>
                                {'createDate' in item && item.createDate && (
                                  <div className="text-[10px] text-slate-500 mt-0.5">{item.createDate}</div>
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
          )
        ) : (
          /* ==================== 工事写真ツリー ==================== */
          Object.keys(filteredPhotoGroups).length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-xs">該当する写真がありません</div>
          ) : (
            <div className="space-y-1">
              {Object.entries(filteredPhotoGroups).map(([workType, cats]) => {
                const wtKey = `photo_wt_${workType}`;
                const wtOpen = isFolderOpen(wtKey);
                const totalInWt = Object.values(cats).reduce((acc, l) => acc + l.length, 0);

                return (
                  <div key={workType} className="select-none">
                    {/* 工種フォルダ */}
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

                    {/* 写真区分サブ階層 */}
                    {wtOpen && (
                      <div className="ml-3 pl-2 border-l border-slate-800 space-y-1 mt-0.5">
                        {Object.entries(cats).map(([category, photoList]) => {
                          const catKey = `photo_cat_${workType}_${category}`;
                          const catOpen = isFolderOpen(catKey);

                          return (
                            <div key={category}>
                              <div
                                onClick={() => toggleFolder(catKey)}
                                className="flex items-center justify-between p-1 rounded hover:bg-slate-900/60 cursor-pointer text-slate-400 font-medium group transition"
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  {catOpen ? (
                                    <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                                  )}
                                  <span className="text-[11px] truncate group-hover:text-slate-200">{category}</span>
                                </div>
                                <span className="text-[9px] text-slate-500 bg-slate-900 px-1.5 py-0.2 rounded shrink-0">
                                  {photoList.length}
                                </span>
                              </div>

                              {/* 写真アイテム */}
                              {catOpen && (
                                <div className="ml-3 pl-2 border-l border-slate-800/60 space-y-0.5 mt-0.5">
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
                                            : 'text-slate-300 hover:bg-slate-900 hover:text-white'
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
                                          <div className="truncate text-[11px] leading-tight">{photo.title}</div>
                                          {photo.station && (
                                            <div className="text-[9px] text-slate-500 mt-0.5">{photo.station}</div>
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
          )
        )}
      </div>
    </div>
  );
};
