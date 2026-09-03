'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import LikeButton from './LikeButton';
import DownloadButton from './DownloadButton';
import ShareButton from './ShareButton';
import { ImageWithLikeStatus } from '@/hooks/useGalleryImages';
import { optimizedImageUrl } from '@/utils/optimizedImage';

interface ImageLightboxProps {
  images: ImageWithLikeStatus[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  totalCount?: number;
  hasMore?: boolean;
  loadMore?: () => void;
}

/** ダイアログ内でフォーカスを回す対象。 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function ImageLightbox({ images, currentIndex, onClose, onNavigate, totalCount, hasMore, loadMore }: ImageLightboxProps) {
  const image = images[currentIndex];

  /**
   * 読み込み状態は「どの URL まで終わったか」から**描画時に導く**。
   *
   * 以前は URL が変わるたびに effect の中で setState して読み込み中へ戻していた。
   * effect 内の同期 setState は再レンダーを重ねるうえ（react-hooks/set-state-in-effect）、
   * 状態が 3 つに散らばって整合を取るのが難しかった。
   */
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);

  const currentUrl = image?.url ?? null;
  const loadError = currentUrl !== null && erroredUrl === currentUrl;
  const isLoading = currentUrl !== null && !loadError && loadedUrl !== currentUrl;

  const handleImageLoad = useCallback(() => {
    if (!currentUrl) return;
    setLoadedUrl(currentUrl);
    setErroredUrl((previous) => (previous === currentUrl ? null : previous));
  }, [currentUrl]);

  const handleImageError = useCallback(() => {
    if (!currentUrl) return;
    setErroredUrl(currentUrl);
  }, [currentUrl]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  /**
   * 開いたら閉じるボタンへフォーカスを移し、閉じたら発火元へ戻す。
   *
   * `role="dialog" aria-modal="true"` を名乗っている以上、フォーカスが背後の
   * グリッドに残っているのは嘘になる。キーボードと読み上げの利用者は
   * 「開いたはずのものが操作できない」状態になる（監査 F13）。
   * 実装は NativeSaveNotice と同じ方式。
   */
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus();
    };
  }, []);

  // Preload adjacent images with cleanup
  const preloadRefs = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    // Cancel previous preloads
    preloadRefs.current.forEach((img) => { img.src = ''; });
    preloadRefs.current = [];

    const preloadIndexes = [currentIndex + 1, currentIndex - 1, currentIndex + 2];
    preloadIndexes.forEach((i) => {
      if (i >= 0 && i < images.length) {
        const img = new window.Image();
        img.src = optimizedImageUrl(images[i].url, 1920, 80);
        preloadRefs.current.push(img);
      }
    });

    return () => {
      preloadRefs.current.forEach((img) => { img.src = ''; });
      preloadRefs.current = [];
    };
  }, [currentIndex, images]);

  // Auto-load more when approaching the end of loaded images
  useEffect(() => {
    if (hasMore && loadMore && currentIndex >= images.length - 3) {
      loadMore();
    }
  }, [currentIndex, images.length, hasMore, loadMore]);

  const maxIndex = (totalCount || images.length) - 1;

  const goNext = useCallback(() => {
    if (currentIndex < maxIndex) onNavigate(currentIndex + 1);
  }, [currentIndex, maxIndex, onNavigate]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) onNavigate(currentIndex - 1);
  }, [currentIndex, onNavigate]);

  useEffect(() => {
    // Tab をダイアログの中で回す。外へ出すと背後のグリッドを操作できてしまう。
    const trapTab = (e: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const outside = !dialog.contains(active);

      if (e.shiftKey) {
        if (outside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (outside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': onClose(); break;
        case 'ArrowRight': goNext(); break;
        case 'ArrowLeft': goPrev(); break;
        case 'Tab': trapTab(e); break;
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, goNext, goPrev]);

  // Image not yet loaded (past the loaded range)
  if (!image) {
    return (
      <div
        ref={dialogRef}
        className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
        role="dialog"
        aria-modal="true"
      >
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="閉じる"
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 flex items-center justify-center text-white transition-colors duration-200 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          <p className="text-white/40 text-xs font-light">読み込み中</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Close button */}
      <button
        ref={closeRef}
        onClick={onClose}
        aria-label="閉じる"
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 flex items-center justify-center text-white transition-colors duration-200 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Navigation - Previous */}
      {currentIndex > 0 && (
        <button
          onClick={goPrev}
          aria-label="前の画像"
          className="absolute left-4 z-10 w-12 h-12 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 flex items-center justify-center text-white transition-colors duration-200 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      )}

      {/* Navigation - Next */}
      {currentIndex < maxIndex && (
        <button
          onClick={goNext}
          aria-label="次の画像"
          className="absolute right-4 z-10 w-12 h-12 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 flex items-center justify-center text-white transition-colors duration-200 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}

      {/* Image */}
      <div className="relative max-w-[90vw] max-h-[85vh] min-w-[200px] min-h-[200px] flex items-center justify-center">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3">
            <div className="w-10 h-10 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
            <p className="text-white/40 text-xs font-light">読み込み中</p>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10 text-white/40">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-white/40 text-xs font-light">画像を読み込めませんでした</p>
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={image.url}
          src={optimizedImageUrl(image.url, 1920, 80)}
          alt={image.title || ''}
          className={`max-w-full max-h-[85vh] object-contain transition-opacity duration-300 ${isLoading || loadError ? 'opacity-0' : 'opacity-100'}`}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            {image.title && (
              <p className="text-white font-serif text-lg">{image.title}</p>
            )}
            <p className="text-white/50 text-sm font-light">
              {currentIndex + 1} of {totalCount || images.length}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LikeButton imageId={image.id} isLiked={image.isLiked} />
            <ShareButton image={image} />
            <DownloadButton image={image} />
          </div>
        </div>
      </div>
    </div>
  );
}
