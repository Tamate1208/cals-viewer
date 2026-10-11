import React, { useState, useMemo, useEffect } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  Image as ImageIcon, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Calendar, 
  MapPin, 
  FileCheck,
  BookOpen,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Printer
} from 'lucide-react';
import type { InspectionRecord, PhotoItem } from '../types/cals';

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
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'single' | 'album'>('album'); // デフォルトを3枚綴じ写真台帳に
  const [albumPage, setAlbumPage] = useState<number>(0); // 3枚ごとのページインデックス

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

  // 現在選択中の写真
  const currentPhoto = photos.find(p => p.id === selectedPhotoId) || filteredPhotos[0] || photos[0];
  const currentRecord = currentPhoto ? inspectionRecords[currentPhoto.id] : undefined;

  // 選択された写真が変わった場合、その写真が含まれるページに自動追従
  useEffect(() => {
    if (selectedPhotoId) {
      const idx = filteredPhotos.findIndex(p => p.id === selectedPhotoId);
      if (idx >= 0) {
        const targetPage = Math.floor(idx / 3);
        if (targetPage !== albumPage) {
          setAlbumPage(targetPage);
        }
      }
    }
  }, [selectedPhotoId, filteredPhotos]);

  // フィルター変更時にページを0にリセット
  useEffect(() => {
    setAlbumPage(0);
  }, [selectedCategory, selectedWorkType, searchQuery]);

  // 台帳モードでの3枚スライス
  const totalAlbumPages = Math.ceil(filteredPhotos.length / 3) || 1;
  const currentAlbumPhotos = useMemo(() => {
    const start = albumPage * 3;
    return filteredPhotos.slice(start, start + 3);
  }, [filteredPhotos, albumPage]);

  // 検査ステータス更新
  const handleSetStatus = (photo: PhotoItem, status: 'ok' | 'issue') => {
    const rec = inspectionRecords[photo.id];
    onUpdateInspection({
      targetId: photo.id,
      targetType: 'photo',
      targetTitle: photo.title,
      status: rec?.status === status ? 'pending' : status,
      notes: rec?.notes || '',
      updatedAt: new Date().toLocaleString('ja-JP'),
    });
  };

  const handleUpdateNotes = (photo: PhotoItem, notes: string) => {
    const rec = inspectionRecords[photo.id];
    onUpdateInspection({
      targetId: photo.id,
      targetType: 'photo',
      targetTitle: photo.title,
      status: rec?.status || 'issue',
      notes,
      updatedAt: new Date().toLocaleString('ja-JP'),
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 text-slate-100 overflow-hidden">
      {/* フィルター＆モード切替ヘッダー */}
      <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
          {/* 表示モード切り替えトグル */}
          <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 shrink-0">
            <button
              onClick={() => setViewMode('album')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                viewMode === 'album'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="A4縦 3枚綴じの写真台帳形式で表示"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>写真台帳 (3枚綴じ)</span>
            </button>
            <button
              onClick={() => setViewMode('single')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                viewMode === 'single'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="1枚写真を大きく拡大表示"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>1枚詳細</span>
            </button>
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

        {/* 工種セレクト ＆ 検索 */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
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

          <div className="relative flex-1 sm:w-44">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="写真・黒板検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* ==================== 1. 写真台帳（3枚綴じ）表示モード ==================== */}
      {viewMode === 'album' ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          {/* 台帳ページネーションバー */}
          <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="font-semibold text-blue-400">工事写真台帳</span>
              <span className="text-slate-500">|</span>
              <span>
                {filteredPhotos.length === 0 ? '0' : albumPage * 3 + 1} - {Math.min((albumPage + 1) * 3, filteredPhotos.length)} / 全 {filteredPhotos.length} 枚
              </span>
              <span className="text-slate-500">（ページ {albumPage + 1} / {totalAlbumPages}）</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setAlbumPage(prev => Math.max(prev - 1, 0))}
                disabled={albumPage <= 0}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs text-slate-200 transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>前の3枚</span>
              </button>
              <button
                onClick={() => setAlbumPage(prev => Math.min(prev + 1, totalAlbumPages - 1))}
                disabled={albumPage >= totalAlbumPages - 1}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs text-slate-200 transition"
              >
                <span>次の3枚</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-400 hover:text-slate-200 transition ml-2"
                title="写真台帳を印刷・PDF保存"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">印刷</span>
              </button>
            </div>
          </div>

          {/* 3枚綴じ台帳スクロール領域 */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 max-w-5xl mx-auto w-full">
            {currentAlbumPhotos.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">該当する写真がありません</div>
            ) : (
              currentAlbumPhotos.map((photo, indexOnPage) => {
                const isSelected = photo.id === currentPhoto?.id;
                const rec = inspectionRecords[photo.id];
                const globalIndex = albumPage * 3 + indexOnPage + 1;

                return (
                  <div
                    key={photo.id}
                    onClick={() => setSelectedPhotoId(photo.id)}
                    className={`bg-slate-900 border rounded-xl overflow-hidden shadow-lg transition flex flex-col md:flex-row cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-500/30'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* 左側: 写真画像領域 (アスペクト比 4:3) */}
                    <div className="w-full md:w-5/12 bg-black/60 relative flex items-center justify-center min-h-[220px] md:min-h-[260px] p-2 border-b md:border-b-0 md:border-r border-slate-800">
                      {photo.fileUrl ? (
                        <img
                          src={photo.fileUrl}
                          alt={photo.title}
                          className="max-w-full max-h-[280px] object-contain rounded shadow"
                        />
                      ) : (
                        <div className="text-center text-slate-600 p-4">
                          <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
                          <span className="text-xs">写真画像未格納</span>
                        </div>
                      )}

                      {/* 写真番号バッジ */}
                      <div className="absolute top-2 left-2 bg-slate-950/80 backdrop-blur border border-slate-700 text-slate-300 text-[10px] font-mono px-2 py-0.5 rounded shadow">
                        No. {globalIndex} / {filteredPhotos.length}
                      </div>

                      {/* ステータスアイコン */}
                      {rec?.status === 'ok' && (
                        <div className="absolute top-2 right-2 bg-emerald-600 text-white rounded-full p-1 shadow">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      )}
                      {rec?.status === 'issue' && (
                        <div className="absolute top-2 right-2 bg-rose-600 text-white rounded-full p-1 shadow">
                          <AlertCircle className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>

                    {/* 右側: 工事写真台帳・電子黒板データフォーム */}
                    <div className="w-full md:w-7/12 p-3 sm:p-4 flex flex-col justify-between space-y-3">
                      <div>
                        {/* ヘッダー: 区分 ＆ タイトル */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="bg-blue-600/20 text-blue-400 border border-blue-500/30 text-[10px] font-semibold px-2 py-0.5 rounded">
                                {photo.category}
                              </span>
                              <span className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.5 rounded">
                                {photo.type}
                              </span>
                              <span className="font-mono text-slate-500 text-[10px]">
                                {photo.fileName}
                              </span>
                            </div>
                            <h3 className="text-sm font-bold text-slate-100 leading-snug">
                              {photo.title}
                            </h3>
                          </div>
                        </div>

                        {/* 工事写真台帳テーブル（A4台帳風フォーマット） */}
                        <table className="w-full text-xs border-collapse bg-slate-950/80 rounded-lg border border-slate-800 overflow-hidden mb-2">
                          <tbody>
                            <tr className="border-b border-slate-800/80">
                              <th className="py-1 px-2.5 bg-slate-900 text-slate-400 text-left font-medium w-1/4">工種</th>
                              <td className="py-1 px-2.5 text-slate-200">
                                {photo.workType || 'ー'}
                                {photo.workKind ? ` / ${photo.workKind}` : ''}
                                {photo.workDetail ? ` (${photo.workDetail})` : ''}
                              </td>
                            </tr>
                            <tr className="border-b border-slate-800/80">
                              <th className="py-1 px-2.5 bg-slate-900 text-slate-400 text-left font-medium">測点 / 箇所</th>
                              <td className="py-1 px-2.5 text-slate-200 font-mono">
                                {photo.station || 'ー'}
                              </td>
                            </tr>
                            <tr className="border-b border-slate-800/80">
                              <th className="py-1 px-2.5 bg-slate-900 text-slate-400 text-left font-medium">撮影年月日</th>
                              <td className="py-1 px-2.5 text-slate-200">
                                {photo.date || 'ー'} {photo.time || ''}
                              </td>
                            </tr>
                            {/* 電子黒板情報（測定項目・設計値・実測値など） */}
                            {photo.blackboardItems && photo.blackboardItems.length > 0 && (
                              photo.blackboardItems
                                .filter(bb => !['工種', '種別', '細別', '測点', '項目'].includes(bb.name))
                                .map((bb, bIdx) => (
                                  <tr key={bIdx} className="border-b border-slate-800/80 last:border-0">
                                    <th className="py-1 px-2.5 bg-slate-900 text-emerald-400/90 text-left font-medium">
                                      {bb.name}
                                    </th>
                                    <td className="py-1 px-2.5 text-slate-100 font-mono font-medium">
                                      {bb.value}
                                    </td>
                                  </tr>
                                ))
                            )}
                            {photo.remarks && (
                              <tr>
                                <th className="py-1 px-2.5 bg-slate-900 text-slate-400 text-left font-medium">備考</th>
                                <td className="py-1 px-2.5 text-slate-300 text-[11px]">{photo.remarks}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* 台帳カード内 検査チェックバー */}
                      <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetStatus(photo, 'ok');
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                              rec?.status === 'ok'
                                ? 'bg-emerald-600 text-white shadow'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-emerald-400'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{rec?.status === 'ok' ? '確認済 (適)' : '確認済みにする'}</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetStatus(photo, 'issue');
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                              rec?.status === 'issue'
                                ? 'bg-rose-600 text-white shadow'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-rose-400'
                            }`}
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>{rec?.status === 'issue' ? '要確認・指摘' : '指摘・要確認'}</span>
                          </button>
                        </div>

                        <div className="flex-1 min-w-[200px]" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            placeholder="検査メモ入力..."
                            value={rec?.notes || ''}
                            onChange={(e) => handleUpdateNotes(photo, e.target.value)}
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* ==================== 2. 1枚詳細表示モード ==================== */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 写真プレビュー ＆ 電子黒板情報 */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-slate-950">
            {/* 写真画像表示エリア */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black/60 group">
              {currentPhoto?.fileUrl ? (
                <div className="relative w-full h-full flex items-center justify-center p-2 overflow-auto">
                  <img
                    src={currentPhoto.fileUrl}
                    alt={currentPhoto.title}
                    style={{ transform: `scale(${zoomLevel})` }}
                    className="max-w-full max-h-full object-contain transition-transform duration-150 select-none shadow-2xl rounded"
                  />
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 flex flex-col items-center">
                  <ImageIcon className="w-12 h-12 text-slate-700 mb-2" />
                  <p className="text-xs">写真画像ファイルが見つかりません</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">({currentPhoto?.fileName})</p>
                </div>
              )}

              {/* ズームコントローラー */}
              <div className="absolute top-3 right-3 flex items-center gap-1 bg-slate-900/80 backdrop-blur-md border border-slate-700/80 p-1 rounded-lg opacity-80 group-hover:opacity-100 transition shadow-lg">
                <button
                  onClick={() => setZoomLevel(prev => Math.min(prev + 0.25, 3))}
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white"
                  title="拡大"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoomLevel(prev => Math.max(prev - 0.25, 0.5))}
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white"
                  title="縮小"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoomLevel(1)}
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white"
                  title="標準倍率にリセット"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-slate-400 px-1 font-mono">{Math.round(zoomLevel * 100)}%</span>
              </div>
            </div>

            {/* 選択写真の詳細 ＆ 電子黒板メタデータサイドバー */}
            {currentPhoto && (
              <div className="w-full lg:w-72 bg-slate-900/90 border-t lg:border-t-0 lg:border-l border-slate-800 p-3 flex flex-col shrink-0 overflow-y-auto max-h-56 lg:max-h-full">
                <div className="mb-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="bg-blue-600/30 text-blue-400 border border-blue-500/40 text-[10px] font-bold px-1.5 py-0.5 rounded">
                      {currentPhoto.category}
                    </span>
                    <span className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.5 rounded">
                      {currentPhoto.type}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-slate-100 leading-snug">
                    {currentPhoto.title}
                  </h3>
                </div>

                {/* 撮影情報 */}
                <div className="space-y-1 text-[11px] text-slate-300 mb-3 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                  {currentPhoto.date && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>撮影日: {currentPhoto.date} {currentPhoto.time || ''}</span>
                    </div>
                  )}
                  {currentPhoto.station && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span>測点: {currentPhoto.station}</span>
                    </div>
                  )}
                  {currentPhoto.workType && (
                    <div>
                      <span className="text-slate-400">工種: </span>
                      <span className="font-medium text-slate-200">{currentPhoto.workType}</span>
                      {currentPhoto.workKind && <span> / {currentPhoto.workKind}</span>}
                      {currentPhoto.workDetail && <span> ({currentPhoto.workDetail})</span>}
                    </div>
                  )}
                  {currentPhoto.remarks && (
                    <div className="mt-1 pt-1 border-t border-slate-800 text-slate-400 text-[10px]">
                      備考: {currentPhoto.remarks}
                    </div>
                  )}
                </div>

                {/* 電子黒板・測定項目情報 */}
                {currentPhoto.blackboardItems && currentPhoto.blackboardItems.length > 0 && (
                  <div className="flex-1">
                    <h4 className="text-[11px] font-bold text-emerald-400 mb-1.5 flex items-center gap-1">
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>電子黒板・測定項目</span>
                    </h4>
                    <table className="w-full text-[11px] border-collapse bg-slate-950/80 rounded border border-slate-800 overflow-hidden">
                      <tbody>
                        {currentPhoto.blackboardItems.map((bb, idx) => (
                          <tr key={idx} className="border-b border-slate-800/60 last:border-0">
                            <td className="py-1 px-2 text-slate-400 font-medium bg-slate-900/60 w-2/5">{bb.name}</td>
                            <td className="py-1 px-2 text-slate-100 font-mono font-semibold">{bb.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 検査アクションバー */}
          {currentPhoto && (
            <div className="p-2.5 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSetStatus(currentPhoto, 'ok')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    currentRecord?.status === 'ok'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-emerald-400'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{currentRecord?.status === 'ok' ? '確認済 (適)' : '写真 確認済'}</span>
                </button>

                <button
                  onClick={() => handleSetStatus(currentPhoto, 'issue')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    currentRecord?.status === 'issue'
                      ? 'bg-rose-600 text-white shadow'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-rose-400'
                  }`}
                >
                  <AlertCircle className="w-4 h-4" />
                  <span>{currentRecord?.status === 'issue' ? '要確認・指摘中' : '写真 要確認・指摘'}</span>
                </button>
              </div>

              {/* 指摘・メモ入力 */}
              <div className="flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="写真に関する検査メモ（例: 黒板測定値と設計値合致、クラックなし等）"
                  value={currentRecord?.notes || ''}
                  onChange={(e) => handleUpdateNotes(currentPhoto, e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* 下部サムネイルストリップ */}
          <div className="h-32 bg-slate-950/80 border-t border-slate-800 p-2 overflow-x-auto flex gap-2 shrink-0">
            {filteredPhotos.map((photo) => {
              const isSelected = photo.id === currentPhoto?.id;
              const rec = inspectionRecords[photo.id];
              return (
                <button
                  key={photo.id}
                  onClick={() => setSelectedPhotoId(photo.id)}
                  className={`flex flex-col text-left rounded-lg overflow-hidden border transition shrink-0 w-28 bg-slate-900 relative group ${
                    isSelected 
                      ? 'border-blue-500 ring-2 ring-blue-500/30' 
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="w-full h-16 bg-slate-950 flex items-center justify-center overflow-hidden relative">
                    {photo.fileUrl ? (
                      <img
                        src={photo.fileUrl}
                        alt={photo.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                      />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-slate-700" />
                    )}

                    {rec?.status === 'ok' && (
                      <div className="absolute top-1 right-1 bg-emerald-600 text-white rounded-full p-0.5 shadow">
                        <CheckCircle2 className="w-3 h-3" />
                      </div>
                    )}
                    {rec?.status === 'issue' && (
                      <div className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-0.5 shadow">
                        <AlertCircle className="w-3 h-3" />
                      </div>
                    )}
                  </div>

                  <div className="p-1.5 flex flex-col justify-between flex-1">
                    <div className="text-[10px] font-medium text-slate-200 line-clamp-1 leading-tight">
                      {photo.title}
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-slate-400 mt-1">
                      <span>{photo.category}</span>
                      <span>{photo.station || ''}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
