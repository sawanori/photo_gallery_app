'use client';

import { useState, useRef, useCallback } from 'react';
import { downloadImagesAsZip, DownloadProgress } from '@/services/downloadService';
import { Image } from '@/types';

export function useBulkDownload() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startDownload = useCallback(async (images: Image[], zipName: string) => {
    if (isDownloading) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsDownloading(true);
    setProgress({ current: 0, total: images.length, percentage: 0 });

    try {
      await downloadImagesAsZip(images, zipName, setProgress, controller.signal);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Download failed:', err);
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

  return { isDownloading, progress, startDownload, cancelDownload };
}
