'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ImageCard from './ImageCard';
import { ImageWithLikeStatus } from '@/hooks/useGalleryImages';

interface MasonryGridProps {
  images: ImageWithLikeStatus[];
  onImageClick: (index: number) => void;
}

function useColumnCount() {
  const [colCount, setColCount] = useState(4);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1024) setColCount(4);       // lg
      else if (w >= 768) setColCount(3);   // md
      else setColCount(2);                 // sm
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return colCount;
}

export default function MasonryGrid({ images, onImageClick }: MasonryGridProps) {
  const colCount = useColumnCount();

  const handleImageClick = useCallback(
    (index: number) => () => onImageClick(index),
    [onImageClick]
  );

  const columns = useMemo(() => {
    const cols: { image: ImageWithLikeStatus; originalIndex: number }[][] = Array.from(
      { length: colCount },
      () => []
    );
    images.forEach((image, index) => {
      cols[index % colCount].push({ image, originalIndex: index });
    });
    return cols;
  }, [images, colCount]);

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
        <div key={colIndex}>
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
