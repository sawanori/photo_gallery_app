'use client';

import { useEffect } from 'react';
import { DownloadProgress } from '@/services/downloadService';
import ModalPortal from './ModalPortal';

interface DownloadProgressModalProps {
  progress: DownloadProgress;
  onCancel: () => void;
  /**
   * 'zip'  … ブラウザで ZIP を生成中（既定。既存の呼び出しはこのまま）
   * 'save' … ネイティブでフォトライブラリへ保存中
   */
  mode?: 'zip' | 'save';
}

export default function DownloadProgressModal({
  progress,
  onCancel,
  mode = 'zip',
}: DownloadProgressModalProps) {
  const isSaveMode = mode === 'save';
  const title = isSaveMode ? '写真に保存中...' : 'ダウンロード中...';

  // モーダル表示中は背後のスクロールを止める。
  // Android の WebView では、ページがスクロールされた状態で position:fixed の
  // 要素を出すと表示位置がずれ、上端（タイトルと件数）が画面外に切れることがある。
  // 実機で実際にこの症状が出たため、スクロールを固定して発生条件をなくす。
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div
        className="bg-bg rounded-2xl p-6 w-80 max-w-full max-h-full overflow-y-auto shadow-[0_8px_30px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] border border-border"
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-progress-title"
      >
        <h3 id="download-progress-title" className="text-lg font-medium text-ink mb-4">
          {title}
        </h3>

        <div className="mb-3">
          <div
            className="flex justify-between text-sm text-muted mb-1"
            role="status"
            aria-live="polite"
          >
            <span>
              {progress.current} / {progress.total}
            </span>
            <span>{progress.percentage}%</span>
          </div>
          <div className="w-full bg-surface rounded-full h-2">
            <div
              className="bg-ink h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>

        {isSaveMode && (
          <p className="text-xs text-muted leading-relaxed mb-2">
            保存が終わるまでアプリを閉じないでください。ほかの画面に移ると保存が中断されることがあります。
          </p>
        )}

        <button
          onClick={onCancel}
          className="w-full mt-2 px-4 py-2 text-sm text-muted hover:text-ink border border-border rounded-lg hover:bg-surface transition-colors duration-200 cursor-pointer"
        >
          キャンセル
        </button>
      </div>
      </div>
    </ModalPortal>
  );
}
