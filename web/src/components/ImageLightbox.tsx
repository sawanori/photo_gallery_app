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

/**
 * スワイプと認めるまでの横移動量（px）。
 *
 * これより小さいものはタップの手ぶれとみなす。小さくしすぎると、
 * 拡大表示を閉じようとしたタップで写真が勝手に送られる。
 */
const SWIPE_THRESHOLD_PX = 50;

/**
 * 拡大表示に出す 1 枚の URL。
 *
 * アップロード時に作った 1920px の WebP があれば Storage から直接読む。
 * 無い場合（2026-09-06 より前にアップロードした画像）だけ、原本を
 * `/api/image` に通してその場でリサイズする。後者は CDN が冷えていると
 * 本番実測で 4.5 秒かかるため、あくまで移行期間のための逃げ道である。
 */
function displaySrc(image: ImageWithLikeStatus): string {
  return image.thumbnails?.large ?? optimizedImageUrl(image.url, 1920, 80);
}

/**
 * 原寸が届くまでのつなぎに出す 1 枚。
 *
 * グリッドが既に読み込んでいる 640px をそのまま使うので、多くの場合
 * ブラウザのキャッシュに載っていて即座に出る。スピナーを見せるより、
 * 粗くても写真が出ているほうが「開いた」ことが伝わる。
 */
function placeholderSrc(image: ImageWithLikeStatus): string | null {
  return image.thumbnails?.medium ?? null;
}

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
  const placeholder = image ? placeholderSrc(image) : null;

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
        img.src = displaySrc(images[i]);
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

  /**
   * 左右スワイプで前後の写真へ移る。
   *
   * 納品ギャラリーを見るのはほぼ携帯で、矢印ボタンだけでは操作が重い。
   * ポインタイベントで書いているのでタッチでもマウスでも同じ経路を通る。
   *
   * 判定は「離した位置」との差だけを見る。途中の追従はしない。
   * 端（最初・最後）では goPrev / goNext が何もしないので、そのまま無反応になる。
   */
  const swipeStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // 2本目以降の指が置かれたら、進行中のスワイプを捨てる。
    // ピンチで拡大しようとしただけなのに、どちらの指が先に離れるかで
    // 写真が送られたり送られなかったりする（レビューで再現を確認）。
    if (!e.isPrimary) {
      swipeStart.current = null;
      return;
    }
    // ボタンの上から始まった操作はスワイプにしない。
    // お気に入りや保存を押すつもりの指が少し流れるのはふつうにあり、
    // それで写真が送られると誤操作にしか見えない。
    // アイコンの svg から押されることが多いので closest で親まで辿る。
    if ((e.target as Element).closest('button')) {
      swipeStart.current = null;
      return;
    }
    swipeStart.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = swipeStart.current;
      swipeStart.current = null;
      if (!start || start.pointerId !== e.pointerId) return;

      // ブラウザのピンチで拡大している間は、指の動きは写真の中を見て回る操作。
      // ここで送ると拡大したまま別の写真へ飛んでしまう。
      if ((window.visualViewport?.scale ?? 1) > 1) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;

      // 縦のほうが大きい動きはスワイプとみなさない。斜めに滑った指で送らないため。
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

      // 左へ払ったら次、右へ払ったら前。紙をめくる向きに合わせる。
      if (dx < 0) goNext();
      else goPrev();
    },
    [goNext, goPrev]
  );

  const handlePointerCancel = useCallback(() => {
    swipeStart.current = null;
  }, []);

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
        // 読み込み中でも前の写真へは戻れる。ここだけ無反応だと
        // 「スワイプが効かなくなった」と受け取られる。
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{ touchAction: 'pan-y pinch-zoom' }}
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
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      // 横方向のジェスチャはこちらで扱うとブラウザに宣言する。
      // pinch-zoom を残すのは、写真を拡大して細部を見るのは納品ギャラリーの
      // 基本操作だから。pan-y だけにすると、これまでできていたピンチ拡大が
      // 黙って効かなくなる。
      //
      // なお端末の画面端からの戻るジェスチャ（iOS の edge swipe、Android の
      // 戻る操作）は OS 側の認識器で、touch-action では抑えられない。
      style={{ touchAction: 'pan-y pinch-zoom' }}
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
        {/* つなぎの 1 枚が出せるなら、スピナーではなく写真を見せる */}
        {isLoading && !placeholder && (
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
        {/*
          つなぎの 1 枚。これが表示領域の大きさを決めるので、原寸は上に重ねる。
          読み込みが終わったら消すが、要素は残したままにする。外すと原寸が
          absolute のまま行き場を失って表示が崩れる。
        */}
        {placeholder && !loadError && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`placeholder-${image.url}`}
            src={placeholder}
            alt=""
            aria-hidden="true"
            draggable={false}
            className={`max-w-full max-h-[85vh] object-contain transition-opacity duration-300 ${isLoading ? 'opacity-100' : 'opacity-0'}`}
          />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={image.url}
          src={displaySrc(image)}
          alt={image.title || ''}
          // 画像のネイティブドラッグを止める。放置すると、マウスで写真を
          // 払ったときだけ pointercancel になり、背景を払ったときと挙動が食い違う。
          draggable={false}
          className={`${placeholder && !loadError ? 'absolute inset-0 w-full h-full' : ''} max-w-full max-h-[85vh] object-contain transition-opacity duration-300 ${isLoading || loadError ? 'opacity-0' : 'opacity-100'}`}
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
              {currentIndex + 1} / {totalCount || images.length}
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
