'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ImageCard from './ImageCard';
import { ImageWithLikeStatus } from '@/hooks/useGalleryImages';

const EAGER_COUNT = 8;

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
  const [isReady, setIsReady] = useState(false);
  const loadedCount = useRef(0);
  const prevImageCount = useRef(0);

  // Reset when images change significantly (new gallery load)
  useEffect(() => {
    if (images.length !== prevImageCount.current) {
      loadedCount.current = 0;
      setIsReady(false);
      prevImageCount.current = images.length;
    }
  }, [images.length]);

  const handleImageLoad = useCallback(() => {
    loadedCount.current += 1;
    const target = Math.min(EAGER_COUNT, prevImageCount.current);
    if (target > 0 && loadedCount.current >= target) {
      setIsReady(true);
    }
  }, []);

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
    <div className="relative">
      {/* Skeleton overlay */}
      <div
        className={`absolute inset-0 z-10 transition-opacity duration-500 ${isReady ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: colCount }).map((_, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, rowIdx) => (
                <div
                  key={rowIdx}
                  className="rounded-lg animate-shimmer"
                  style={{ height: `${180 + ((colIdx + rowIdx) % 3) * 80}px` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Real grid (hidden until ready) */}
      <div
        className={`transition-opacity duration-500 ${isReady ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {columns.map((col, colIndex) => (
            <div key={colIndex}>
              {col.map(({ image, originalIndex }) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  index={originalIndex}
                  onImageClick={onImageClick}
                  onImageLoad={handleImageLoad}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
