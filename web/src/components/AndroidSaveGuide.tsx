'use client';

import { isAndroid } from '@/utils/device';
import { detectNativeShell } from '@/lib/nativeBridge';
import { useDismissibleGuide } from '@/hooks/useDismissibleGuide';

const STORAGE_KEY = 'android_save_guide_dismissed';

// ネイティブシェル内では保存ボタンから直接保存できるため手順の案内は不要
const isApplicable = () => isAndroid() && detectNativeShell() === null;

export default function AndroidSaveGuide() {
  const { show, dismiss: handleDismiss } = useDismissibleGuide(STORAGE_KEY, isApplicable);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-fade-slide-up sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="bg-bg rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-border p-4">
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-surface rounded-xl flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-ink">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink">
              写真を保存するには
            </p>
            <p className="text-xs text-muted mt-0.5">
              画像が新しいタブで開きます。画像を長押しして「画像をダウンロード」を選択してください
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-muted hover:text-ink cursor-pointer transition-colors duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
