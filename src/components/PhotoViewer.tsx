import React, { useState, useMemo } from 'react';
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
  FileCheck 
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

  // 検査ステータス更新
  const handleSetStatus = (status: 'ok' | 'issue') => {
    if (!currentPhoto) return;
    onUpdateInspection({
      targetId: currentPhoto.id,
      targetType: 'photo',
      targetTitle: currentPhoto.title,
      status: currentRecord?.status === status ? 'pending' : status,
      notes: currentRecord?.notes || '',
      updatedAt: new Date().toLocaleString('ja-JP'),
    });
  };

  const handleUpdateNotes = (notes: string) => {
    if (!currentPhoto) return;
    onUpdateInspection({
      targetId: currentPhoto.id,
      targetType: 'photo',
      targetTitle: currentPhoto.title,
      status: currentRecord?.status || 'issue',
      notes,
      updatedAt: new Date().toLocaleString('ja-JP'),
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 text-slate-100 overflow-hidden">
      {/* フィルターヘッダー */}
      <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          {/* 写真区分タブ */}
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
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
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
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
        </div>
      </div>

      {/* メインエリア: 上部プレビュー + 下部サムネイルリスト */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 写真プレビュー ＆ 電子黒板情報（分割配置） */}
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

            {/* ズームコントローラー（画像右上にオーバーレイ） */}
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
            <div className="w-full lg:w-72 bg-slate-900/90 border-t lg:border-t-0 lg:border-l border-slate-800 p-3 flex flex-col shrink-0 overflow-y-auto max-h-48 lg:max-h-full">
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
                onClick={() => handleSetStatus('ok')}
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
                onClick={() => handleSetStatus('issue')}
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
                onChange={(e) => handleUpdateNotes(e.target.value)}
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
                {/* サムネイル画像 */}
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

                  {/* ステータスバッジ */}
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

                {/* キャプション */}
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
    </div>
  );
};
