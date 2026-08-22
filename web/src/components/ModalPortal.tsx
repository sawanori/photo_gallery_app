'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

/**
 * モーダルを `document.body` 直下に描画する。
 *
 * `Header` は `backdrop-blur-md`（= `backdrop-filter`）を持つ。
 * `backdrop-filter` が付いた要素は、その子孫の `position: fixed` に対する
 * **包含ブロックになる**。そのためヘッダー内から描画したモーダルは、
 * 画面全体ではなくヘッダーの高さ（64px）を基準に配置され、内容が切れる。
 *
 * Android の WebView で実際にこの症状を確認した（進捗モーダルのタイトルと
 * 件数表示が画面外に出て見えなくなる）。ブラウザでも同じ条件で起きる。
 *
 * ポータルで body 直下に出すことで、包含ブロックを画面に戻す。
 */

/** サーバー描画時とハイドレーション時は false、クライアントでは true を返す。 */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export default function ModalPortal({ children }: { children: React.ReactNode }) {
  // useState + useEffect ではなく useSyncExternalStore を使う。
  // 効果内での setState を避けつつ、SSR とクライアントの食い違いも起きない。
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
