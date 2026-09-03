'use client';

import { useEffect, useRef } from 'react';
import type { BulkDownloadResult } from '@/services/downloadService';
import ModalPortal from './ModalPortal';

interface Props {
  result: BulkDownloadResult;
  onClose: () => void;
}

/**
 * 一括 ZIP で取得できなかった写真があったことを伝える。
 *
 * これが無かったときは、403/404 になった写真は黙って ZIP から抜けるか、
 * XML のエラー本文が `.jpg` として混入していた。どちらも利用者には
 * 「なぜか枚数が足りない」としか見えない（監査 F1）。
 *
 * 見た目はネイティブ保存の通知（NativeSaveNotice）に合わせてある。
 */
export default function BulkDownloadNotice({ result, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // モーダル表示中はフォーカスを閉じ込め、閉じたら発火元へ戻す
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [onClose]);

  const body =
    result.savedCount > 0
      ? `${result.savedCount}枚は ZIP に入りましたが、${result.failedCount}枚は取得できませんでした。通信状況を確認して、もう一度お試しください。`
      : '写真を取得できませんでした。通信状況を確認して、もう一度お試しください。';

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bulk-download-notice-title"
      >
        <div className="mx-4 w-full max-w-sm rounded-2xl bg-bg p-6 border border-border shadow-[0_16px_48px_rgba(0,0,0,0.12)]">
          <h3 id="bulk-download-notice-title" className="text-base font-medium text-ink">
            {result.failedCount}枚をダウンロードできませんでした
          </h3>
          <p className="mt-2 text-sm text-muted leading-relaxed">{body}</p>

          <div className="mt-5 flex gap-2">
            <button
              ref={closeRef}
              onClick={onClose}
              className="flex-1 rounded-xl border border-border text-ink text-sm font-medium py-2.5 cursor-pointer transition-colors duration-200 hover:bg-surface"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
