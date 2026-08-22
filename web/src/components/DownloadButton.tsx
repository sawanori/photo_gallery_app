'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { downloadSingleImage } from '@/services/downloadService';
import { useNativeSave } from '@/hooks/useNativeSave';
import { Image } from '@/types';

const NativeSaveNotice = dynamic(() => import('./NativeSaveNotice'), { ssr: false });

interface DownloadButtonProps {
  image: Image;
  size?: 'sm' | 'md';
}

export default function DownloadButton({ image, size = 'md' }: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const nativeSave = useNativeSave();

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDownloading || nativeSave.isSaving) return;

    // ネイティブシェル内ならフォトライブラリへ直接保存する。
    // ここでの分岐はマークアップを変えないため hydration mismatch を起こさない。
    // 送信できなかった場合（未対応の古いアプリなど）は従来のブラウザ挙動に落とす。
    if (nativeSave.saveOne(image)) return;

    setIsDownloading(true);
    try {
      await downloadSingleImage(image);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const sizeClasses = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';

  return (
    <>
      <button
      onClick={handleClick}
      disabled={isDownloading || nativeSave.isSaving}
      className={`
        ${sizeClasses} rounded-full flex items-center justify-center
        bg-white/90 text-neutral-600 hover:bg-white hover:text-ink
        transition-all duration-200 backdrop-blur-sm shadow-md cursor-pointer
        ${isDownloading || nativeSave.isSaving ? 'opacity-50' : ''}
      `}
      aria-label="ダウンロード"
    >
      {isDownloading || nativeSave.isSaving ? (
        <svg className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" className="animate-spin" strokeDasharray="31.4" strokeDashoffset="10" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      )}
      </button>

      {/* 保存の結果を出す。これが無いと、失敗しても利用者に何も伝わらない。
          自分が出したリクエストの結果だけが lastResult に入る（requestId で絞っている）ため、
          画面に複数の DownloadButton があっても通知は1つしか出ない。 */}
      {nativeSave.lastResult && (
        <NativeSaveNotice
          result={nativeSave.lastResult}
          onClose={nativeSave.clearResult}
        />
      )}
    </>
  );
}
