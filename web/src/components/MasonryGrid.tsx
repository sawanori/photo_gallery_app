'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ImageCard from './ImageCard';
import { ImageWithLikeStatus } from '@/hooks/useGalleryImages';

interface MasonryGridProps {
  images: ImageWithLikeStatus[];
  onImageClick: (index: number) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  loadMore?: () => void;
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

export default function MasonryGrid({ images, onImageClick, hasMore, isLoadingMore, loadMore }: MasonryGridProps) {
  const colCount = useColumnCount();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!hasMore || !loadMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '600px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

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
    <div>
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

      {/* Sentinel for infinite scroll */}
      {hasMore && <div ref={sentinelRef} className="h-1" />}

      {/* Loading spinner for more images */}
      {isLoadingMore && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-2 border-border/30 border-t-ink/60 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
