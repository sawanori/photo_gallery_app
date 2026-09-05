'use client';

import { useSyncExternalStore } from 'react';
import {
  BRIDGE_VERSION,
  detectNativeShell,
  subscribeToShellReady,
  type NativeCapabilities,
  type NativeFeature,
} from '@/lib/nativeBridge';

/**
 * ネイティブシェル内かどうかを、hydration mismatch を起こさずに判定する。
 *
 * `'use client'` のページでも Next.js は初期 HTML をサーバーで生成する。
 * レンダリング中に detectNativeShell() を直接呼ぶと、サーバー（常に null）と
 * クライアント（ネイティブなら非 null）で出力が食い違い hydration エラーになる。
 *
 * useSyncExternalStore はハイドレーション時に getServerSnapshot を使って
 * サーバーの出力と一致させ、その直後に実際の値へ切り替える。
 * 描画に影響する分岐は必ずこのフック経由で行うこと。
 * 描画に影響しない分岐（onClick の中など）は detectNativeShell() を直接呼んでよい。
 */
const getServerSnapshot = (): NativeCapabilities | null => null;

export function useIsNativeShell(): {
  isNative: boolean;
  capabilities: NativeCapabilities | null;
} {
  const capabilities = useSyncExternalStore(
    subscribeToShellReady,
    detectNativeShell,
    getServerSnapshot
  );

  return { isNative: capabilities !== null, capabilities };
}

/**
 * ネイティブが指定の機能に対応しているかを、描画に使える形で返す。
 *
 * `supportsFeature` と同じ判定だが、こちらは上のストア経由なので
 * 描画中に呼んでも hydration mismatch にならない。**ボタンの出し分けには必ずこちらを使う。**
 *
 * web は push した瞬間に配信されるのに対し、アプリの更新は利用者が入れるまで届かない。
 * 新しい機能を無条件に出すと、古いアプリの利用者には押しても何も起きないボタンが見える。
 */
export function useSupportsNativeFeature(feature: NativeFeature): boolean {
  const { capabilities } = useIsNativeShell();
  if (!capabilities) return false;
  if (capabilities.bridgeVersion !== BRIDGE_VERSION) return false;
  return capabilities.supports.includes(feature);
}
