import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface SubWindowPortalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  height?: number;
}

/**
 * React コンポーネントをブラウザの別ウィンドウ (window.open) に描画するポータル
 * 親ウィンドウと同一メモリ・Blob URL・Reactステートを完全に共有
 */
export const SubWindowPortal: React.FC<SubWindowPortalProps> = ({
  title,
  onClose,
  children,
  width = 1200,
  height = 800,
}) => {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const externalWindowRef = useRef<Window | null>(null);
  const onCloseRef = useRef(onClose);

  // onCloseが更新されても最新の関数を参照できるように保持
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // ウィンドウのタイトル更新（ウィンドウ再生成は行わない）
  useEffect(() => {
    if (externalWindowRef.current && !externalWindowRef.current.closed) {
      externalWindowRef.current.document.title = title;
    }
  }, [title]);

  // ウィンドウの初期化（コンポーネントのマウント時に1度だけ実行）
  useEffect(() => {
    // 画面中央または少しずらした位置にウィンドウを配置
    const left = Math.max(0, (window.screenLeft ?? window.screenX) + 60);
    const top = Math.max(0, (window.screenTop ?? window.screenY) + 40);
    const windowFeatures = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`;

    const subWindow = window.open('', '', windowFeatures);

    if (!subWindow) {
      alert('ポップアップウィンドウがブラウザにブロックされました。\nブラウザの設定でポップアップを「許可」してください。');
      onCloseRef.current();
      return;
    }

    externalWindowRef.current = subWindow;
    subWindow.document.title = title;

    // 親ウィンドウのスタイル（Tailwind / インラインstyle / link）をすべて複製
    document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => {
      subWindow.document.head.appendChild(node.cloneNode(true));
    });

    // 基本スタイル設定
    subWindow.document.body.className = 'w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans m-0 p-0 select-text';

    const container = subWindow.document.createElement('div');
    container.className = 'w-full h-full flex flex-col overflow-hidden';
    subWindow.document.body.appendChild(container);
    setContainerEl(container);

    // サブウィンドウが閉じられた際のクリーンアップ
    const handleUnload = () => {
      onCloseRef.current();
    };
    subWindow.addEventListener('beforeunload', handleUnload);

    return () => {
      subWindow.removeEventListener('beforeunload', handleUnload);
      if (!subWindow.closed) {
        subWindow.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!containerEl) return null;

  return createPortal(children, containerEl);
};
