'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * 「一度閉じたら二度と出さない」案内の表示状態。
 *
 * 素直に書くと `useEffect` の中で `localStorage` を読んで `setShow(true)` になるが、
 * これは effect 内の同期 setState（react-hooks/set-state-in-effect）で、
 * 描画→描画のカスケードを生む。
 *
 * かといって `useState` の遅延初期化に移すと、今度は**サーバー描画（常に非表示）と
 * クライアント初回描画（表示）が食い違ってハイドレーションが壊れる。**
 * `'use client'` でも Next.js は初期 HTML をサーバーで作るためである。
 *
 * `useSyncExternalStore` はハイドレーション時に `getServerSnapshot` を使って
 * サーバーの出力に合わせ、その直後に実際の値へ切り替える。この 2 つを同時に避けられる
 * 唯一の道具なので、`useIsNativeShell` と同じ方式に揃えてある。
 */

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** サーバーでは案内を出さない（＝閉じた後と同じ見た目）。 */
const getServerSnapshot = (): boolean => false;

export function useDismissibleGuide(
  storageKey: string,
  /** 端末や実行環境の条件。描画に影響するので必ずこのフック経由で評価する。 */
  isApplicable: () => boolean = () => true
): { show: boolean; dismiss: () => void } {
  const show = useSyncExternalStore(
    subscribe,
    () => isApplicable() && localStorage.getItem(storageKey) === null,
    getServerSnapshot
  );

  const dismiss = useCallback(() => {
    localStorage.setItem(storageKey, '1');
    notify();
  }, [storageKey]);

  return { show, dismiss };
}
