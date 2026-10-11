import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GripVertical } from 'lucide-react';

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  viewMode: 'split' | 'doc-only' | 'photo-only';
  defaultLeftRatio?: number; // 0.0 - 1.0 (例: 0.5)
}

export const SplitPane: React.FC<SplitPaneProps> = ({
  left,
  right,
  viewMode,
  defaultLeftRatio = 0.5,
}) => {
  const [ratio, setRatio] = useState(defaultLeftRatio);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // マウス/タッチドラッグハンドラ
  const handleStartDrag = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newRatio = (clientX - rect.left) / rect.width;
    // 最小20%, 最大80%にクランプ
    const clampedRatio = Math.max(0.2, Math.min(0.8, newRatio));
    setRatio(clampedRatio);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX);
      }
    };

    const onEndDrag = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEndDrag);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onEndDrag);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEndDrag);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEndDrag);
    };
  }, [isDragging, handleMove]);

  // 全画面モード時
  if (viewMode === 'doc-only') {
    return (
      <div className="flex-1 flex overflow-hidden w-full h-full">
        {left}
      </div>
    );
  }

  if (viewMode === 'photo-only') {
    return (
      <div className="flex-1 flex overflow-hidden w-full h-full">
        {right}
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className="flex-1 flex overflow-hidden w-full h-full relative select-none"
    >
      {/* 左ペイン: 書類・図面 */}
      <div 
        style={{ width: `${ratio * 100}%` }} 
        className="h-full overflow-hidden flex flex-col shrink-0"
      >
        {left}
      </div>

      {/* スプリッター境界バー */}
      <div
        onMouseDown={handleStartDrag}
        onTouchStart={handleStartDrag}
        onDoubleClick={() => setRatio(0.5)}
        title="ドラッグで左右幅を調整（ダブルクリックで50:50に戻す）"
        className={`w-2.5 h-full bg-slate-900 border-x border-slate-700/80 cursor-col-resize flex items-center justify-center shrink-0 transition-colors z-10 ${
          isDragging ? 'bg-blue-600 border-blue-500' : 'hover:bg-slate-800'
        }`}
      >
        <GripVertical className={`w-3.5 h-3.5 ${isDragging ? 'text-white' : 'text-slate-500'}`} />
      </div>

      {/* 右ペイン: 工事写真 */}
      <div 
        style={{ width: `${(1 - ratio) * 100}%` }} 
        className="h-full overflow-hidden flex flex-col shrink-0"
      >
        {right}
      </div>

      {/* ドラッグ中の透明オーバーレイ（iframeからのマウス奪取防止） */}
      {isDragging && (
        <div className="absolute inset-0 z-50 cursor-col-resize pointer-events-auto bg-transparent" />
      )}
    </div>
  );
};
