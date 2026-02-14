'use client';

import { DownloadProgress } from '@/services/downloadService';

interface DownloadProgressModalProps {
  progress: DownloadProgress;
  onCancel: () => void;
}

export default function DownloadProgressModal({ progress, onCancel }: DownloadProgressModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          ダウンロード中...
        </h3>

        <div className="mb-3">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>{progress.current} / {progress.total}</span>
            <span>{progress.percentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gray-900 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>

        <button
          onClick={onCancel}
          className="w-full mt-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
