import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Layers,
  Compass,
  RotateCw,
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Search,
  PanelRightClose,
  PanelRightOpen,
  Info
} from 'lucide-react';
import { parseP21Text, parseSfcBuffer, type CadDrawing } from '../utils/sxfParser';

interface CadViewerProps {
  fileUrl?: string;
  fileName: string;
  title: string;
  scale?: string;
}

// 解析済み図面データのインメモリキャッシュ
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
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());

  // 右側パネルの開閉とアクティブタブ
  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(true);
  const [sidePanelTab, setSidePanelTab] = useState<'texts' | 'layers'>('texts');
  const [textSearchQuery, setTextSearchQuery] = useState<string>('');

  // ドラッグ操作の状態
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // 1. 図面全体をキャンバス中央に収める（フィット計算）
  const resetViewToBounds = useCallback((bounds: CadDrawing['bounds']) => {
    if (!containerRef.current) return;
    const { clientWidth: cw, clientHeight: ch } = containerRef.current;
    if (cw === 0 || ch === 0) return;

    const padding = 40;
    const availW = Math.max(10, cw - padding * 2);
    const availH = Math.max(10, ch - padding * 2);

    const scaleX = availW / bounds.width;
    const scaleY = availH / bounds.height;
    const k = Math.min(scaleX, scaleY, 10.0);

    const centerX = bounds.minX + bounds.width / 2;
    const centerY = bounds.minY + bounds.height / 2;

    const x = cw / 2 - centerX * k;
    const y = ch / 2 - (invertY ? -centerY * k : centerY * k);

    setTransform({ x, y, k });
  }, [invertY]);

  // 2. ファイルのフェッチとパース
  useEffect(() => {
    let isCancelled = false;

    const loadCad = async () => {
      if (!fileUrl) {
        setIsLoading(false);
        setErrorMsg('図面ファイルのURLが指定されていません');
        return;
      }

      const cacheKey = `${fileUrl}_${fileName}_v20261017_complex_decomp_v4`;
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
          const buffer = await resp.arrayBuffer();
          if (isCancelled) return;

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
  }, [fileUrl, fileName, resetViewToBounds]);

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

    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // 背景 (深いCADダークネイビー)
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, cw, ch);

    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, invertY ? -transform.k : transform.k);

    ctx.lineWidth = Math.max(0.5, 1.2 / transform.k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const ent of drawing.entities) {
      if (ent.layer && hiddenLayers.has(ent.layer)) continue;

      ctx.strokeStyle = ent.color || '#38bdf8';
      ctx.fillStyle = ent.color || '#38bdf8';

      // 線分
      if (ent.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(ent.p1.x, ent.p1.y);
        ctx.lineTo(ent.p2.x, ent.p2.y);
        ctx.stroke();
      }
      // ポリライン
      else if (ent.type === 'polyline') {
        if (ent.points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(ent.points[0].x, ent.points[0].y);
        for (let i = 1; i < ent.points.length; i++) {
          ctx.lineTo(ent.points[i].x, ent.points[i].y);
        }
        if (ent.closed) ctx.closePath();
        ctx.stroke();
      }
      // 円・円弧
      else if (ent.type === 'circle') {
        ctx.beginPath();
        if (ent.isArc && ent.startAngle !== undefined && ent.endAngle !== undefined) {
          const ccw = invertY ? !ent.clockwise : !!ent.clockwise;
          ctx.arc(ent.center.x, ent.center.y, ent.radius, ent.startAngle, ent.endAngle, ccw);
        } else {
          ctx.arc(ent.center.x, ent.center.y, ent.radius, 0, Math.PI * 2);
        }
        ctx.stroke();
      }
      // 文字・寸法値
      else if (ent.type === 'text') {
        ctx.save();
        ctx.translate(ent.position.x, ent.position.y);

        if (ent.angle) {
          ctx.rotate(invertY ? -ent.angle : ent.angle);
        }

        if (invertY) {
          ctx.scale(1, -1);
        }

        const rawHeight = ent.height || 4.0;
        const screenPx = rawHeight * transform.k;
        const renderHeight = screenPx < 7 ? 7 / transform.k : rawHeight;

        ctx.font = `${renderHeight}px "Yu Gothic", "Meiryo", sans-serif`;
        ctx.textAlign = ent.align || 'left';
        ctx.textBaseline = ent.baseline || (invertY ? 'top' : 'bottom');
        ctx.fillStyle = ent.color || '#f8fafc';

        // 描画テキストの安全サニタイズ（制御文字の混入を絶対防止）
        const displayText = ent.text
          .replace(/\${3}[a-zA-Z0-9_\-\s]+/gi, '')
          .replace(/＄{3}[a-zA-Z0-9_\-\s]+/gi, '')
          .replace(/^sxf_[a-zA-Z0-9_\-\s]+/gi, '')
          .trim();

        if (displayText) {
          ctx.fillText(displayText, 0, 0);
        }

        ctx.restore();
      }
    }

    ctx.restore();
  }, [drawing, transform, invertY, hiddenLayers]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  useEffect(() => {
    const handleResize = () => {
      renderCanvas();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCanvas]);

  // マウスドラッグ（パン）
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
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

  // ホイールズーム
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const currentK = transformRef.current.k;
    const newK = Math.min(Math.max(currentK * zoomFactor, 0.001), 100);

    const newX = mouseX - (mouseX - transformRef.current.x) * (newK / currentK);
    const newY = mouseY - (mouseY - transformRef.current.y) * (newK / currentK);

    setTransform({ x: newX, y: newY, k: newK });
  };

  const handleZoom = (factor: number) => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const mouseX = cw / 2;
    const mouseY = ch / 2;

    const currentK = transform.k;
    const newK = Math.min(Math.max(currentK * factor, 0.001), 100);
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

  const handleShowAllLayers = () => setHiddenLayers(new Set());
  const handleHideAllLayers = () => {
    if (!drawing) return;
    setHiddenLayers(new Set(drawing.layers.map(l => l.name)));
  };

  // テキスト検索フィルタリング（制御コード・ノイズを確実に排除）
  const filteredTexts = useMemo(() => {
    if (!drawing) return [];
    const validTexts = drawing.textSummary.filter(t => {
      const clean = t.trim();
      return clean.length > 0 && !clean.includes('$$$') && !clean.includes('＄＄＄') && !/^sxf_/i.test(clean);
    });
    if (!textSearchQuery.trim()) return validTexts;
    const q = textSearchQuery.toLowerCase();
    return validTexts.filter(t => t.toLowerCase().includes(q));
  }, [drawing, textSearchQuery]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-slate-950 text-slate-100 select-none">
      {/* 画面上部ヘッダーバー */}
      <div className="p-2.5 bg-slate-950/95 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0 select-none shadow">
        {/* 左側: 図面基本情報バッジ */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-white truncate max-w-[200px] sm:max-w-md">
                {title}
              </h3>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-blue-900/60 text-blue-300 border border-blue-500/40 rounded shrink-0">
                {drawing?.format || (/\.sfc$/i.test(fileName) ? 'SFC' : 'P21')}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2">
              <span>{fileName}</span>
              {drawingScale && <span className="text-slate-500 font-mono">（縮尺: {drawingScale}）</span>}
            </div>
          </div>
        </div>

        {/* 右側: ツールボタン群 */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 正規CADソフトで開くボタン */}
          {fileUrl && (
            <a
              href={fileUrl}
              download={fileName}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition active:scale-95"
              title="CADソフト（JACIC SXFブラウザ、武蔵、AutoCAD等）で開く"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">正規CADで精密閲覧</span>
              <ExternalLink className="w-3 h-3 opacity-70 hidden sm:inline" />
            </a>
          )}

          {/* 右側情報パネルの開閉トグル */}
          <button
            onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
            className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition ${
              isSidePanelOpen
                ? 'bg-slate-800 border-slate-700 text-blue-400'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title={isSidePanelOpen ? '図面情報パネルを閉じる' : '図面情報パネルを開く'}
          >
            {isSidePanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            <span className="hidden md:inline text-[11px]">図面諸元・テキスト</span>
          </button>
        </div>
      </div>

      {/* メインペイン：左側Canvas ＋ 右側情報カードパネル */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 左側：CAD Canvas 描画エリア */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="flex-1 h-full relative overflow-hidden bg-slate-950 cursor-grab active:cursor-grabbing"
        >
          {/* Canvas本体 */}
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

          {/* Canvas上のフローティング操作バー（ズーム・リセット） */}
          <div className="absolute top-3 left-3 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 p-1 rounded-xl shadow-lg pointer-events-auto z-10">
            <button
              onClick={() => setInvertY(!invertY)}
              className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
              title={invertY ? 'Y軸反転: 有効 (CAD標準)' : 'Y軸反転: 無効'}
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />
            <button
              onClick={() => handleZoom(0.8)}
              className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
              title="縮小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleZoom(1.25)}
              className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
              title="拡大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleFitAll}
              className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
              title="全体表示 (リセット)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 下部操作案内 */}
          <div className="absolute bottom-2 left-3 text-[10px] text-slate-500 pointer-events-none z-10 flex items-center gap-3">
            <span>※マウスホイール: 拡大縮小 / ドラッグ: 移動</span>
            <span className="font-mono">{Math.round(transform.k * 100)}%</span>
          </div>

          {/* ローディング */}
          {isLoading && (
            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
                <Compass className="w-5 h-5 text-blue-400 absolute inset-0 m-auto animate-pulse" />
              </div>
              <p className="text-xs font-semibold text-white">SXF (CAD) 図面をベクター解析中...</p>
            </div>
          )}

          {/* エラー */}
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
        </div>

        {/* 右側：図面諸元・テキスト・寸法カードパネル */}
        {isSidePanelOpen && (
          <div className="w-80 sm:w-96 border-l border-slate-800 bg-slate-900/95 flex flex-col shrink-0 select-text">
            {/* タブ切り替え */}
            <div className="flex border-b border-slate-800 bg-slate-950/50 p-1 gap-1">
              <button
                onClick={() => setSidePanelTab('texts')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
                  sidePanelTab === 'texts'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>図面注記・寸法 ({filteredTexts.length})</span>
              </button>
              <button
                onClick={() => setSidePanelTab('layers')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
                  sidePanelTab === 'layers'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>画層 ({drawing?.layers.length || 0})</span>
              </button>
            </div>

            {/* パネルコンテンツ */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* 図面サマリー情報ミニカード */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-300 pb-1 border-b border-slate-800">
                  <Info className="w-3.5 h-3.5 text-blue-400" />
                  <span>図面設計諸元</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>図面名称:</span>
                  <span className="font-semibold text-slate-200 truncate ml-2">{title}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>縮尺:</span>
                  <span className="font-mono text-slate-200">{drawingScale || 'ー'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>図面形式:</span>
                  <span className="font-mono text-slate-200">{drawing?.format || 'SXF'} (ISO 10303-21)</span>
                </div>
                {drawing && (
                  <div className="flex justify-between text-slate-400">
                    <span>描画要素数:</span>
                    <span className="font-mono text-slate-200">{drawing.entities.length.toLocaleString()} 件</span>
                  </div>
                )}
              </div>

              {/* タブ1: 図面注記・テキスト・寸法一覧 */}
              {sidePanelTab === 'texts' && (
                <div className="space-y-2">
                  {/* 検索ボックス */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="図面内の文字・数値を検索..."
                      value={textSearchQuery}
                      onChange={(e) => setTextSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* テキストカードリスト */}
                  <div className="space-y-1.5">
                    {filteredTexts.length > 0 ? (
                      filteredTexts.map((txt, idx) => (
                        <div
                          key={idx}
                          className="p-2 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800/80 rounded-lg text-xs text-slate-200 transition flex items-start gap-2"
                        >
                          <span className="text-[10px] text-blue-400 font-mono shrink-0 mt-0.5">#{idx + 1}</span>
                          <span className="leading-snug break-all font-medium">{txt}</span>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-slate-500 text-xs">
                        該当する注記・文字が見つかりません
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* タブ2: 画層（レイヤー）一覧 */}
              {sidePanelTab === 'layers' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs text-slate-400">表示画層の選択</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleShowAllLayers}
                        className="px-1.5 py-0.5 hover:bg-slate-800 text-blue-400 text-[10px] rounded flex items-center gap-0.5"
                      >
                        <Eye className="w-3 h-3" />
                        <span>全表示</span>
                      </button>
                      <button
                        onClick={handleHideAllLayers}
                        className="px-1.5 py-0.5 hover:bg-slate-800 text-slate-400 text-[10px] rounded flex items-center gap-0.5"
                      >
                        <EyeOff className="w-3 h-3" />
                        <span>全解除</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {drawing?.layers.map(layer => {
                      const isVisible = !hiddenLayers.has(layer.name);
                      return (
                        <div
                          key={layer.name}
                          onClick={() => toggleLayer(layer.name)}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition select-none border ${
                            isVisible
                              ? 'bg-slate-950/80 border-slate-800 text-slate-200 hover:border-slate-700'
                              : 'bg-slate-950/30 border-transparent text-slate-500 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                              isVisible ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-700 bg-slate-900'
                            }`}>
                              {isVisible && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/40"
                              style={{ backgroundColor: layer.color }}
                            />
                            <span className="truncate text-xs">{layer.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.2 rounded-full shrink-0">
                            {layer.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* パネル下部：正規CADソフト案内 */}
            <div className="p-2.5 border-t border-slate-800 bg-slate-950/80 text-[11px] text-slate-400 space-y-1">
              <div className="font-semibold text-slate-300">💡 精密検査ワンポイント:</div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                本画面で図面外形や主要諸元を高速確認し、ミリ単位の施工寸法や細部構造は上部の「正規CADで精密閲覧」からJACIC SXFブラウザ等でご確認いただけます。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
