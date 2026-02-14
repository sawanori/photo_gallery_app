'use client';

import { useMemo } from 'react';
import { useGallery } from '@/contexts/GalleryContext';
import { ImageWithLikeStatus } from './useGalleryImages';

export function useLikedImages() {
  const { images, likedIds } = useGallery();

  const likedImages: ImageWithLikeStatus[] = useMemo(() => {
    const result: ImageWithLikeStatus[] = [];
    for (const img of images) {
      if (likedIds.has(img.id)) {
        result.push({ ...img, isLiked: true });
      }
    }
    return result;
  }, [images, likedIds]);

  return { likedImages };
}
