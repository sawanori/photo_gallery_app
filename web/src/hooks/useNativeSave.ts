'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  postToNative,
  subscribeToNative,
  supportsFeature,
  type NativeErrorCode,
} from '@/lib/nativeBridge';
import { useGallery } from '@/contexts/GalleryContext';
import { Image } from '@/types';

export interface NativeSaveProgress {
  current: number;
  total: number;
  percentage: number;
}

export interface NativeSaveResult {
  ok: boolean;
  savedCount: number;
  failedCount: number;
  errorCode?: NativeErrorCode;
  requiredBytes?: number;
}

interface UseNativeSaveResult {
  isSaving: boolean;
  progress: NativeSaveProgress | null;
  lastResult: NativeSaveResult | null;
  /** 1枚保存する。ネイティブが未対応なら false を返す（呼び出し側がブラウザ挙動へ戻す）。 */
  saveOne: (image: Image) => boolean;
  /** 複数枚保存する。ネイティブが未対応なら false。 */
  saveMany: (images: Image[]) => boolean;
  cancel: () => void;
  clearResult: () => void;
}

/**
 * 進捗も結果も届かないまま保存が固まったと見なすまでの時間。
 *
 * ネイティブ側が nonce 不一致でメッセージを捨てた場合や、アプリが落ちた場合、
 * web には何も返ってこない。それでも `isSaving` を立てたままなので、
 * ボタンは disabled、モーダルは 0/N のまま**永遠に終わらない**（監査 F3）。
 * 保存は 1 枚ずつ進捗が来る作りなので、60 秒何も来なければ異常と判断してよい。
 */
const WATCHDOG_MS = 60_000;

export function useNativeSave(): UseNativeSaveResult {
  // 招待トークンはマニフェスト API の認証に使う。native には URL を渡さない。
  const { invitation } = useGallery();
  const token = invitation?.token ?? null;
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState<NativeSaveProgress | null>(null);
  const [lastResult, setLastResult] = useState<NativeSaveResult | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const totalRef = useRef(0);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  /** 何か届くたびに張り直す。届かないまま時間が過ぎたら失敗として畳む。 */
  const armWatchdog = useCallback(() => {
    clearWatchdog();
    watchdogRef.current = window.setTimeout(() => {
      watchdogRef.current = null;
      requestIdRef.current = null;
      setIsSaving(false);
      setProgress(null);
      setLastResult({
        ok: false,
        savedCount: 0,
        failedCount: totalRef.current,
        errorCode: 'save_failed',
      });
    }, WATCHDOG_MS);
  }, [clearWatchdog]);

  useEffect(() => {
    return subscribeToNative((event) => {
      // 自分が出したリクエスト以外は無視する
      if (event.requestId !== requestIdRef.current) return;

      if (event.type === 'saveProgress') {
        armWatchdog();
        setProgress({
          current: event.current,
          total: event.total,
          percentage:
            event.total > 0 ? Math.round((event.current / event.total) * 100) : 0,
        });
        return;
      }

      clearWatchdog();
      setLastResult({
        ok: event.ok,
        savedCount: event.savedCount,
        failedCount: event.failedCount,
        errorCode: event.errorCode,
        requiredBytes: event.requiredBytes,
      });
      setIsSaving(false);
      setProgress(null);
      requestIdRef.current = null;
    });
  }, [armWatchdog, clearWatchdog]);

  // アンマウント時に監視タイマーを残さない
  useEffect(() => clearWatchdog, [clearWatchdog]);

  const begin = useCallback(
    (total: number): string => {
      const requestId = newRequestId();
      requestIdRef.current = requestId;
      totalRef.current = total;
      setLastResult(null);
      setIsSaving(true);
      setProgress({ current: 0, total, percentage: 0 });
      armWatchdog();
      return requestId;
    },
    [armWatchdog]
  );

  const abort = useCallback(() => {
    clearWatchdog();
    requestIdRef.current = null;
    setIsSaving(false);
    setProgress(null);
  }, [clearWatchdog]);

  const saveOne = useCallback(
    (image: Image): boolean => {
      if (!token) return false;
      if (!supportsFeature('saveImage')) return false;
      const requestId = begin(1);
      const sent = postToNative({
        type: 'saveImage',
        requestId,
        token,
        imageId: image.id,
      });
      if (!sent) abort();
      return sent;
    },
    [token, begin, abort]
  );

  const saveMany = useCallback(
    (images: Image[]): boolean => {
      if (!token) return false;
      if (images.length === 0) return false;
      if (!supportsFeature('saveImages')) return false;
      const requestId = begin(images.length);
      const sent = postToNative({
        type: 'saveImages',
        requestId,
        token,
        imageIds: images.map((image) => image.id),
      });
      if (!sent) abort();
      return sent;
    },
    [token, begin, abort]
  );

  const cancel = useCallback(() => {
    const requestId = requestIdRef.current;
    if (!requestId) return;
    postToNative({ type: 'cancelSave', requestId });
  }, []);

  const clearResult = useCallback(() => setLastResult(null), []);

  return { isSaving, progress, lastResult, saveOne, saveMany, cancel, clearResult };
}

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}
