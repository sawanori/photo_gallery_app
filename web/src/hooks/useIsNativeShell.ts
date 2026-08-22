'use client';

import { useSyncExternalStore } from 'react';
import {
  detectNativeShell,
  subscribeToShellReady,
  type NativeCapabilities,
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
