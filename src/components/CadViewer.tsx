import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Layers,
  Compass,
  RotateCw,
  AlertTriangle
} from 'lucide-react';
import { parseP21Text, parseSfcBuffer, type CadDrawing } from '../utils/sxfParser';

interface CadViewerProps {
  fileUrl?: string;
  fileName: string;
  title: string;
  scale?: string;
}

// 解析済み図面データのインメモリキャッシュ（再表示を瞬時に行うため）
const drawingCache = new Map<string, CadDrawing>();

export const CadViewer: React.FC<CadViewerProps> = ({
  fileUrl,
  fileName,
  title,
  scale: drawingScale,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [drawing, setDrawing] = useState<CadDrawing | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // パン・ズーム変換パラメータ
  const [transform, setTransform] = useState<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });
  const [invertY, setInvertY] = useState<boolean>(true); // CAD標準の数学座標系(Y上向き)
  const [showLayerMenu, setShowLayerMenu] = useState<boolean>(false);
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());

  // ドラッグ操作の状態
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // 1. ファイルのフェッチとパース
  useEffect(() => {
    let isCancelled = false;

    const loadCad = async () => {
      if (!fileUrl) {
        setIsLoading(false);
        setErrorMsg('図面ファイルのURLが指定されていません');
        return;
      }

      // キャッシュ確認
      const cacheKey = `${fileUrl}_${fileName}`;
      if (drawingCache.has(cacheKey)) {
        const cached = drawingCache.get(cacheKey)!;
        setDrawing(cached);
        setIsLoading(false);
        resetViewToBounds(cached.bounds);
        return;
      }

      setIsLoading(true);
      setErrorMsg(null);

      try {
        const isSfc = /\.sfc$/i.test(fileName);
        const resp = await fetch(fileUrl);
        if (!resp.ok) {
          throw new Error(`ファイルの読み込みに失敗しました (${resp.status} ${resp.statusText})`);
        }

        let parsed: CadDrawing;
        if (isSfc) {
          const buffer = await resp.arrayBuffer();
          if (isCancelled) return;
          parsed = await parseSfcBuffer(buffer, fileName);
        } else {
          // P21 またはテキスト
          const buffer = await resp.arrayBuffer();
          if (isCancelled) return;

          // 日本語文字化け防止のため Shift_JIS でデコードを試行
          let text = '';
          try {
            text = new TextDecoder('shift-jis').decode(buffer);
          } catch {
            text = new TextDecoder('utf-8').decode(buffer);
          }
          parsed = parseP21Text(text, fileName);
        }

        if (isCancelled) return;
        drawingCache.set(cacheKey, parsed);
        setDrawing(parsed);
        resetViewToBounds(parsed.bounds);
      } catch (err: unknown) {
        if (isCancelled) return;
        console.error('CAD解析エラー:', err);
        setErrorMsg(err instanceof Error ? err.message : 'CADデータの解析に失敗しました');
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadCad();

    return () => {
      isCancelled = true;
    };
  }, [fileUrl, fileName]);

  // 2. 図面全体をキャンバス中央に収める（フィット計算）
  const resetViewToBounds = useCallback((bounds: CadDrawing['bounds']) => {
    if (!containerRef.current) return;
    const { clientWidth: cw, clientHeight: ch } = containerRef.current;
    if (cw === 0 || ch === 0) return;

    const padding = 40;
    const availW = Math.max(10, cw - padding * 2);
    const availH = Math.max(10, ch - padding * 2);

    const scaleX = availW / bounds.width;
    const scaleY = availH / bounds.height;
    const k = Math.min(scaleX, scaleY, 5.0); // 最大5倍までに制限

    // 中央位置
    const centerX = bounds.minX + bounds.width / 2;
    const centerY = bounds.minY + bounds.height / 2;

    const x = cw / 2 - centerX * k;
    const y = ch / 2 - (invertY ? -centerY * k : centerY * k);

    setTransform({ x, y, k });
  }, [invertY]);

  // 全体表示ボタンハンドラ
  const handleFitAll = () => {
    if (drawing) {
      resetViewToBounds(drawing.bounds);
    }
  };

  // 3. Canvas への描画処理
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current || !drawing) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;

    // Retina対応
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // 背景のクリア (CADダークテーマ)
    ctx.fillStyle = '#090d16'; // 深いCADダークネイビー
    ctx.fillRect(0, 0, cw, ch);

    // 変換の適用 (パン & ズーム)
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, invertY ? -transform.k : transform.k);

    // 図面要素のレンダリング
    ctx.lineWidth = Math.max(0.5, 1.2 / transform.k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const ent of drawing.entities) {
      if (ent.layer && hiddenLayers.has(ent.layer)) continue;

      ctx.strokeStyle = ent.color || '#38bdf8';
      ctx.fillStyle = ent.color || '#38bdf8';

      if (ent.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(ent.p1.x, ent.p1.y);
        ctx.lineTo(ent.p2.x, ent.p2.y);
        ctx.stroke();
      } else if (ent.type === 'polyline') {
        if (ent.points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(ent.points[0].x, ent.points[0].y);
        for (let i = 1; i < ent.points.length; i++) {
          ctx.lineTo(ent.points[i].x, ent.points[i].y);
        }
        if (ent.closed) ctx.closePath();
        ctx.stroke();
      } else if (ent.type === 'circle') {
        ctx.beginPath();
        ctx.arc(ent.center.x, ent.center.y, ent.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (ent.type === 'text') {
        ctx.save();
        ctx.translate(ent.position.x, ent.position.y);
        // 文字列の上下反転を元に戻す
        if (invertY) ctx.scale(1, -1);
        const fontSize = Math.max(3, ent.height);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillText(ent.text, 0, 0);
        ctx.restore();
      }
    }

    ctx.restore();
  }, [drawing, transform, invertY, hiddenLayers]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // ウィンドウリサイズ監視
  useEffect(() => {
    const handleResize = () => {
      renderCanvas();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCanvas]);

  // 4. マウス操作（パン & ズーム）
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return; // 左クリックまたは中クリック
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    dragStartRef.current = { x: e.clientX, y: e.clientY };

    setTransform(prev => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy,
    }));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // ホイールによるマウスカーソル中心ズーム
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const currentK = transformRef.current.k;
    const newK = Math.min(Math.max(currentK * zoomFactor, 0.005), 100);

    // マウス位置を中心にスケーリング
    const newX = mouseX - (mouseX - transformRef.current.x) * (newK / currentK);
    const newY = mouseY - (mouseY - transformRef.current.y) * (newK / currentK);

    setTransform({ x: newX, y: newY, k: newK });
  };

  // ズームボタン
  const handleZoom = (factor: number) => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const mouseX = cw / 2;
    const mouseY = ch / 2;

    const currentK = transform.k;
    const newK = Math.min(Math.max(currentK * factor, 0.005), 100);
    const newX = mouseX - (mouseX - transform.x) * (newK / currentK);
    const newY = mouseY - (mouseY - transform.y) * (newK / currentK);

    setTransform({ x: newX, y: newY, k: newK });
  };

  // レイヤートグル
  const toggleLayer = (layerName: string) => {
    setHiddenLayers(prev => {
      const next = new Set(prev);
      if (next.has(layerName)) next.delete(layerName);
      else next.add(layerName);
      return next;
    });
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      className="relative w-full h-full flex flex-col overflow-hidden bg-slate-950 select-none cursor-grab active:cursor-grabbing"
    >
      {/* CADキャンバス本体 */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* 上部オーバーレイ：図面情報 & ツールバー */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
        {/* 左側: 図面名称・縮尺・形式バッジ */}
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-3 py-1.5 rounded-xl shadow-lg flex items-center gap-2 pointer-events-auto">
          <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
            <Compass className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white truncate max-w-[240px] sm:max-w-md">
                {title}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-blue-900/60 text-blue-300 border border-blue-500/40 rounded shrink-0">
                {drawing?.format || (/\.sfc$/i.test(fileName) ? 'SFC' : 'P21')}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-2">
              <span>{fileName}</span>
              {drawingScale && <span className="text-slate-500 font-mono">縮尺: {drawingScale}</span>}
              {drawing && (
                <span className="text-slate-500 hidden sm:inline">
                  (要素数: {drawing.entities.length.toLocaleString()})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 右側: ビュー操作ツールバー */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 p-1 rounded-xl shadow-lg pointer-events-auto">
          {/* レイヤー切替 */}
          {drawing && drawing.layers.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowLayerMenu(!showLayerMenu)}
                className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition ${
                  showLayerMenu
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                title="レイヤー表示切替"
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden md:inline text-[11px]">画層</span>
              </button>

              {showLayerMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 text-xs max-h-60 overflow-y-auto">
                  <div className="font-bold text-[11px] text-slate-400 mb-1 px-1">レイヤー表示/非表示</div>
                  {drawing.layers.map(layer => {
                    const isVisible = !hiddenLayers.has(layer);
                    return (
                      <label
                        key={layer}
                        className="flex items-center gap-2 p-1.5 hover:bg-slate-800 rounded cursor-pointer text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() => toggleLayer(layer)}
                          className="rounded border-slate-700 text-blue-600 focus:ring-0"
                        />
                        <span className="truncate text-[11px]">{layer}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Y軸反転トグル */}
          <button
            onClick={() => setInvertY(!invertY)}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
            title={invertY ? 'Y軸反転: 有効 (CAD標準)' : 'Y軸反転: 無効'}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />

          {/* ズームアウト */}
          <button
            onClick={() => handleZoom(0.8)}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
            title="縮小"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          {/* ズームイン */}
          <button
            onClick={() => handleZoom(1.25)}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
            title="拡大"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* 全体表示 */}
          <button
            onClick={handleFitAll}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
            title="全体表示 (リセット)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {fileUrl && (
            <>
              <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />
              {/* ダウンロード */}
              <a
                href={fileUrl}
                download={fileName}
                className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1 text-[11px] font-semibold"
                title="CADファイルをダウンロード"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CAD保存</span>
              </a>
            </>
          )}
        </div>
      </div>

      {/* ローディング表示 */}
      {isLoading && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
            <Compass className="w-5 h-5 text-blue-400 absolute inset-0 m-auto animate-pulse" />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-white">SXF (CAD) 図面をベクター解析中...</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{fileName} ({drawingScale || '縮尺解析中'})</p>
          </div>
        </div>
      )}

      {/* エラー表示 */}
      {errorMsg && !isLoading && (
        <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center p-6 text-center z-20">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-white mb-1">CAD図面のプレビューに失敗しました</h4>
          <p className="text-xs text-rose-300 max-w-md mb-4">{errorMsg}</p>
          {fileUrl && (
            <a
              href={fileUrl}
              download={fileName}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition"
            >
              <Download className="w-4 h-4" />
              <span>CADファイルをダウンロードして閲覧</span>
            </a>
          )}
        </div>
      )}

      {/* 下部ステータスバー：操作ヘルプ */}
      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] text-slate-500 pointer-events-none">
        <span>※マウスホイール: 拡大縮小 / ドラッグ: 自由スクロール</span>
        <span className="font-mono">{Math.round(transform.k * 100)}%</span>
      </div>
    </div>
  );
};
