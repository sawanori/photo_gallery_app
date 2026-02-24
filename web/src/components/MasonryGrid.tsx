'use client';

import { useCallback, useMemo } from 'react';
import ImageCard from './ImageCard';
import { ImageWithLikeStatus } from '@/hooks/useGalleryImages';

interface MasonryGridProps {
  images: ImageWithLikeStatus[];
  onImageClick: (index: number) => void;
}

function useColumns(count: number) {
  // This hook is only for the distribution logic; actual responsive
  // column count is handled by CSS grid on the container.
  return count;
}

export default function MasonryGrid({ images, onImageClick }: MasonryGridProps) {
  const handleImageClick = useCallback(
    (index: number) => () => onImageClick(index),
    [onImageClick]
  );

  // Distribute images into columns (round-robin) to maintain order
  // while keeping column heights roughly balanced.
  // We create 4 columns max; CSS hides extra columns on smaller screens.
  const columns = useMemo(() => {
    const colCount = 4;
    const cols: { image: ImageWithLikeStatus; originalIndex: number }[][] = Array.from(
      { length: colCount },
      () => []
    );
    images.forEach((image, index) => {
      cols[index % colCount].push({ image, originalIndex: index });
    });
    return cols;
  }, [images]);

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted text-lg font-light">
          まだ写真がありません
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {columns.map((col, colIndex) => (
        <div key={colIndex} className={colIndex >= 2 ? (colIndex >= 3 ? 'hidden lg:block' : 'hidden md:block') : ''}>
          {col.map(({ image, originalIndex }) => (
            <ImageCard
              key={image.id}
              image={image}
              index={originalIndex}
              onClick={handleImageClick(originalIndex)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
