'use client';

import { useCallback } from 'react';
import ImageCard from './ImageCard';
import { ImageWithLikeStatus } from '@/hooks/useGalleryImages';

interface MasonryGridProps {
  images: ImageWithLikeStatus[];
  onImageClick: (index: number) => void;
}

export default function MasonryGrid({ images, onImageClick }: MasonryGridProps) {
  const handleImageClick = useCallback(
    (index: number) => () => onImageClick(index),
    [onImageClick]
  );

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400 text-lg">
          まだ写真がありません
        </p>
      </div>
    );
  }

  return (
    <div className="columns-2 md:columns-3 lg:columns-4 gap-4 [content-visibility:auto]">
      {images.map((image, index) => (
        <ImageCard
          key={image.id}
          image={image}
          onClick={handleImageClick(index)}
        />
      ))}
    </div>
  );
}
