'use client';

import { useState, useRef, useCallback } from 'react';
import {
  downloadImagesAsZip,
  type BulkDownloadResult,
  type DownloadProgress,
} from '@/services/downloadService';
import { Image } from '@/types';

export function useBulkDownload() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  /**
   * 失敗が出たときだけ入る。成功時は ZIP が保存されることで結果が分かるので出さない。
   * これが無かったため、403/404 で落ちた写真があっても利用者には何も伝わらなかった（監査 F1）。
   */
  const [lastResult, setLastResult] = useState<BulkDownloadResult | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startDownload = useCallback(async (images: Image[], zipName: string) => {
    if (isDownloading) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsDownloading(true);
    setLastResult(null);
    setProgress({ current: 0, total: images.length, percentage: 0 });

    try {
      const result = await downloadImagesAsZip(images, zipName, setProgress, controller.signal);
      if (result.failedCount > 0) setLastResult(result);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Download failed:', err);
        // ZIP 自体が作れなかった。全部失敗として見せる。
        setLastResult({ savedCount: 0, failedCount: images.length });
        throw err;
      }
    } finally {
      setIsDownloading(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  }, [isDownloading]);

  const cancelDownload = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearResult = useCallback(() => setLastResult(null), []);

  return { isDownloading, progress, lastResult, startDownload, cancelDownload, clearResult };
}
