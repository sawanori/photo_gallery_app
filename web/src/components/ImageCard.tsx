'use client';

import { memo, useState, useCallback } from 'react';
import LikeButton from './LikeButton';
import DownloadButton from './DownloadButton';
import { ImageWithLikeStatus } from '@/hooks/useGalleryImages';
import { optimizedImageUrl } from '@/utils/optimizedImage';

interface ImageCardProps {
  image: ImageWithLikeStatus;
  index: number;
  onImageClick: (index: number) => void;
}

const ImageCard = memo(function ImageCard({ image, index, onImageClick }: ImageCardProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  const handleLoaded = useCallback(() => setIsLoaded(true), []);
  const handleClick = useCallback(() => onImageClick(index), [onImageClick, index]);

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
      className="
        break-inside-avoid mb-4 group cursor-pointer relative
        rounded-lg overflow-hidden
        border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]
        transition-shadow duration-500
        hover:shadow-[0_8px_30px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)]
        focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none
      "
      onClick={handleClick}
    >
      <div className="bg-surface relative">
        {/* Background shimmer visible until image loads */}
        {!isLoaded && (
          <div className="absolute inset-0 animate-shimmer rounded-lg" />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={optimizedImageUrl(image.url, 640, 70)}
          alt={image.title || ''}
          loading={index < 8 ? 'eager' : 'lazy'}
          className="w-full h-auto object-cover"
          onLoad={handleLoaded}
          onError={handleLoaded}
        />
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {/* Bottom info */}
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

        {/* Action buttons */}
        <div className="absolute top-3 right-3 flex gap-2 animate-scale-in">
          <LikeButton
            imageId={image.id}
            isLiked={image.isLiked}
            likeCount={image.likeCount}
            size="sm"
          />
          <DownloadButton image={image} size="sm" />
        </div>
      </div>
    </div>
  );
});

export default ImageCard;
