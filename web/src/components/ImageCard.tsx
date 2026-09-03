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
      // 申請前の受け入れ確認（e2e/review-demo.spec.ts）が、審査担当者の経路で
      // ネイティブ保存の認可 API を呼ぶために画像 ID を必要とする。
      // 画面には出ないが、この経路が壊れると審査で「保存できない」と見える。
      data-image-id={image.id}
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
          {/*
            いいねの件数はここに出していたが、削除した。
            お気に入りは招待リンク単位で記録するため（likeService の getLikeId）、
            1案件に1リンクを配る運用では値が 0 か 1 にしかならず、
            ハートの点灯と同じことを二重に表示していた。
          */}
          {image.title && (
            <p className="text-white text-sm font-medium truncate">
              {image.title}
            </p>
          )}
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
