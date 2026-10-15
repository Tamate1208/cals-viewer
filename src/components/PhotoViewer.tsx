import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  Image as ImageIcon, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Printer, 
  Grid, 
  ArrowUpDown,
  X,
  Maximize2
} from 'lucide-react';
import type { InspectionRecord, PhotoItem } from '../types/cals';
import { buildPhotoRecord } from '../utils/inspectionRecord';

interface PhotoViewerProps {
  photos: PhotoItem[];
  selectedPhotoId?: string | null;
  inspectionRecords: Record<string, InspectionRecord>;
  onSelectPhoto?: (id: string) => void;
  onUpdateInspection: (record: InspectionRecord) => void;
}

export const PhotoViewer: React.FC<PhotoViewerProps> = ({
  photos,
  selectedPhotoId: controlledPhotoId,
  inspectionRecords,
  onSelectPhoto,
  onUpdateInspection,
}) => {
  const [internalPhotoId, setInternalPhotoId] = useState<string | null>(photos[0]?.id || null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedWorkType, setSelectedWorkType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // 横並び枚数指定: 1枚、2枚、3枚 (デフォルト3枚横並び)
  const [columns, setColumns] = useState<1 | 2 | 3>(3);
  
  // 並び順ソート
  const [sortOrder, setSortOrder] = useState<'date-asc' | 'date-desc' | 'station' | 'serial'>('date-asc');

  // 写真拡大ライトボックス用ステート
  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoItem | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState<number>(1);

  // スクロールコンテナ用 ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const selectedPhotoId = controlledPhotoId !== undefined ? controlledPhotoId : internalPhotoId;
  const setSelectedPhotoId = (id: string) => {
    setInternalPhotoId(id);
    onSelectPhoto?.(id);
  };

  // 工種のユニーク一覧
  const workTypes = useMemo(() => {
    const set = new Set<string>();
    photos.forEach(p => {
      if (p.workType) set.add(p.workType);
    });
    return Array.from(set);
  }, [photos]);

  // 写真区分のユニーク一覧
  const categories = useMemo(() => {
    const set = new Set<string>();
    photos.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [photos]);

  // フィルタリング
  const filteredPhotos = useMemo(() => {
    return photos.filter(p => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (selectedWorkType !== 'all' && p.workType !== selectedWorkType) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = p.title.toLowerCase().includes(query);
        const matchesStation = p.station?.toLowerCase().includes(query) || false;
        const matchesRemarks = p.remarks?.toLowerCase().includes(query) || false;
        const matchesBlackboard = p.blackboardItems.some(bb => 
          bb.name.toLowerCase().includes(query) || bb.value.toLowerCase().includes(query)
        );
        if (!matchesTitle && !matchesStation && !matchesRemarks && !matchesBlackboard) return false;
      }
      return true;
    });
  }, [photos, selectedCategory, selectedWorkType, searchQuery]);

  // 並び順ソート（撮影日時昇順・降順、測点順、納品連番順）
  const sortedFilteredPhotos = useMemo(() => {
    const list = [...filteredPhotos];
    switch (sortOrder) {
      case 'date-asc':
        return list.sort((a, b) => {
          const d1 = (a.date || '') + (a.time || '');
          const d2 = (b.date || '') + (b.time || '');
          if (d1 !== d2) return d1.localeCompare(d2);
          return (a.station || '').localeCompare(b.station || '');
        });
      case 'date-desc':
        return list.sort((a, b) => {
          const d1 = (a.date || '') + (a.time || '');
          const d2 = (b.date || '') + (b.time || '');
          if (d1 !== d2) return d2.localeCompare(d1);
          return (b.station || '').localeCompare(a.station || '');
        });
      case 'station':
        return list.sort((a, b) => {
          const s1 = a.station || '';
          const s2 = b.station || '';
          if (s1 !== s2) {
            if (!s1) return 1;
            if (!s2) return -1;
            return s1.localeCompare(s2, undefined, { numeric: true, sensitivity: 'base' });
          }
          return ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || ''));
        });
      case 'serial':
      default:
        return list;
    }
  }, [filteredPhotos, sortOrder]);

  // 選択された写真が現在のフィルターで非表示になっている場合、フィルターを解除（レンダー中同期調整）
  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(null);
  if (selectedPhotoId !== prevSelectedId) {
    setPrevSelectedId(selectedPhotoId);
    if (selectedPhotoId) {
      const photo = photos.find(p => p.id === selectedPhotoId);
      if (photo) {
        if (selectedCategory !== 'all' && photo.category !== selectedCategory) {
          setSelectedCategory('all');
        }
        if (selectedWorkType !== 'all' && photo.workType !== selectedWorkType) {
          setSelectedWorkType('all');
        }
      }
    }
  }

  // 選択された写真が変わった時、その写真カードの位置へスムーズスクロール
  // （content-visibilityやLayout Shiftによるズレを自動補正する精密スクロール）
  useEffect(() => {
    if (!selectedPhotoId) return;

    let isCancelled = false;
    let verifyTimer: any = null;

    const scrollToTarget = () => {
      const container = scrollContainerRef.current;
      if (!container || isCancelled) return;

      const doc = container.ownerDocument || document;
      const el = doc.getElementById(`photo-card-${selectedPhotoId}`);
      if (!el) return;

      // コンテナ内の相対位置から、カードがコンテナ中央に来る目標 scrollTop を正確に算出
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const currentScrollTop = container.scrollTop;
      const targetScrollTop = currentScrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2);

      // スムーズスクロール実行
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });

      // content-visibility: auto や画像の読み込みによる高さ変動（Layout Shift）を吸収するため、
      // スクロール完了後にズレがないか再確認し、中央から外れていればピタリと補正する
      verifyTimer = setTimeout(() => {
        if (isCancelled || !scrollContainerRef.current) return;
        const currentEl = doc.getElementById(`photo-card-${selectedPhotoId}`);
        if (!currentEl) return;

        const cRect = container.getBoundingClientRect();
        const eRect = currentEl.getBoundingClientRect();
        const diff = (eRect.top + eRect.height / 2) - (cRect.top + cRect.height / 2);

        // 許容誤差 35px 以上ズレていたら最終補正
        if (Math.abs(diff) > 35) {
          container.scrollTo({
            top: Math.max(0, container.scrollTop + diff),
            behavior: 'auto',
          });
        }
      }, 350);
    };

    // DOMレンダリング及びフィルタ解除（全表示戻し）の反映を待ってスクロール開始
    const initialTimer = setTimeout(scrollToTarget, 60);

    return () => {
      isCancelled = true;
      clearTimeout(initialTimer);
      if (verifyTimer) clearTimeout(verifyTimer);
    };
  }, [selectedPhotoId, sortedFilteredPhotos]);

  // ライトボックスが開いた時にEscキーで閉じる（別窓でも確実に動作するよう所属ウィンドウに登録）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxPhoto(null);
      }
    };
    if (lightboxPhoto) {
      const win = scrollContainerRef.current?.ownerDocument.defaultView || window;
      win.addEventListener('keydown', handleKeyDown);
      if (window !== win) {
        window.addEventListener('keydown', handleKeyDown);
      }
      return () => {
        win.removeEventListener('keydown', handleKeyDown);
        if (window !== win) {
          window.removeEventListener('keydown', handleKeyDown);
        }
      };
    }
  }, [lightboxPhoto]);

  // 検査ステータス更新
  const handleSetStatus = (photo: PhotoItem, status: 'ok' | 'issue') => {
    const rec = inspectionRecords[photo.id];
    const newStatus = rec?.status === status ? 'pending' : status;
    onUpdateInspection(buildPhotoRecord(photo, newStatus, rec?.notes || ''));
  };

  const handleUpdateNotes = (photo: PhotoItem, notes: string) => {
    const rec = inspectionRecords[photo.id];
    onUpdateInspection(buildPhotoRecord(photo, rec?.status || 'issue', notes));
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 text-slate-100 overflow-hidden">
      {/* フィルター＆ヘッダー操作バー */}
      <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
          {/* 横並び枚数指定ボタン [横並び: 1枚 | 2枚 | 3枚] */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 shrink-0">
            <span className="text-xs text-slate-400 font-semibold px-2 flex items-center gap-1.5">
              <Grid className="w-3.5 h-3.5 text-blue-400" />
              <span>横並び:</span>
            </span>
            {([1, 2, 3] as const).map((col) => (
              <button
                key={col}
                onClick={() => setColumns(col)}
                className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                  columns === col
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                }`}
                title={`横並び${col}枚で表示`}
              >
                {col}枚
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-slate-800 shrink-0" />

          {/* 写真区分タブ */}
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-slate-800 text-blue-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            すべて ({photos.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-slate-800 text-blue-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ソートセレクター ＆ 工種セレクト ＆ 検索 ＆ 印刷 */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* 並び順ソートセレクター */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'date-asc' | 'date-desc' | 'station' | 'serial')}
              className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer"
              title="写真の表示順序を変更"
            >
              <option value="date-asc" className="bg-slate-900 text-slate-200">撮影日時 (古い順・施工順)</option>
              <option value="date-desc" className="bg-slate-900 text-slate-200">撮影日時 (新しい順)</option>
              <option value="station" className="bg-slate-900 text-slate-200">測点順</option>
              <option value="serial" className="bg-slate-900 text-slate-200">納品連番順</option>
            </select>
          </div>

          {workTypes.length > 0 && (
            <select
              value={selectedWorkType}
              onChange={(e) => setSelectedWorkType(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
            >
              <option value="all">全工種 ({workTypes.length})</option>
              {workTypes.map(wt => (
                <option key={wt} value={wt}>{wt}</option>
              ))}
            </select>
          )}

          <div className="relative flex-1 sm:w-40">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="写真・黒板検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            onClick={() => (scrollContainerRef.current?.ownerDocument.defaultView || window).print()}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition shrink-0"
            title="写真台帳を印刷・PDF保存"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">印刷</span>
          </button>
        </div>
      </div>

      {/* サブステータスバー（表示件数サマリー） */}
      <div className="px-4 py-1.5 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <div className="flex items-center gap-2">
          <span>表示中: <strong className="text-blue-400 font-semibold">{sortedFilteredPhotos.length}</strong> / 全 {photos.length} 枚</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-300 font-medium">横並び {columns} 枚でスクロール閲覧中</span>
        </div>
        <span className="text-[11px] text-slate-500 hidden sm:inline">
          ※ 写真をクリックすると拡大確認できます / スクロールで連続閲覧可能
        </span>
      </div>

      {/* ==================== 連続スクロール写真グリッド ==================== */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-3 sm:p-4 bg-slate-950"
      >
        {sortedFilteredPhotos.length === 0 ? (
          <div className="p-16 text-center text-slate-500 text-sm flex flex-col items-center">
            <ImageIcon className="w-12 h-12 text-slate-700 mb-2" />
            <p>該当する写真が見つかりません</p>
            <p className="text-xs text-slate-600 mt-1">検索条件やフィルターを変更してください</p>
          </div>
        ) : (
          <div className={`mx-auto w-full grid gap-4 ${
            columns === 1 
              ? 'grid-cols-1 max-w-4xl' 
              : columns === 2 
              ? 'grid-cols-1 md:grid-cols-2 max-w-7xl' 
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-[1900px]'
          }`}>
            {sortedFilteredPhotos.map((photo, index) => {
              const isSelected = photo.id === selectedPhotoId;
              const rec = inspectionRecords[photo.id];

              return (
                <div
                  key={photo.id}
                  id={`photo-card-${photo.id}`}
                  onClick={() => setSelectedPhotoId(photo.id)}
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '400px', minHeight: '380px' }}
                  className={`bg-slate-900 border rounded-xl overflow-hidden shadow-xl transition flex flex-col cursor-pointer ${
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-500/50 shadow-blue-500/10'
                      : 'border-slate-800 hover:border-slate-700 hover:shadow-2xl'
                  }`}
                >
                  {/* 上部: 写真画像領域 (アスペクト比4:3で大きく表示) */}
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPhotoId(photo.id);
                      setLightboxPhoto(photo);
                      setLightboxZoom(1);
                    }}
                    className="w-full bg-slate-950 relative flex items-center justify-center aspect-[4/3] p-1.5 border-b border-slate-800 overflow-hidden group cursor-zoom-in"
                    title="クリックして拡大表示"
                  >
                    {photo.fileUrl ? (
                      <img
                        src={photo.fileUrl}
                        alt={photo.title}
                        loading="lazy"
                        className="w-full h-full object-contain rounded transition duration-200 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="text-center text-slate-600 p-4">
                        <ImageIcon className="w-10 h-10 mx-auto mb-1 opacity-50" />
                        <span className="text-xs">写真画像未格納</span>
                      </div>
                    )}

                    {/* 写真番号バッジ */}
                    <div className="absolute top-2 left-2 bg-slate-950/85 backdrop-blur border border-slate-700 text-slate-200 text-xs font-mono font-bold px-2 py-0.5 rounded shadow pointer-events-none">
                      No. {index + 1} / {sortedFilteredPhotos.length}
                    </div>

                    {/* 拡大案内ホバーバッジ */}
                    <div className="absolute bottom-2 right-2 bg-slate-950/80 backdrop-blur text-slate-300 text-[11px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition flex items-center gap-1 pointer-events-none">
                      <Maximize2 className="w-3 h-3 text-blue-400" />
                      <span>拡大</span>
                    </div>

                    {/* ステータスバッジ */}
                    {rec?.status === 'ok' && (
                      <div className="absolute top-2 right-2 bg-emerald-600 text-white rounded-full p-1.5 shadow-lg pointer-events-none">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    )}
                    {rec?.status === 'issue' && (
                      <div className="absolute top-2 right-2 bg-rose-600 text-white rounded-full p-1.5 shadow-lg pointer-events-none">
                        <AlertCircle className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  {/* 下部: 工事写真台帳情報 ＆ 検査アクションバー */}
                  <div className="p-3 sm:p-3.5 flex flex-col justify-between flex-1 space-y-2.5 bg-slate-900/90">
                    <div>
                      {/* 区分バッジ ＆ タイトル */}
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <span className="bg-blue-600/25 text-blue-300 border border-blue-500/40 text-xs font-bold px-2 py-0.5 rounded">
                          {photo.category}
                        </span>
                        <span className="bg-slate-800 text-slate-300 text-xs px-2 py-0.5 rounded">
                          {photo.type}
                        </span>
                        <span className="font-mono text-slate-400 text-xs ml-auto">
                          {photo.fileName}
                        </span>
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-100 leading-snug line-clamp-1 mb-2">
                        {photo.title}
                      </h3>

                      {/* 工事写真台帳テーブル (見やすいフォントサイズ・太字) */}
                      <table className="w-full text-xs sm:text-sm border-collapse bg-slate-950/90 rounded-lg border border-slate-800 overflow-hidden mb-2">
                        <tbody>
                          <tr className="border-b border-slate-800/80">
                            <th className="py-1.5 px-3 bg-slate-900 text-slate-400 text-left font-medium w-1/4">工種</th>
                            <td className="py-1.5 px-3 text-slate-100 font-medium">
                              {photo.workType || 'ー'}
                              {photo.workKind ? ` / ${photo.workKind}` : ''}
                              {photo.workDetail ? ` (${photo.workDetail})` : ''}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-800/80">
                            <th className="py-1.5 px-3 bg-slate-900 text-slate-400 text-left font-medium">測点</th>
                            <td className="py-1.5 px-3 text-slate-100 font-mono font-bold">
                              {photo.station || 'ー'}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-800/80">
                            <th className="py-1.5 px-3 bg-slate-900 text-slate-400 text-left font-medium">撮影日時</th>
                            <td className="py-1.5 px-3 text-slate-200">
                              {photo.date || 'ー'} {photo.time || ''}
                            </td>
                          </tr>
                          {/* 黒板主要測定値 */}
                          {photo.blackboardItems && photo.blackboardItems.length > 0 && (
                            photo.blackboardItems
                              .filter(bb => !['工種', '種別', '細別', '測点', '項目'].includes(bb.name))
                              .slice(0, 3)
                              .map((bb, bIdx) => (
                                <tr key={bIdx} className="border-b border-slate-800/80 last:border-0">
                                  <th className="py-1.5 px-3 bg-slate-900 text-emerald-400 text-left font-medium">
                                    {bb.name}
                                  </th>
                                  <td className="py-1.5 px-3 text-slate-100 font-mono font-bold">
                                    {bb.value}
                                  </td>
                                </tr>
                              ))
                          )}
                          {photo.remarks && (
                            <tr>
                              <th className="py-1.5 px-3 bg-slate-900 text-slate-400 text-left font-medium">備考</th>
                              <td className="py-1.5 px-3 text-slate-300 text-xs truncate max-w-xs">{photo.remarks}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* 台帳カード内 検査チェックバー */}
                    <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetStatus(photo, 'ok');
                          }}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                            rec?.status === 'ok'
                              ? 'bg-emerald-600 text-white shadow'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-emerald-400'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{rec?.status === 'ok' ? '確認済 (適)' : '確認済みにする'}</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetStatus(photo, 'issue');
                          }}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                            rec?.status === 'issue'
                              ? 'bg-rose-600 text-white shadow'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-rose-400'
                          }`}
                        >
                          <AlertCircle className="w-4 h-4" />
                          <span>{rec?.status === 'issue' ? '要確認・指摘' : '指摘・要確認'}</span>
                        </button>
                      </div>

                      <div className="flex-1 min-w-[160px]" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          placeholder="検査メモ入力..."
                          value={rec?.notes || ''}
                          onChange={(e) => handleUpdateNotes(photo, e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ==================== 写真拡大ライトボックスモーダル ==================== */}
      {lightboxPhoto && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col overflow-hidden"
          onClick={() => setLightboxPhoto(null)}
        >
          {/* ライトボックスヘッダー */}
          <div 
            className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-3 text-slate-100 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded shrink-0">
                {lightboxPhoto.category}
              </span>
              <h2 className="text-sm font-bold text-slate-100 truncate">
                {lightboxPhoto.title}
              </h2>
              {lightboxPhoto.station && (
                <span className="text-xs text-amber-400 font-mono shrink-0">
                  [{lightboxPhoto.station}]
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* ズームコントローラー */}
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => setLightboxZoom(prev => Math.min(prev + 0.25, 4))}
                  className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white"
                  title="拡大"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setLightboxZoom(prev => Math.max(prev - 0.25, 0.5))}
                  className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white"
                  title="縮小"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setLightboxZoom(1)}
                  className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white"
                  title="100%にリセット"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs text-slate-400 px-1 font-mono">{Math.round(lightboxZoom * 100)}%</span>
              </div>

              {/* 閉じるボタン */}
              <button
                onClick={() => setLightboxPhoto(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                title="閉じる (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ライトボックスメイン画像表示 */}
          <div 
            className="flex-1 overflow-auto flex items-center justify-center p-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxPhoto.fileUrl ? (
              <img
                src={lightboxPhoto.fileUrl}
                alt={lightboxPhoto.title}
                style={{ transform: `scale(${lightboxZoom})` }}
                className="max-w-full max-h-full object-contain transition-transform duration-150 select-none shadow-2xl rounded"
              />
            ) : (
              <div className="text-slate-500 text-sm">写真画像ファイルがありません</div>
            )}
          </div>

          {/* ライトボックス下部情報バー */}
          <div 
            className="px-4 py-2 bg-slate-950/90 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-4 flex-wrap">
              {lightboxPhoto.workType && (
                <span>工種: <strong className="text-white">{lightboxPhoto.workType}</strong></span>
              )}
              {lightboxPhoto.date && (
                <span>撮影日: <strong className="text-white">{lightboxPhoto.date} {lightboxPhoto.time || ''}</strong></span>
              )}
              {lightboxPhoto.remarks && (
                <span className="text-slate-400">備考: {lightboxPhoto.remarks}</span>
              )}
            </div>
            <div className="text-slate-500 text-[11px]">
              Escキー または 枠外クリックで閉じます
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
