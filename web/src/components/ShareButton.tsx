'use client';

import { useState } from 'react';
import { Image as ImageType } from '@/types';
import { useIsNativeShell } from '@/hooks/useIsNativeShell';

interface ShareButtonProps {
  image: ImageType;
  size?: 'sm' | 'md';
}

export default function ShareButton({ image, size = 'md' }: ShareButtonProps) {
  const [isSharing, setIsSharing] = useState(false);
  const { isNative } = useIsNativeShell();

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSharing) return;

    if (typeof navigator.canShare !== 'function') return;

    setIsSharing(true);
    try {
      const response = await fetch(image.url);
      if (!response.ok) {
        throw new Error(`画像を取得できませんでした (${response.status})`);
      }
      const blob = await response.blob();
      const extension = blob.type.split('/')[1] || 'jpg';
      const filename = `${image.title || image.id}.${extension}`;
      const file = new File([blob], filename, { type: blob.type });

      // share() に渡す直前に、この端末がファイル共有を扱えるか確かめる。
      // canShare が存在しても files に対応しない実装があり、その場合 share() は
      // 例外を投げる。ここで弾いてダウンロードボタンに任せる。
      if (!navigator.canShare({ files: [file] })) {
        throw new Error('この端末は画像の共有に対応していません');
      }

      await navigator.share({
        files: [file],
      });
    } catch (err) {
      // User cancelled share or error
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    } finally {
      setIsSharing(false);
    }
  };

  // ネイティブシェル内では保存ボタンが主導線になるため共有は重複する
  if (isNative) return null;
  // ファイル共有に対応しないブラウザでは出さない。判定に navigator.share ではなく
  // canShare を使うのは、share があっても files を扱えない実装があるため。
  //
  // 以前は Android を一律で除外していた（ダウンロードボタンと重複するという理由）。
  // だが LINE などのアプリへ「画像そのもの」を渡せるのはこの共有シートだけで、
  // Android Chrome はファイル共有に対応している。重複ではなく別の導線なので出す。
  if (typeof navigator !== 'undefined' && typeof navigator.canShare !== 'function') {
    return null;
  }

  const sizeClasses = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';

  return (
    <button
      onClick={handleClick}
      disabled={isSharing}
      className={`
        ${sizeClasses} rounded-full flex items-center justify-center
        bg-white/90 text-neutral-600 hover:bg-white hover:text-ink
        transition-all duration-200 backdrop-blur-sm shadow-md cursor-pointer
        ${isSharing ? 'opacity-50' : ''}
      `}
      aria-label="共有"
    >
      {isSharing ? (
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      )}
    </button>
  );
}
