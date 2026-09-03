'use client';

import { memo, useState, useCallback } from 'react';
import LikeButton from './LikeButton';
import DownloadButton from './DownloadButton';
import { ImageWithLikeStatus } from '@/hooks/useGalleryImages';
import { optimizedImageUrl } from '@/utils/optimizedImage';

function thumbnailSrc(image: ImageWithLikeStatus, width: 384 | 640): string {
  if (width === 384 && image.thumbnails?.small) return image.thumbnails.small;
  if (width === 640 && image.thumbnails?.medium) return image.thumbnails.medium;
  return optimizedImageUrl(image.url, width, 70);
}

/**
 * ホバーで出る要素の見え方。
 *
 * Tailwind 4 の `hover:` は `@media (hover: hover)` に閉じるため、**スマホでは
 * 一生 opacity-0 のまま**である。それでもボタン自体は生きていたので、
 * サムネの右上をタップすると「見えていないのに」お気に入りが反転したり
 * 新規タブが開いたりしていた（監査 F4）。
 *
 *   - `pointer-events-none` を既定にして、見えない間は押せないようにする
 *   - `pointer-coarse:`（＝タッチ端末）では常時表示・常時操作可にする
 */
const REVEAL_ON_HOVER =
  'opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity duration-300';
const INTERACTIVE_ON_REVEAL =
  'pointer-events-none group-hover:pointer-events-auto pointer-coarse:pointer-events-auto';

interface ImageCardProps {
  image: ImageWithLikeStatus;
  index: number;
  onImageClick: (index: number) => void;
}

const ImageCard = memo(function ImageCard({ image, index, onImageClick }: ImageCardProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  const handleLoaded = useCallback(() => {
    setIsLoaded(true);
  }, []);
  const handleClick = useCallback(() => onImageClick(index), [onImageClick, index]);

  return (
    <div
      className="
        break-inside-avoid mb-4 group relative
        rounded-lg overflow-hidden
        border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]
        transition-shadow duration-500
        hover:shadow-[0_8px_30px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)]
      "
    >
      {/*
        拡大表示を開くのは本物の <button>。以前は role="button" の div の中に
        お気に入り／保存の <button> を入れ子にしており、対話要素の入れ子という
        不正な構造だった（監査 F13）。ボタンにすれば Enter / Space の処理も不要になる。
      */}
      <button
        type="button"
        onClick={handleClick}
        aria-label={image.title ? `${image.title} を拡大表示` : '写真を拡大表示'}
        className="
          block w-full bg-surface relative cursor-pointer
          focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none
        "
      >
        {/* Background shimmer visible until image loads */}
        {!isLoaded && (
          <div className="absolute inset-0 animate-shimmer rounded-lg" />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          srcSet={`${thumbnailSrc(image, 384)} 384w, ${thumbnailSrc(image, 640)} 640w`}
          sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
          src={thumbnailSrc(image, 640)}
          alt={image.title || ''}
          loading={index < 4 ? 'eager' : 'lazy'}
          fetchPriority={index < 4 ? 'high' : 'auto'}
          className="w-full h-auto object-cover"
          onLoad={handleLoaded}
          onError={handleLoaded}
        />
      </button>

      {/*
        情報のオーバーレイ。**常に pointer-events-none。**
        写真の上に重なるので、押せる状態にすると拡大表示のボタンを覆ってしまう。
      */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent pointer-events-none ${REVEAL_ON_HOVER}`}
      >
        <div className="absolute bottom-0 left-0 right-0 p-3">
          {image.title && (
            <p className="text-white text-sm font-medium truncate mb-2">
              {image.title}
            </p>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-white/70 text-xs">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
              </svg>
              <span>{image.likeCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons: 見えているときだけ押せる */}
      <div
        data-testid="image-card-actions"
        className={`absolute top-3 right-3 flex gap-2 ${REVEAL_ON_HOVER} ${INTERACTIVE_ON_REVEAL}`}
      >
        <LikeButton imageId={image.id} isLiked={image.isLiked} size="sm" />
        <DownloadButton image={image} size="sm" />
      </div>
    </div>
  );
});

export default ImageCard;
