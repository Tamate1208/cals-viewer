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
  viewMode?: 'doc-only' | 'photo-only';
  onViewModeChange?: (mode: 'doc-only' | 'photo-only') => void;
  onSelectIndex?: () => void;
  onSelectReport: (id: string) => void;
  onSelectDrawing: (id: string) => void;
  onSelectPhoto: (id: string) => void;
}

// 要領に準拠した書類大分類の規定順序 (業務委託: 業務報告書/設計報告書/地質柱状図, 土木: PLAN -> MEET -> DRAWING -> OTHRS)
const DOC_CATEGORY_ORDER = [
  '業務報告書',
  '設計報告書',
  '報告書',
  '施工計画書',
  '打合せ簿・協議録',
  '工事打合せ簿',
  '打合せ簿',
  '計算書',
  '数量計算',
  '地質柱状図',
  '完成図面・設計図',
  'その他資料',
  'その他'
];

// 打合せ簿の発議事項規定順序 (重要度・業務進行順)
const PROPOSAL_ITEM_ORDER = [
  '協議',
  '指示',
  '承諾',
  '提出',
  '報告',
  '連絡',
  '立会',
  '確認',
  '協議・その他',
  'その他'
];

// 発議事項バッジの装飾ヘルパー
const getProposalBadge = (proposal?: string) => {
  if (!proposal) return null;
  if (/指示/.test(proposal)) {
    return { label: proposal, cls: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
  }
  if (/承諾|承認/.test(proposal)) {
    return { label: proposal, cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
  }
  if (/協議/.test(proposal)) {
    return { label: proposal, cls: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
  }
  if (/提出|届/.test(proposal)) {
    return { label: proposal, cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
  }
  if (/報告|週報|月報/.test(proposal)) {
    return { label: proposal, cls: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' };
  }
  if (/立会|確認/.test(proposal)) {
    return { label: proposal, cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
  }
  return { label: proposal, cls: 'bg-slate-700/60 text-slate-300 border-slate-600' };
};

interface DocGroupItem {
  type: 'report' | 'drawing';
  items: (ReportItem | DrawingItem)[];
  proposalItem?: string;
}

interface DocCategoryContainer {
  totalCount: number;
  isMeetCategory: boolean;
  proposalMap?: Record<string, Record<string, DocGroupItem>>;
  directMap?: Record<string, DocGroupItem>;
}

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

export const InspectionTreeNav: React.FC<InspectionTreeNavProps> = ({
  reports,
  drawings,
  photos,
  selectedReportId,
  selectedDrawingId,
  selectedPhotoId,
  isIndexSelected = false,
  inspectionRecords,
  viewMode,
  onViewModeChange,
  onSelectIndex,
  onSelectReport,
  onSelectDrawing,
  onSelectPhoto,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [internalTab, setInternalTab] = useState<'docs' | 'photos'>(
    viewMode === 'photo-only' ? 'photos' : 'docs'
  );
  const activeTab = viewMode ? (viewMode === 'photo-only' ? 'photos' : 'docs') : internalTab;
  const [photoTreeMode, setPhotoTreeMode] = useState<'workTree' | 'timeline' | 'category' | 'station'>('workTree');
  const [searchQuery, setSearchQuery] = useState('');

  // タブ切り替えハンドラ
  const handleTabChange = (tab: 'docs' | 'photos') => {
    setInternalTab(tab);
    onViewModeChange?.(tab === 'docs' ? 'doc-only' : 'photo-only');
  };

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
    Object.entries(docGroups).forEach(([cat, catObj]) => {
      allKeys[`doc_cat_${cat}`] = true;
      if (catObj.proposalMap) {
        Object.entries(catObj.proposalMap).forEach(([prop, groupMap]) => {
          allKeys[`doc_prop_${cat}_${prop}`] = true;
          Object.keys(groupMap).forEach(gt => {
            allKeys[`doc_sub_${cat}_${prop}_${gt}`] = true;
            allKeys[`doc_sub_${cat}_${gt}`] = true;
            allKeys[`doc_orig_${cat}_${gt}`] = true;
          });
        });
      }
      if (catObj.directMap) {
        Object.keys(catObj.directMap).forEach(gt => {
          allKeys[`doc_sub_${cat}_${gt}`] = true;
          allKeys[`doc_orig_${cat}_${gt}`] = true;
        });
      }
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
  // 大分類 (要領規定順) -> 打合せ簿の場合は発議事項 -> 帳票件名 (作成日時系列順 / XML定義順) -> [鑑・正本PDF(先頭), 本文/別添, オリジナル原典]
  const docGroups = useMemo(() => {
    // 書類を作成日の時系列（昇順）でソート。日付が同日・未設定の場合はXML記載順（インデックス順）を維持
    const sortedReports = reports.map((item, originalIndex) => ({ item, originalIndex }))
      .sort((a, b) => {
        const da = a.item.createDate || '';
        const db = b.item.createDate || '';
        if (da && db && da !== db) return da.localeCompare(db);
        // IDが数値付きの場合 (例: REP_D_2, REP_D_10) は自然順ソート
        if (a.item.id !== b.item.id) {
          const nat = a.item.id.localeCompare(b.item.id, undefined, { numeric: true });
          if (nat !== 0) return nat;
        }
        return a.originalIndex - b.originalIndex;
      })
      .map(({ item }) => item);

    const rawCategories: Record<string, DocCategoryContainer> = {};

    sortedReports.forEach(r => {
      // 打合せ簿判定: r.typeが打合せ簿、またはタイトルに打合せ簿が含まれる場合
      const isMeet = Boolean((r.type && r.type.includes('打合せ')) || (r.title && r.title.includes('打合せ簿')));
      const typeName = isMeet ? '打合せ簿' : (r.type || '一般書類');
      const groupName = r.groupTitle || r.title || '書類';
      const proposal = r.proposalItem || '協議・その他';

      if (!rawCategories[typeName]) {
        rawCategories[typeName] = {
          totalCount: 0,
          isMeetCategory: isMeet,
          proposalMap: isMeet ? {} : undefined,
          directMap: isMeet ? undefined : {},
        };
      }

      const catObj = rawCategories[typeName];
      catObj.totalCount += 1;

      if (catObj.isMeetCategory && catObj.proposalMap) {
        if (!catObj.proposalMap[proposal]) {
          catObj.proposalMap[proposal] = {};
        }
        if (!catObj.proposalMap[proposal][groupName]) {
          catObj.proposalMap[proposal][groupName] = { type: 'report', items: [], proposalItem: proposal };
        }
        catObj.proposalMap[proposal][groupName].items.push(r);
      } else if (catObj.directMap) {
        if (!catObj.directMap[groupName]) {
          catObj.directMap[groupName] = { type: 'report', items: [] };
        }
        catObj.directMap[groupName].items.push(r);
      }
    });

    if (drawings.length > 0) {
      rawCategories['完成図面・設計図'] = {
        totalCount: drawings.length,
        isMeetCategory: false,
        directMap: {
          '完成図面一式': { type: 'drawing', items: [...drawings] },
        },
      };
    }

    // 各帳票内で「鑑」「報告書(PDF)」「電子柱状図PDF」を先頭、次に本文・別添、最後にオリジナル原典にソート
    Object.values(rawCategories).forEach(catObj => {
      const sortItems = (data: DocGroupItem) => {
        data.items.sort((a, b) => {
          const getPriority = (item: ReportItem | DrawingItem) => {
            if ('fileRole' in item) {
              if (item.fileRole === '鑑' || item.fileRole === '報告書(PDF)' || item.fileRole === '電子柱状図PDF') return 0;
              if (item.fileRole === 'オリジナル原典') return 2;
              return 1;
            }
            return 1;
          };
          return getPriority(a) - getPriority(b);
        });
      };

      if (catObj.proposalMap) {
        Object.values(catObj.proposalMap).forEach(groupMap => {
          Object.values(groupMap).forEach(sortItems);
        });
      }
      if (catObj.directMap) {
        Object.values(catObj.directMap).forEach(sortItems);
      }
    });

    // 大分類を要領規定順にソートして再格納
    const sortedCategories: Record<string, DocCategoryContainer> = {};
    const sortedCatNames = Object.keys(rawCategories).sort((a, b) => {
      const idxA = DOC_CATEGORY_ORDER.findIndex(o => a.includes(o) || o.includes(a));
      const idxB = DOC_CATEGORY_ORDER.findIndex(o => b.includes(o) || o.includes(b));
      const valA = idxA === -1 ? 999 : idxA;
      const valB = idxB === -1 ? 999 : idxB;
      return valA - valB;
    });

    sortedCatNames.forEach(cat => {
      const catObj = rawCategories[cat];
      if (catObj.isMeetCategory && catObj.proposalMap) {
        // 発議事項を発議規定順にソート
        const sortedPropMap: Record<string, Record<string, DocGroupItem>> = {};
        const sortedProps = Object.keys(catObj.proposalMap).sort((pa, pb) => {
          const idxA = PROPOSAL_ITEM_ORDER.findIndex(o => pa.includes(o) || o.includes(pa));
          const idxB = PROPOSAL_ITEM_ORDER.findIndex(o => pb.includes(o) || o.includes(pb));
          const valA = idxA === -1 ? 999 : idxA;
          const valB = idxB === -1 ? 999 : idxB;
          return valA - valB;
        });
        sortedProps.forEach(p => {
          sortedPropMap[p] = catObj.proposalMap![p];
        });
        catObj.proposalMap = sortedPropMap;
      }
      sortedCategories[cat] = catObj;
    });

    return sortedCategories;
  }, [reports, drawings]);

  // 写真区分バッジのスタイルヘルパー
  const getPhotoCategoryBadge = (category: string) => {
    if (/出来形/.test(category)) {
      return { label: '出来形', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' };
    }
    if (/品質/.test(category)) {
      return { label: '品質', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' };
    }
    if (/施工/.test(category)) {
      return { label: '施工', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' };
    }
    if (/材料/.test(category)) {
      return { label: '材料', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/40' };
    }
    if (/安全/.test(category)) {
      return { label: '安全', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/40' };
    }
    if (/着手|着工|完成|全景/.test(category)) {
      return { label: '全景/完成', cls: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' };
    }
    if (/災害/.test(category)) {
      return { label: '災害', cls: 'bg-rose-500/20 text-rose-400 border-rose-500/40' };
    }
    return { label: category || '写真', cls: 'bg-slate-700/60 text-slate-300 border-slate-600' };
  };

  // ==================== 1. 工種体系ツリー (工種 > 種別 > 細別 > 写真) ====================
  // 現場実務・設計内訳書・写真管理ソフトに完全準拠したスマート階層化
  const workTreeGroups = useMemo(() => {
    interface WKind {
      kindName: string;
      totalCount: number;
      details: Record<string, PhotoItem[]>;
    }
    interface WType {
      workType: string;
      totalCount: number;
      kinds: Record<string, WKind>;
    }

    const map: Record<string, WType> = {};

    // 撮影日時昇順でソート
    const sortedPhotos = [...photos].sort((a, b) => {
      const d1 = (a.date || '') + (a.time || '');
      const d2 = (b.date || '') + (b.time || '');
      if (d1 !== d2) return d1.localeCompare(d2);
      return (a.station || '').localeCompare(b.station || '');
    });

    sortedPhotos.forEach(p => {
      // 1. 工種 (workType): 固定値「工事」「一般工種」等は除外
      let wt = p.workType?.trim() || '';
      if (!wt || ['工事', '一般工種', '工事写真', '本工事', '一般'].includes(wt)) {
        wt = p.workKind?.trim() || p.category || '本工事';
      }

      // 2. 種別 (workKind): 工種と同じ名前なら空にして二重フォルダ化を防ぐ
      let wk = p.workKind?.trim() || '';
      if (wk === wt || ['工事', '一般工種', '一般'].includes(wk)) {
        wk = '';
      }

      // 3. 細別 (workDetail): 種別や工種と同じ名前なら空にする
      let wd = p.workDetail?.trim() || '';
      if (wd === wk || wd === wt || ['工事', '一般'].includes(wd)) {
        wd = '';
      }

      // 種別・細別が両方空で、タイトルに明確な内容があれば細別に採用
      if (!wk && !wd && p.title && p.title !== wt && p.title !== p.fileName) {
        wd = p.title;
      }

      const kindKey = wk || '__DIRECT__';
      const detailKey = wd || '__DIRECT__';

      if (!map[wt]) {
        map[wt] = { workType: wt, totalCount: 0, kinds: {} };
      }
      map[wt].totalCount += 1;

      if (!map[wt].kinds[kindKey]) {
        map[wt].kinds[kindKey] = { kindName: wk, totalCount: 0, details: {} };
      }
      map[wt].kinds[kindKey].totalCount += 1;

      if (!map[wt].kinds[kindKey].details[detailKey]) {
        map[wt].kinds[kindKey].details[detailKey] = [];
      }
      map[wt].kinds[kindKey].details[detailKey].push(p);
    });

    return map;
  }, [photos]);

  // ==================== 2. 写真区分ツリー (要領規定順: 着手前完成 > 施工状況 > 出来形 等) ====================
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
      const category = p.category || '施工状況写真';

      let effectiveWork = p.workType?.trim() || '';
      if (!effectiveWork || effectiveWork === '工事' || effectiveWork === '一般工種' || effectiveWork === '工事写真' || effectiveWork === '本工事') {
        effectiveWork = p.workKind?.trim() || p.workDetail?.trim() || '本工事';
      }

      let effectiveItem = p.workDetail?.trim() || p.title?.trim() || '';
      if (!effectiveItem || effectiveItem === '工事' || effectiveItem === effectiveWork) {
        effectiveItem = (p.station ? `測点: ${p.station}` : '') || p.fileName;
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

  // 検索フィルター（工種体系写真）
  const filteredWorkTreeGroups = useMemo(() => {
    if (!searchQuery) return workTreeGroups;
    const query = searchQuery.toLowerCase();
    const result: typeof workTreeGroups = {};

    Object.entries(workTreeGroups).forEach(([wt, wtGroup]) => {
      const matchedKinds: typeof wtGroup.kinds = {};
      let total = 0;

      Object.entries(wtGroup.kinds).forEach(([kindKey, kGroup]) => {
        const matchedDetails: typeof kGroup.details = {};
        let kindTotal = 0;

        Object.entries(kGroup.details).forEach(([detailKey, list]) => {
          const matched = list.filter(p =>
            p.title.toLowerCase().includes(query) ||
            p.station?.toLowerCase().includes(query) ||
            p.remarks?.toLowerCase().includes(query) ||
            p.workType?.toLowerCase().includes(query) ||
            p.workKind?.toLowerCase().includes(query) ||
            p.workDetail?.toLowerCase().includes(query) ||
            wt.toLowerCase().includes(query) ||
            (kGroup.kindName && kGroup.kindName.toLowerCase().includes(query)) ||
            (detailKey !== '__DIRECT__' && detailKey.toLowerCase().includes(query))
          );
          if (matched.length > 0) {
            matchedDetails[detailKey] = matched;
            kindTotal += matched.length;
          }
        });

        if (Object.keys(matchedDetails).length > 0) {
          matchedKinds[kindKey] = {
            kindName: kGroup.kindName,
            totalCount: kindTotal,
            details: matchedDetails
          };
          total += kindTotal;
        }
      });

      if (Object.keys(matchedKinds).length > 0) {
        result[wt] = {
          workType: wtGroup.workType,
          totalCount: total,
          kinds: matchedKinds
        };
      }
    });

    return result;
  }, [workTreeGroups, searchQuery]);

  // 検索フィルター（書類）
  const filteredDocGroups = useMemo(() => {
    if (!searchQuery) return docGroups;
    const query = searchQuery.toLowerCase();
    const result: typeof docGroups = {};

    Object.entries(docGroups).forEach(([catName, catObj]) => {
      if (catObj.isMeetCategory && catObj.proposalMap) {
        const matchedPropMap: Record<string, Record<string, DocGroupItem>> = {};
        let matchedCount = 0;

        Object.entries(catObj.proposalMap).forEach(([propName, groupMap]) => {
          const matchedGroupMap: Record<string, DocGroupItem> = {};
          Object.entries(groupMap).forEach(([gTitle, data]) => {
            const matchedItems = data.items.filter(item => 
              item.title.toLowerCase().includes(query) || 
              gTitle.toLowerCase().includes(query) ||
              catName.toLowerCase().includes(query) ||
              propName.toLowerCase().includes(query) ||
              ('fileName' in item && item.fileName.toLowerCase().includes(query))
            );
            if (matchedItems.length > 0) {
              matchedGroupMap[gTitle] = { ...data, items: matchedItems };
              matchedCount += matchedItems.length;
            }
          });
          if (Object.keys(matchedGroupMap).length > 0) {
            matchedPropMap[propName] = matchedGroupMap;
          }
        });

        if (Object.keys(matchedPropMap).length > 0) {
          result[catName] = {
            ...catObj,
            totalCount: matchedCount,
            proposalMap: matchedPropMap,
          };
        }
      } else if (catObj.directMap) {
        const matchedGroupMap: Record<string, DocGroupItem> = {};
        let matchedCount = 0;

        Object.entries(catObj.directMap).forEach(([gTitle, data]) => {
          const matchedItems = data.items.filter(item => 
            item.title.toLowerCase().includes(query) || 
            gTitle.toLowerCase().includes(query) ||
            catName.toLowerCase().includes(query) ||
            ('fileName' in item && item.fileName.toLowerCase().includes(query))
          );
          if (matchedItems.length > 0) {
            matchedGroupMap[gTitle] = { ...data, items: matchedItems };
            matchedCount += matchedItems.length;
          }
        });

        if (Object.keys(matchedGroupMap).length > 0) {
          result[catName] = {
            ...catObj,
            totalCount: matchedCount,
            directMap: matchedGroupMap,
          };
        }
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
          onClick={() => { setIsOpen(true); handleTabChange('docs'); }}
          className={`p-1.5 rounded-lg transition mb-2 ${
            activeTab === 'docs' ? 'text-blue-400 bg-blue-600/20' : 'text-slate-500 hover:text-slate-300'
          }`}
          title="書類ツリー"
        >
          <FileText className="w-4 h-4" />
        </button>

        <button
          onClick={() => { setIsOpen(true); handleTabChange('photos'); }}
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

  // 各帳票エントリー (単独ファイルまたは 鑑+本文+添付+オリジナル原典フォルダ) のレンダリング
  const renderDocGroupEntry = (catName: string, gTitle: string, data: DocGroupItem, propName?: string) => {
    const subKey = propName ? `doc_sub_${catName}_${propName}_${gTitle}` : `doc_sub_${catName}_${gTitle}`;
    const subOpen = isFolderOpen(subKey);
    const items = data.items;
    const isSingle = items.length === 1 && items[0].title === gTitle;
    const propBadge = data.proposalItem ? getProposalBadge(data.proposalItem) : null;

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
          <div className="min-w-0 flex-1 truncate text-xs flex items-center gap-1.5">
            {propBadge && (
              <span className={`text-[10px] px-1 py-0.2 rounded border shrink-0 ${propBadge.cls}`}>
                {propBadge.label}
              </span>
            )}
            <span className="truncate">{item.title}</span>
          </div>
        </button>
      );
    }

    const firstItem = items[0];
    const subFiles = items.slice(1);
    const pdfSubFiles = subFiles.filter(it => !('fileRole' in it && it.fileRole === 'オリジナル原典'));
    const origFiles = subFiles.filter(it => 'fileRole' in it && it.fileRole === 'オリジナル原典');
    const origKey = propName ? `doc_orig_${catName}_${propName}_${gTitle}` : `doc_orig_${catName}_${gTitle}`;
    const origOpen = isFolderOpen(origKey);
    const isDrawing = data.type === 'drawing';
    const isFirstSelected = isDrawing ? firstItem.id === selectedDrawingId : firstItem.id === selectedReportId;
    const isAnySelected = items.some(it => isDrawing ? it.id === selectedDrawingId : it.id === selectedReportId);
    const recFirst = inspectionRecords[firstItem.id];

    return (
      <div key={gTitle} className="space-y-0.5">
        {/* 帳票件名 ＝ 鑑・正本PDF (クリックで即時表示) */}
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
            {propBadge && (
              <span className={`text-[10px] px-1 py-0.2 rounded border shrink-0 ${propBadge.cls}`}>
                {propBadge.label}
              </span>
            )}
            <span className="text-xs truncate">{gTitle}</span>
            {subFiles.length > 0 && (
              <span className="text-[10px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded shrink-0 flex items-center gap-1">
                {pdfSubFiles.length > 0 && <span>+添付{pdfSubFiles.length}</span>}
                {origFiles.length > 0 && <span className="text-indigo-400 font-medium">原典{origFiles.length}</span>}
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

        {/* 本文・添付ファイル ＆ オリジナルファイルフォルダ */}
        {subOpen && subFiles.length > 0 && (
          <div className="ml-4 pl-2 border-l border-slate-800/80 space-y-0.5 mt-0.5">
            {/* 1. 添付PDFや本文ファイル */}
            {pdfSubFiles.map((item) => {
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

            {/* 2. オリジナルファイル専用フォルダ */}
            {origFiles.length > 0 && (
              <div className="space-y-0.5 mt-1 pt-0.5">
                <div
                  onClick={() => toggleFolder(origKey)}
                  className="flex items-center justify-between p-1 rounded hover:bg-slate-900 cursor-pointer text-slate-300 group transition text-[11px]"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {origOpen ? (
                      <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                    )}
                    <Folder className="w-3 h-3 text-indigo-400 shrink-0" />
                    <span className="truncate group-hover:text-white font-medium">オリジナルファイル</span>
                  </div>
                  <span className="text-[10px] text-indigo-300 bg-indigo-950/60 border border-indigo-800/40 px-1 py-0.2 rounded shrink-0">
                    {origFiles.length}
                  </span>
                </div>

                {origOpen && (
                  <div className="ml-3 pl-2 border-l border-indigo-900/40 space-y-0.5 mt-0.5">
                    {origFiles.map((item) => {
                      const isSubSelected = item.id === selectedReportId;
                      const recSub = inspectionRecords[item.id];

                      return (
                        <button
                          key={item.id}
                          onClick={() => onSelectReport(item.id)}
                          className={`w-full text-left p-1 rounded flex items-center gap-1.5 transition ${
                            isSubSelected
                              ? 'bg-indigo-600/25 text-indigo-300 font-semibold border border-indigo-500/40'
                              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                          }`}
                        >
                          <div className="shrink-0">
                            {recSub?.status === 'ok' ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            ) : recSub?.status === 'issue' ? (
                              <AlertCircle className="w-3 h-3 text-rose-400" />
                            ) : (
                              <FileSpreadsheet className="w-3 h-3 text-indigo-400/80" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 truncate text-[11px]" title={('summary' in item && item.summary) ? item.summary : item.title}>
                            <span className="text-slate-300">{item.title || item.fileName}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

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
          onClick={() => handleTabChange('docs')}
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
          onClick={() => handleTabChange('photos')}
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
              {Object.entries(filteredDocGroups).map(([catName, catObj]) => {
                const catKey = `doc_cat_${catName}`;
                const catOpen = isFolderOpen(catKey);
                const totalInCat = catObj.totalCount;

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

                    {/* 第2階層: 打合せ簿の場合は発議事項別、その他の場合は直接帳票件名 */}
                    {catOpen && (
                      <div className="ml-3 pl-2 border-l border-slate-800 space-y-1 mt-0.5">
                        {catObj.isMeetCategory && catObj.proposalMap ? (
                          Object.entries(catObj.proposalMap).map(([propName, groupMap]) => {
                            const propKey = `doc_prop_${catName}_${propName}`;
                            const propOpen = isFolderOpen(propKey);
                            const totalInProp = Object.values(groupMap).reduce((acc, g) => acc + g.items.length, 0);
                            const badge = getProposalBadge(propName);

                            return (
                              <div key={propName} className="space-y-0.5">
                                {/* 発議事項サブフォルダ (協議, 承諾, 指示, 提出, 報告 等) */}
                                <div
                                  onClick={() => toggleFolder(propKey)}
                                  className="flex items-center justify-between p-1 rounded hover:bg-slate-900 cursor-pointer text-slate-200 group transition"
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    {propOpen ? (
                                      <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    )}
                                    <Folder className={`w-3.5 h-3.5 shrink-0 ${
                                      /協議/.test(propName) ? 'text-blue-400' :
                                      /指示/.test(propName) ? 'text-purple-400' :
                                      /承諾/.test(propName) ? 'text-emerald-400' :
                                      /提出/.test(propName) ? 'text-amber-400' :
                                      /報告/.test(propName) ? 'text-cyan-400' :
                                      /立会|確認/.test(propName) ? 'text-rose-400' : 'text-slate-400'
                                    }`} />
                                    {badge ? (
                                      <span className={`text-[10px] px-1.5 py-0.2 rounded border font-semibold ${badge.cls}`}>
                                        {propName}
                                      </span>
                                    ) : (
                                      <span className="truncate group-hover:text-white font-medium text-xs">{propName}</span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.2 rounded-full shrink-0">
                                    {totalInProp}
                                  </span>
                                </div>

                                {/* 発議事項配下の各打合せ簿 */}
                                {propOpen && (
                                  <div className="ml-3 pl-2 border-l border-slate-800/80 space-y-1 mt-0.5">
                                    {Object.entries(groupMap).map(([gTitle, data]) =>
                                      renderDocGroupEntry(catName, gTitle, data, propName)
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          Object.entries(catObj.directMap || {}).map(([gTitle, data]) =>
                            renderDocGroupEntry(catName, gTitle, data)
                          )
                        )}
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
            {/* 整理軸切替ピルボタン (工種体系 / 撮影日別 / 写真区分別 / 測点別) */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900/90 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setPhotoTreeMode('workTree')}
                className={`py-1 px-1.5 rounded flex items-center justify-center gap-1 font-bold transition text-xs ${
                  photoTreeMode === 'workTree'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="工種 ＞ 種別 ＞ 細別（設計書・写真管理ソフト準拠）"
              >
                <FolderGit2 className="w-3.5 h-3.5 text-blue-300" />
                <span>工種体系</span>
              </button>
              <button
                onClick={() => setPhotoTreeMode('timeline')}
                className={`py-1 px-1.5 rounded flex items-center justify-center gap-1 font-bold transition text-xs ${
                  photoTreeMode === 'timeline'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="撮影日別（タイムライン進捗順）"
              >
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>撮影日別</span>
              </button>
              <button
                onClick={() => setPhotoTreeMode('category')}
                className={`py-1 px-1.5 rounded flex items-center justify-center gap-1 font-bold transition text-xs ${
                  photoTreeMode === 'category'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="要領基準（写真区分別）"
              >
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>写真区分別</span>
              </button>
              <button
                onClick={() => setPhotoTreeMode('station')}
                className={`py-1 px-1.5 rounded flex items-center justify-center gap-1 font-bold transition text-xs ${
                  photoTreeMode === 'station'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="測点別（施工箇所・キロ程順）"
              >
                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                <span>測点別</span>
              </button>
            </div>

            {/* 写真アイテム共通レンダラー (見やすい写真区分バッジ・測点・タイトル) */}
            {(() => {
              const renderPhotoItem = (photo: PhotoItem) => {
                const isSelected = photo.id === selectedPhotoId;
                const rec = inspectionRecords[photo.id];
                const badge = getPhotoCategoryBadge(photo.category);

                return (
                  <button
                    key={photo.id}
                    onClick={() => onSelectPhoto(photo.id)}
                    className={`w-full text-left p-1.5 rounded flex items-start gap-1.5 transition ${
                      isSelected
                        ? 'bg-blue-600/25 text-blue-300 font-semibold border border-blue-500/40 shadow-sm'
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
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border shrink-0 ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {photo.station && (
                          <span className="text-[10px] font-mono font-semibold text-amber-300 shrink-0">
                            {photo.station}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs leading-tight text-slate-200 font-medium">
                        {photo.title || photo.fileName}
                      </div>
                      {photo.date && (
                        <div className="text-[10px] text-slate-500 mt-0.5 font-mono">{photo.date} {photo.time || ''}</div>
                      )}
                    </div>
                  </button>
                );
              };

              return (
                <>
                  {/* ==================== モード 1: 工種体系ツリー (工種 > 種別 > 細別 > 写真) ==================== */}
                  {photoTreeMode === 'workTree' && (
                    Object.keys(filteredWorkTreeGroups).length === 0 ? (
                      <div className="p-4 text-center text-slate-500 text-xs">該当する写真がありません</div>
                    ) : (
                      <div className="space-y-1">
                        {Object.entries(filteredWorkTreeGroups).map(([workType, wtGroup]) => {
                          const wtKey = `wt_${workType}`;
                          const wtOpen = isFolderOpen(wtKey);
                          const kindEntries = Object.entries(wtGroup.kinds);

                          // 配下の最初の写真を探す
                          const getFirstPhotoInWt = () => {
                            for (const k of Object.values(wtGroup.kinds)) {
                              for (const photos of Object.values(k.details)) {
                                if (photos.length > 0) return photos[0];
                              }
                            }
                            return null;
                          };

                          return (
                            <div key={workType} className="select-none">
                              {/* 第1階層: 工種 (例: 擁壁工, 道路改良工) */}
                              <div
                                onClick={() => {
                                  toggleFolder(wtKey);
                                  const fp = getFirstPhotoInWt();
                                  if (fp) onSelectPhoto(fp.id);
                                }}
                                className="flex items-center justify-between p-1.5 rounded hover:bg-slate-900 cursor-pointer text-slate-100 font-bold group transition"
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  {wtOpen ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  )}
                                  <Folder className="w-4 h-4 text-blue-400 shrink-0" />
                                  <span className="truncate text-xs group-hover:text-white font-bold">{workType}</span>
                                </div>
                                <span className="text-[10px] text-blue-300 bg-blue-950/70 border border-blue-800/60 px-1.5 py-0.2 rounded-full shrink-0 font-mono">
                                  {wtGroup.totalCount}
                                </span>
                              </div>

                              {/* 工種配下の展開 */}
                              {wtOpen && (
                                <div className="ml-3 pl-2 border-l border-slate-800 space-y-1 mt-0.5">
                                  {kindEntries.map(([kindKey, kGroup]) => {
                                    const hasRealKind = kindKey !== '__DIRECT__' && kGroup.kindName;
                                    const kKey = `wk_${workType}_${kindKey}`;
                                    const kOpen = isFolderOpen(kKey);
                                    const detailEntries = Object.entries(kGroup.details);

                                    // 配下の最初の写真
                                    const getFirstPhotoInKind = () => {
                                      for (const photos of Object.values(kGroup.details)) {
                                        if (photos.length > 0) return photos[0];
                                      }
                                      return null;
                                    };

                                    // 細別または写真のレンダラー
                                    const renderDetails = () => (
                                      <div className={hasRealKind ? "ml-3 pl-2 border-l border-slate-800/80 space-y-1 mt-0.5" : "space-y-1"}>
                                        {detailEntries.map(([detailKey, photoList]) => {
                                          const hasRealDetail = detailKey !== '__DIRECT__';
                                          const dKey = `wd_${workType}_${kindKey}_${detailKey}`;
                                          const dOpen = isFolderOpen(dKey);

                                          if (hasRealDetail) {
                                            return (
                                              <div key={detailKey}>
                                                {/* 第3階層: 細別 (例: 基礎砕石工, 鉄筋工, コンクリート打設) */}
                                                <div
                                                  onClick={() => {
                                                    toggleFolder(dKey);
                                                    if (photoList.length > 0) onSelectPhoto(photoList[0].id);
                                                  }}
                                                  className="flex items-center justify-between p-1 rounded hover:bg-slate-900/80 cursor-pointer text-slate-300 font-medium group transition"
                                                >
                                                  <div className="flex items-center gap-1.5 truncate">
                                                    {dOpen ? (
                                                      <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
                                                    ) : (
                                                      <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                                                    )}
                                                    <Tag className="w-3 h-3 text-emerald-400 shrink-0" />
                                                    <span className="text-xs truncate group-hover:text-slate-100 font-medium">
                                                      {detailKey}
                                                    </span>
                                                  </div>
                                                  <span className="text-[10px] text-slate-500 bg-slate-900 px-1.5 py-0.2 rounded shrink-0 font-mono">
                                                    {photoList.length}
                                                  </span>
                                                </div>

                                                {/* 写真リスト */}
                                                {dOpen && (
                                                  <div className="ml-3 pl-2 border-l border-slate-800/60 space-y-0.5 mt-0.5">
                                                    {photoList.map(renderPhotoItem)}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          }

                                          // 細別がない場合は直接写真リストを展開
                                          return (
                                            <div key={detailKey} className="space-y-0.5">
                                              {photoList.map(renderPhotoItem)}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );

                                    // 種別がある場合: 第2階層として種別フォルダを描画 (例: 重力式擁壁, L型擁壁)
                                    if (hasRealKind) {
                                      return (
                                        <div key={kindKey}>
                                          <div
                                            onClick={() => {
                                              toggleFolder(kKey);
                                              const fp = getFirstPhotoInKind();
                                              if (fp) onSelectPhoto(fp.id);
                                            }}
                                            className="flex items-center justify-between p-1 rounded hover:bg-slate-900/70 cursor-pointer text-slate-200 font-semibold group transition"
                                          >
                                            <div className="flex items-center gap-1.5 truncate">
                                              {kOpen ? (
                                                <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
                                              ) : (
                                                <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                                              )}
                                              <FolderGit2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                              <span className="text-xs truncate group-hover:text-white font-semibold">
                                                {kGroup.kindName}
                                              </span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.2 rounded shrink-0 font-mono">
                                              {kGroup.totalCount}
                                            </span>
                                          </div>

                                          {kOpen && renderDetails()}
                                        </div>
                                      );
                                    }

                                    // 種別がない場合はスマートスキップして細別または写真を直接描画
                                    return <div key={kindKey}>{renderDetails()}</div>;
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}

                  {/* ==================== モード 2: 撮影日別（タイムライン）ツリー ==================== */}
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
                                            if (photoList.length > 0) onSelectPhoto(photoList[0].id);
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
                                            {photoList.map(renderPhotoItem)}
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

                  {/* ==================== モード 3: 写真区分別ツリー (要領基準) ==================== */}
                  {photoTreeMode === 'category' && (
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
                                  <Folder className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  <span className="truncate group-hover:text-white text-xs">{category}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded-full shrink-0">
                                  {totalInCat}
                                </span>
                              </div>

                              {/* 第2階層: 工種 */}
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
                                                      if (photoList.length > 0) onSelectPhoto(photoList[0].id);
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

                                                  {/* 写真リスト */}
                                                  {titleOpen && (
                                                    <div className="ml-3 pl-2 border-l border-slate-800/40 space-y-0.5 mt-0.5">
                                                      {photoList.map(renderPhotoItem)}
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

                  {/* ==================== モード 4: 測点別ツリー ==================== */}
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
                                  if (photoList.length > 0) onSelectPhoto(photoList[0].id);
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
                                  {photoList.map(renderPhotoItem)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};
