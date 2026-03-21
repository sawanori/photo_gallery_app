'use client';

import { useMemo } from 'react';
import { useGallery } from '@/contexts/GalleryContext';
import { Image } from '@/types';

export function useGalleryImages() {
  const { images, likedIds, hasMore, isLoadingMore, loadMore, allImageIds } = useGallery();

  const imagesWithLikeStatus = useMemo(() => {
    return images.map((image) => ({
      ...image,
      isLiked: likedIds.has(image.id),
    }));
  }, [images, likedIds]);

  return {
    images: imagesWithLikeStatus,
    hasMore,
    isLoadingMore,
    loadMore,
    totalCount: allImageIds.length,
  };
}

export type ImageWithLikeStatus = Image & { isLiked: boolean };
