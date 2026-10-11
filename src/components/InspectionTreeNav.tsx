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
  PanelLeftClose, 
  PanelLeftOpen, 
  Search, 
  Layers,
  ChevronsDown,
  ChevronsUp,
  Tag,
  FileSpreadsheet,
  Calendar,
  MapPin,
  Clock
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
  const [photoTreeMode, setPhotoTreeMode] = useState<'standard' | 'timeline' | 'station'>('standard');
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

  // 要領に準拠した書類大分類の規定順序 (PLAN -> MEET -> DRAWING -> OTHRS)
  const DOC_CATEGORY_ORDER = ['施工計画書', '工事打合せ簿', '完成図面・設計図', 'その他資料'];

  // 要領に準拠した写真区分の規定順序 (デジタル写真管理情報基準)
  const PHOTO_CATEGORY_ORDER = [
    '着手前及び完成写真',
    '着工前及び完成写真',
    '施工状況写真',
    '安全管理写真',
    '使用材料写真',
    '出来形管理写真',
    '品質管理写真',
    '災害写真',
    'その他写真',
    'その他'
  ];

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
    // 写真キー (写真区分 > 工種/種別 > 細別/項目)
    Object.entries(photoGroups).forEach(([cat, wtMap]) => {
      allKeys[`photo_cat_${cat}`] = true;
      Object.entries(wtMap).forEach(([wt, titles]) => {
        allKeys[`photo_wt_${cat}_${wt}`] = true;
        Object.keys(titles).forEach(t => {
          allKeys[`photo_title_${cat}_${wt}_${t}`] = true;
        });
      });
    });
    setExpandedFolders(allKeys);
  };

  // すべて閉じる
  const handleCollapseAll = () => {
    setExpandedFolders({});
  };

  // ==================== 書類ツリーの要領準拠階層化 ====================
  // 大分類 (要領規定順) -> 帳票件名 (作成日時系列順) -> [鑑(先頭), 本文...]
  const docGroups = useMemo(() => {
    const rawGroups: Record<string, Record<string, { type: 'report' | 'drawing'; items: (ReportItem | DrawingItem)[] }>> = {};

    // 書類を作成日の時系列（昇順）でソート
    const sortedReports = [...reports].sort((a, b) => {
      const da = a.createDate || '';
      const db = b.createDate || '';
      if (da !== db) return da.localeCompare(db);
      return a.id.localeCompare(b.id);
    });

    sortedReports.forEach(r => {
      const typeName = r.type || '一般書類';
      const groupName = r.groupTitle || r.title || '書類';

      if (!rawGroups[typeName]) {
        rawGroups[typeName] = {};
      }
      if (!rawGroups[typeName][groupName]) {
        rawGroups[typeName][groupName] = { type: 'report', items: [] };
      }
      rawGroups[typeName][groupName].items.push(r);
    });

    if (drawings.length > 0) {
      rawGroups['完成図面・設計図'] = {
        '完成図面一式': { type: 'drawing', items: drawings },
      };
    }

    // 各帳票内で「鑑」を先頭、次に本文・別添にソート
    Object.values(rawGroups).forEach(groupMap => {
      Object.values(groupMap).forEach(data => {
        data.items.sort((a, b) => {
          const roleA = ('fileRole' in a && a.fileRole === '鑑') ? 0 : 1;
          const roleB = ('fileRole' in b && b.fileRole === '鑑') ? 0 : 1;
          return roleA - roleB;
        });
      });
    });

    // 大分類を要領規定順にソートして再格納
    const sortedGroups: Record<string, typeof rawGroups[string]> = {};
    const sortedCatNames = Object.keys(rawGroups).sort((a, b) => {
      const idxA = DOC_CATEGORY_ORDER.findIndex(o => a.includes(o) || o.includes(a));
      const idxB = DOC_CATEGORY_ORDER.findIndex(o => b.includes(o) || o.includes(b));
      const valA = idxA === -1 ? 999 : idxA;
      const valB = idxB === -1 ? 999 : idxB;
      return valA - valB;
    });

    sortedCatNames.forEach(cat => {
      sortedGroups[cat] = rawGroups[cat];
    });

    return sortedGroups;
  }, [reports, drawings]);

  // ==================== 写真ツリーの要領準拠階層化 ====================
  // 写真区分 (要領規定順) -> 工種/種別 (固定値「工事」排除) -> 細別/項目 -> 写真リスト (撮影日時順)
  const photoGroups = useMemo(() => {
    const rawGroups: Record<string, Record<string, Record<string, PhotoItem[]>>> = {};

    // 撮影日時の昇順でソート
    const sortedPhotos = [...photos].sort((a, b) => {
      const d1 = (a.date || '') + (a.time || '');
      const d2 = (b.date || '') + (b.time || '');
      if (d1 !== d2) return d1.localeCompare(d2);
      return (a.station || '').localeCompare(b.station || '');
    });

    sortedPhotos.forEach(p => {
      // 1. 写真区分 (施工状況写真、出来形管理写真等)
      const category = p.category || '施工状況写真';

      // 2. 工種/種別 (「工事」「一般工種」等の固定値を自動検知して除外し、より具体的な種別・細別を採用)
      let effectiveWork = p.workType?.trim() || '';
      if (!effectiveWork || effectiveWork === '工事' || effectiveWork === '一般工種' || effectiveWork === '工事写真' || effectiveWork === '本工事') {
        effectiveWork = p.workKind?.trim() || p.workDetail?.trim() || '本工事';
      }

      // 3. 細別/項目 (「工事」固定値を排除し、細別や測点を採用)
      let effectiveItem = p.title?.trim() || '';
      if (!effectiveItem || effectiveItem === '工事' || effectiveItem === '写真項目' || effectiveItem === effectiveWork) {
        effectiveItem = p.workDetail?.trim() || (p.station ? `測点: ${p.station}` : '') || p.fileName;
      }

      if (!rawGroups[category]) {
        rawGroups[category] = {};
      }
      if (!rawGroups[category][effectiveWork]) {
        rawGroups[category][effectiveWork] = {};
      }
      if (!rawGroups[category][effectiveWork][effectiveItem]) {
        rawGroups[category][effectiveWork][effectiveItem] = [];
      }
      rawGroups[category][effectiveWork][effectiveItem].push(p);
    });

    // 写真区分を要領規定順にソートして再格納
    const sortedGroups: Record<string, typeof rawGroups[string]> = {};
    const sortedCategories = Object.keys(rawGroups).sort((a, b) => {
      const idxA = PHOTO_CATEGORY_ORDER.findIndex(o => a.includes(o) || o.includes(a));
      const idxB = PHOTO_CATEGORY_ORDER.findIndex(o => b.includes(o) || o.includes(b));
      const valA = idxA === -1 ? 999 : idxA;
      const valB = idxB === -1 ? 999 : idxB;
      return valA - valB;
    });

    sortedCategories.forEach(cat => {
      sortedGroups[cat] = rawGroups[cat];
    });

    return sortedGroups;
  }, [photos]);

  // 自然順比較関数（測点の NO.1, NO.2, NO.10 等を正しく整列）
  const naturalCompare = (a: string, b: string) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  };

  // ==================== 写真ツリー: 撮影日別（タイムライン）階層化 ====================
  // 年月 (例: 2024年05月) -> 撮影日 (例: 2024-05-10) -> 写真リスト (撮影時刻順)
  const timelineGroups = useMemo(() => {
    const rawGroups: Record<string, Record<string, PhotoItem[]>> = {};

    const sortedPhotos = [...photos].sort((a, b) => {
      const d1 = (a.date || '') + (a.time || '');
      const d2 = (b.date || '') + (b.time || '');
      if (d1 !== d2) return d1.localeCompare(d2);
      return (a.station || '').localeCompare(b.station || '');
    });

    sortedPhotos.forEach(p => {
      let ym = '撮影日未設定';
      let dStr = '撮影日未設定';
      if (p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) {
        const [y, m] = p.date.split('-');
        ym = `${y}年${m}月`;
        dStr = p.date;
      } else if (p.date) {
        dStr = p.date;
        ym = p.date.length >= 7 ? p.date.substring(0, 7) : '撮影日未設定';
      }

      if (!rawGroups[ym]) rawGroups[ym] = {};
      if (!rawGroups[ym][dStr]) rawGroups[ym][dStr] = [];
      rawGroups[ym][dStr].push(p);
    });

    const sortedGroups: Record<string, Record<string, PhotoItem[]>> = {};
    Object.keys(rawGroups).sort((a, b) => {
      if (a === '撮影日未設定') return 1;
      if (b === '撮影日未設定') return -1;
      return a.localeCompare(b);
    }).forEach(ym => {
      const dateMap = rawGroups[ym];
      const sortedDateMap: Record<string, PhotoItem[]> = {};
      Object.keys(dateMap).sort((a, b) => {
        if (a === '撮影日未設定') return 1;
        if (b === '撮影日未設定') return -1;
        return a.localeCompare(b);
      }).forEach(d => {
        sortedDateMap[d] = dateMap[d];
      });
      sortedGroups[ym] = sortedDateMap;
    });

    return sortedGroups;
  }, [photos]);

  // ==================== 写真ツリー: 測点別階層化 ====================
  // 測点名 (自然順) -> 写真リスト (撮影日順)
  const stationGroups = useMemo(() => {
    const rawGroups: Record<string, PhotoItem[]> = {};

    photos.forEach(p => {
      const st = p.station?.trim() || '測点未設定';
      if (!rawGroups[st]) rawGroups[st] = [];
      rawGroups[st].push(p);
    });

    // 測点内の写真を撮影日時順にソート
    Object.values(rawGroups).forEach(list => {
      list.sort((a, b) => {
        const d1 = (a.date || '') + (a.time || '');
        const d2 = (b.date || '') + (b.time || '');
        return d1.localeCompare(d2);
      });
    });

    const sortedGroups: Record<string, PhotoItem[]> = {};
    Object.keys(rawGroups).sort((a, b) => {
      if (a === '測点未設定') return 1;
      if (b === '測点未設定') return -1;
      return naturalCompare(a, b);
    }).forEach(st => {
      sortedGroups[st] = rawGroups[st];
    });

    return sortedGroups;
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

  // 検索フィルター（要領基準写真）
  const filteredPhotoGroups = useMemo(() => {
    if (!searchQuery) return photoGroups;
    const query = searchQuery.toLowerCase();
    const result: typeof photoGroups = {};

    Object.entries(photoGroups).forEach(([cat, wtMap]) => {
      const matchedWts: typeof wtMap = {};
      Object.entries(wtMap).forEach(([wt, titles]) => {
        const matchedTitles: typeof titles = {};
        Object.entries(titles).forEach(([titleName, list]) => {
          const matched = list.filter(p => 
            p.title.toLowerCase().includes(query) || 
            p.station?.toLowerCase().includes(query) ||
            p.remarks?.toLowerCase().includes(query) ||
            wt.toLowerCase().includes(query) ||
            cat.toLowerCase().includes(query) ||
            titleName.toLowerCase().includes(query)
          );
          if (matched.length > 0) {
            matchedTitles[titleName] = matched;
          }
        });
        if (Object.keys(matchedTitles).length > 0) {
          matchedWts[wt] = matchedTitles;
        }
      });
      if (Object.keys(matchedWts).length > 0) {
        result[cat] = matchedWts;
      }
    });

    return result;
  }, [photoGroups, searchQuery]);

  // 検索フィルター（撮影日別写真）
  const filteredTimelineGroups = useMemo(() => {
    if (!searchQuery) return timelineGroups;
    const query = searchQuery.toLowerCase();
    const result: typeof timelineGroups = {};

    Object.entries(timelineGroups).forEach(([ym, dateMap]) => {
      const matchedDates: typeof dateMap = {};
      Object.entries(dateMap).forEach(([dateStr, list]) => {
        const matched = list.filter(p =>
          p.title.toLowerCase().includes(query) ||
          p.station?.toLowerCase().includes(query) ||
          p.remarks?.toLowerCase().includes(query) ||
          p.workType?.toLowerCase().includes(query) ||
          dateStr.includes(query) ||
          ym.includes(query)
        );
        if (matched.length > 0) {
          matchedDates[dateStr] = matched;
        }
      });
      if (Object.keys(matchedDates).length > 0) {
        result[ym] = matchedDates;
      }
    });

    return result;
  }, [timelineGroups, searchQuery]);

  // 検索フィルター（測点別写真）
  const filteredStationGroups = useMemo(() => {
    if (!searchQuery) return stationGroups;
    const query = searchQuery.toLowerCase();
    const result: typeof stationGroups = {};

    Object.entries(stationGroups).forEach(([st, list]) => {
      const matched = list.filter(p =>
        p.title.toLowerCase().includes(query) ||
        p.station?.toLowerCase().includes(query) ||
        p.remarks?.toLowerCase().includes(query) ||
        p.workType?.toLowerCase().includes(query) ||
        st.toLowerCase().includes(query)
      );
      if (matched.length > 0) {
        result[st] = matched;
      }
    });

    return result;
  }, [stationGroups, searchQuery]);

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

                          const firstItem = items[0];
                          const subFiles = items.slice(1);
                          const isDrawing = data.type === 'drawing';
                          const isFirstSelected = isDrawing ? firstItem.id === selectedDrawingId : firstItem.id === selectedReportId;
                          const isAnySelected = items.some(it => isDrawing ? it.id === selectedDrawingId : it.id === selectedReportId);
                          const recFirst = inspectionRecords[firstItem.id];

                          return (
                            <div key={gTitle} className="space-y-0.5">
                              {/* 第2階層: 帳票件名 ＝ 鑑そのもの (クリックで鑑を即時表示) */}
                              <div
                                className={`flex items-center justify-between p-1 rounded transition ${
                                  isFirstSelected
                                    ? 'bg-blue-600/25 text-blue-300 font-semibold border border-blue-500/40'
                                    : isAnySelected
                                    ? 'bg-slate-900/80 text-white'
                                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                                }`}
                              >
                                <div
                                  onClick={() => {
                                    if (isDrawing) onSelectDrawing(firstItem.id);
                                    else onSelectReport(firstItem.id);
                                    if (subFiles.length > 0 && !subOpen) toggleFolder(subKey);
                                  }}
                                  className="flex items-center gap-1.5 truncate flex-1 min-w-0 cursor-pointer"
                                >
                                  <div className="shrink-0">
                                    {recFirst?.status === 'ok' ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                    ) : recFirst?.status === 'issue' ? (
                                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                                    ) : isDrawing ? (
                                      <FolderGit2 className="w-3.5 h-3.5 text-blue-400" />
                                    ) : (
                                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                                    )}
                                  </div>
                                  <span className="text-xs truncate">{gTitle}</span>
                                  {subFiles.length > 0 && (
                                    <span className="text-[10px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded shrink-0">
                                      +添付{subFiles.length}
                                    </span>
                                  )}
                                </div>

                                {/* 添付ファイルがある場合のみ開閉トグルボタンを表示 */}
                                {subFiles.length > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFolder(subKey);
                                    }}
                                    className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded shrink-0 ml-1"
                                    title={subOpen ? '添付ファイルを隠す' : '添付ファイルを表示'}
                                  >
                                    {subOpen ? (
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>

                              {/* 第3階層: 本文・添付ファイルのみを表示 (鑑は親で選択済みなため重複なし) */}
                              {subOpen && subFiles.length > 0 && (
                                <div className="ml-4 pl-2 border-l border-slate-800/80 space-y-0.5 mt-0.5">
                                  {subFiles.map((item) => {
                                    const isSubSelected = isDrawing ? item.id === selectedDrawingId : item.id === selectedReportId;
                                    const recSub = inspectionRecords[item.id];
                                    const role = ('fileRole' in item && item.fileRole) ? item.fileRole : '本文';

                                    return (
                                      <button
                                        key={item.id}
                                        onClick={() => isDrawing ? onSelectDrawing(item.id) : onSelectReport(item.id)}
                                        className={`w-full text-left p-1 rounded flex items-center gap-1.5 transition ${
                                          isSubSelected
                                            ? 'bg-blue-600/25 text-blue-300 font-semibold border border-blue-500/40'
                                            : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                                        }`}
                                      >
                                        <div className="shrink-0">
                                          {recSub?.status === 'ok' ? (
                                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                          ) : recSub?.status === 'issue' ? (
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
          /* ==================== 工事写真ツリー ==================== */
          <div className="space-y-2">
            {/* 整理軸切替ピルボタン */}
            <div className="flex items-center gap-1 p-1 bg-slate-900/90 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setPhotoTreeMode('standard')}
                className={`flex-1 py-1 px-1.5 rounded flex items-center justify-center gap-1 font-bold transition text-xs ${
                  photoTreeMode === 'standard'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="要領基準（写真区分・工種別）"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>要領基準</span>
              </button>
              <button
                onClick={() => setPhotoTreeMode('timeline')}
                className={`flex-1 py-1 px-1.5 rounded flex items-center justify-center gap-1 font-bold transition text-xs ${
                  photoTreeMode === 'timeline'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="撮影日別（タイムライン進捗順）"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>撮影日別</span>
              </button>
              <button
                onClick={() => setPhotoTreeMode('station')}
                className={`flex-1 py-1 px-1.5 rounded flex items-center justify-center gap-1 font-bold transition text-xs ${
                  photoTreeMode === 'station'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="測点別（施工箇所・キロ程順）"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>測点別</span>
              </button>
            </div>

            {/* モード 1: 要領基準ツリー (写真区分 > 工種/種別 > 細別/項目 > 写真) */}
            {photoTreeMode === 'standard' && (
              Object.keys(filteredPhotoGroups).length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-xs">該当する写真がありません</div>
              ) : (
                <div className="space-y-1">
                  {Object.entries(filteredPhotoGroups).map(([category, wtMap]) => {
                    const catKey = `photo_cat_${category}`;
                    const catOpen = isFolderOpen(catKey);
                    const totalInCat = Object.values(wtMap).reduce(
                      (acc, titles) => acc + Object.values(titles).reduce((a, l) => a + l.length, 0), 
                      0
                    );

                    return (
                      <div key={category} className="select-none">
                        {/* 第1階層: 写真区分 */}
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
                            <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span className="truncate group-hover:text-white text-xs">{category}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded-full shrink-0">
                            {totalInCat}
                          </span>
                        </div>

                        {/* 第2階層: 工種/種別 */}
                        {catOpen && (
                          <div className="ml-3 pl-2 border-l border-slate-800 space-y-1 mt-0.5">
                            {Object.entries(wtMap).map(([workType, titles]) => {
                              const wtKey = `photo_wt_${category}_${workType}`;
                              const wtOpen = isFolderOpen(wtKey);
                              const totalInWt = Object.values(titles).reduce((a, l) => a + l.length, 0);

                              return (
                                <div key={workType}>
                                  <div
                                    onClick={() => toggleFolder(wtKey)}
                                    className="flex items-center justify-between p-1 rounded hover:bg-slate-900/60 cursor-pointer text-slate-300 font-medium group transition"
                                  >
                                    <div className="flex items-center gap-1.5 truncate">
                                      {wtOpen ? (
                                        <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                                      )}
                                      <span className="text-xs truncate group-hover:text-slate-100">{workType}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 bg-slate-900 px-1.5 py-0.2 rounded shrink-0">
                                      {totalInWt}
                                    </span>
                                  </div>

                                  {/* 第3階層: 細別/項目 */}
                                  {wtOpen && (
                                    <div className="ml-3 pl-2 border-l border-slate-800/60 space-y-0.5 mt-0.5">
                                      {Object.entries(titles).map(([titleName, photoList]) => {
                                        const titleKey = `photo_title_${category}_${workType}_${titleName}`;
                                        const titleOpen = isFolderOpen(titleKey);

                                        return (
                                          <div key={titleName}>
                                            <div
                                              onClick={() => {
                                                toggleFolder(titleKey);
                                                if (photoList.length > 0) {
                                                  onSelectPhoto(photoList[0].id);
                                                }
                                              }}
                                              className="flex items-center justify-between p-1 rounded hover:bg-slate-900/80 cursor-pointer text-slate-400 group transition"
                                            >
                                              <div className="flex items-center gap-1.5 truncate">
                                                {titleOpen ? (
                                                  <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
                                                ) : (
                                                  <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                                                )}
                                                <Tag className="w-3 h-3 text-emerald-400 shrink-0" />
                                                <span className="text-xs font-medium truncate group-hover:text-slate-200">
                                                  {titleName}
                                                </span>
                                              </div>
                                              <span className="text-[10px] text-slate-500 bg-slate-900 px-1.5 py-0.2 rounded shrink-0">
                                                {photoList.length}
                                              </span>
                                            </div>

                                            {/* 第4階層: 写真アイテム */}
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
                                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                                        ) : rec?.status === 'issue' ? (
                                                          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                                                        ) : (
                                                          <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                                                        )}
                                                      </div>
                                                      <div className="min-w-0 flex-1">
                                                        <div className="truncate text-xs leading-tight text-slate-300 font-medium">
                                                          {photo.station || photo.fileName}
                                                        </div>
                                                        {photo.date && (
                                                          <div className="text-[10px] text-slate-500">{photo.date}</div>
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

            {/* モード 2: 撮影日別（タイムライン）ツリー (年月 > 撮影日 > 写真) */}
            {photoTreeMode === 'timeline' && (
              Object.keys(filteredTimelineGroups).length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-xs">該当する写真がありません</div>
              ) : (
                <div className="space-y-1">
                  {Object.entries(filteredTimelineGroups).map(([ym, dateMap]) => {
                    const ymKey = `photo_ym_${ym}`;
                    const ymOpen = isFolderOpen(ymKey);
                    const totalInYm = Object.values(dateMap).reduce((a, l) => a + l.length, 0);

                    return (
                      <div key={ym} className="select-none">
                        {/* 第1階層: 年月 */}
                        <div
                          onClick={() => toggleFolder(ymKey)}
                          className="flex items-center justify-between p-1.5 rounded hover:bg-slate-900 cursor-pointer text-slate-200 font-semibold group transition"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {ymOpen ? (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            )}
                            <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="truncate group-hover:text-white text-xs">{ym}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded-full shrink-0">
                            {totalInYm}
                          </span>
                        </div>

                        {/* 第2階層: 撮影日 (クリックで1枚目即時選択) */}
                        {ymOpen && (
                          <div className="ml-3 pl-2 border-l border-slate-800 space-y-0.5 mt-0.5">
                            {Object.entries(dateMap).map(([dateStr, photoList]) => {
                              const dKey = `photo_date_${ym}_${dateStr}`;
                              const dOpen = isFolderOpen(dKey);

                              return (
                                <div key={dateStr}>
                                  <div
                                    onClick={() => {
                                      toggleFolder(dKey);
                                      if (photoList.length > 0) {
                                        onSelectPhoto(photoList[0].id);
                                      }
                                    }}
                                    className="flex items-center justify-between p-1 rounded hover:bg-slate-900/70 cursor-pointer text-slate-300 font-medium group transition"
                                  >
                                    <div className="flex items-center gap-1.5 truncate">
                                      {dOpen ? (
                                        <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                                      )}
                                      <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                                      <span className="text-xs truncate font-mono group-hover:text-slate-100">
                                        {dateStr}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 bg-slate-900 px-1.5 py-0.2 rounded shrink-0">
                                      {photoList.length}
                                    </span>
                                  </div>

                                  {/* 第3階層: 写真リスト */}
                                  {dOpen && (
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
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                              ) : rec?.status === 'issue' ? (
                                                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                                              ) : (
                                                <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                                              )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <div className="truncate text-xs leading-tight text-slate-300 font-medium">
                                                {photo.title || photo.fileName}
                                              </div>
                                              <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                                {photo.station && <span className="text-amber-400/90">{photo.station}</span>}
                                                {photo.workType && <span>{photo.workType}</span>}
                                                {photo.time && <span>{photo.time}</span>}
                                              </div>
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

            {/* モード 3: 測点別ツリー (測点 > 写真) */}
            {photoTreeMode === 'station' && (
              Object.keys(filteredStationGroups).length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-xs">該当する写真がありません</div>
              ) : (
                <div className="space-y-1">
                  {Object.entries(filteredStationGroups).map(([stationName, photoList]) => {
                    const stKey = `photo_st_${stationName}`;
                    const stOpen = isFolderOpen(stKey);

                    return (
                      <div key={stationName} className="select-none">
                        {/* 第1階層: 測点 (クリックで1枚目即時選択) */}
                        <div
                          onClick={() => {
                            toggleFolder(stKey);
                            if (photoList.length > 0) {
                              onSelectPhoto(photoList[0].id);
                            }
                          }}
                          className="flex items-center justify-between p-1.5 rounded hover:bg-slate-900 cursor-pointer text-slate-200 font-semibold group transition"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {stOpen ? (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            )}
                            <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span className="truncate group-hover:text-white text-xs font-mono">
                              {stationName}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded-full shrink-0">
                            {photoList.length}
                          </span>
                        </div>

                        {/* 第2階層: 写真リスト */}
                        {stOpen && (
                          <div className="ml-3 pl-2 border-l border-slate-800 space-y-0.5 mt-0.5">
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
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                    ) : rec?.status === 'issue' ? (
                                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                                    ) : (
                                      <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs leading-tight text-slate-300 font-medium">
                                      {photo.title || photo.fileName}
                                    </div>
                                    <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                      {photo.workType && <span>{photo.workType}</span>}
                                      {photo.date && <span>{photo.date}</span>}
                                    </div>
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
            )}
          </div>
        )}
      </div>
    </div>
  );
};
