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
      {/* Loading overlay */}
      {!isReady && (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-border/30" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-ink/60 animate-spin" />
          </div>
          <p className="text-muted text-sm font-light tracking-wide">写真を読み込んでいます</p>
        </div>
      )}

      {/* Real grid (hidden until ready, then fade in) */}
      <div
        className={`transition-opacity duration-700 ease-out ${isReady ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}
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
