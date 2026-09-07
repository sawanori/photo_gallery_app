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

/** sentinel が画面の下から何 px 手前に来たら次を読むか。 */
const LOAD_AHEAD_PX = 600;

export default function MasonryGrid({ images, onImageClick, hasMore, isLoadingMore, loadMore }: MasonryGridProps) {
  const colCount = useColumnCount();
  const gridRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  /** 前回ページを足した時点のグリッドの高さ。 */
  const loadedHeightRef = useRef(0);

  useEffect(() => {
    if (!hasMore || !loadMore) return;
    const sentinel = sentinelRef.current;
    const grid = gridRef.current;
    if (!sentinel || !grid) return;

    /**
     * 次のページを読むかどうかを、その場で測って決める。
     *
     * 「sentinel が見えている」だけを条件にしてはいけない。**読み込み前のカードは
     * 高さを持たない。** 写真が届くまでグリッドは伸びず、sentinel は画面内に
     * 居座り続けるので、loadMore が数フレームのうちに連続発火する。
     * 20 枚ずつという設計も `loading="lazy"` も素通りして、開いた瞬間に
     * ギャラリー全部のサムネイルを取りに行っていた
     * （2026-09-07 の本番実測で 160 枚・11.4MB が 250ms 以内に要求されていた）。
     *
     * そこで「前回ページを足した時点よりグリッドが伸びていること」を条件に加える。
     * 伸びた＝写真が実際に描画された、なので 1 画面ぶんずつしか進まない。
     */
    const maybeLoadMore = () => {
      const { top } = sentinel.getBoundingClientRect();
      if (top > window.innerHeight + LOAD_AHEAD_PX) return;

      const height = grid.scrollHeight;
      if (height <= loadedHeightRef.current) return;

      loadedHeightRef.current = height;
      loadMore();
    };

    const observer = new IntersectionObserver(maybeLoadMore, {
      rootMargin: `${LOAD_AHEAD_PX}px`,
    });
    observer.observe(sentinel);

    // 写真が届いてグリッドが伸びたときにも測り直す。
    // IntersectionObserver は交差したままだと再発火しないので、これが無いと
    // 1 ページが画面を埋めない縦長の端末でそこから進まない（監査 F13）。
    const resizeObserver = new ResizeObserver(maybeLoadMore);
    resizeObserver.observe(grid);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
    };
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
      <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
