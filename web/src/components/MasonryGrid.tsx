'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ImageCard from './ImageCard';
import { ImageWithLikeStatus } from '@/hooks/useGalleryImages';

interface MasonryGridProps {
  images: ImageWithLikeStatus[];
  onImageClick: (index: number) => void;
}

function useColumnCount() {
  const [colCount, setColCount] = useState(
    typeof window !== 'undefined'
      ? window.innerWidth >= 1024 ? 4 : window.innerWidth >= 768 ? 3 : 2
      : 2
  );

  useEffect(() => {
    const lg = window.matchMedia('(min-width: 1024px)');
    const md = window.matchMedia('(min-width: 768px)');

    const update = () => {
      if (lg.matches) setColCount(4);
      else if (md.matches) setColCount(3);
      else setColCount(2);
    };
    update();

    lg.addEventListener('change', update);
    md.addEventListener('change', update);
    return () => {
      lg.removeEventListener('change', update);
      md.removeEventListener('change', update);
    };
  }, []);

  return colCount;
}

export default function MasonryGrid({ images, onImageClick }: MasonryGridProps) {
  const colCount = useColumnCount();

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
              onImageClick={onImageClick}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
