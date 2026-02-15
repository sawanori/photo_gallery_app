'use client';

import { DownloadProgress } from '@/services/downloadService';

interface DownloadProgressModalProps {
  progress: DownloadProgress;
  onCancel: () => void;
}

export default function DownloadProgressModal({ progress, onCancel }: DownloadProgressModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-bg rounded-2xl p-6 w-80 shadow-[0_8px_30px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] border border-border">
        <h3 className="text-lg font-medium text-ink mb-4">
          ダウンロード中...
        </h3>

        <div className="mb-3">
          <div className="flex justify-between text-sm text-muted mb-1">
            <span>{progress.current} / {progress.total}</span>
            <span>{progress.percentage}%</span>
          </div>
          <div className="w-full bg-surface rounded-full h-2">
            <div
              className="bg-ink h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>

        <button
          onClick={onCancel}
          className="w-full mt-2 px-4 py-2 text-sm text-muted hover:text-ink border border-border rounded-lg hover:bg-surface transition-colors duration-200 cursor-pointer"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
