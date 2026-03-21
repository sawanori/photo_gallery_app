'use client';

import { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import { Image, Invitation } from '@/types';
import { getImagesByIdsOrdered } from '@/services/imageService';

const PAGE_SIZE = 20;

interface GalleryContextValue {
  invitation: Invitation | null;
  setInvitation: (inv: Invitation | null) => void;
  images: Image[];
  setImages: (imgs: Image[]) => void;
  likedIds: Set<string>;
  setLikedIds: (ids: Set<string>) => void;
  toggleLikedId: (imageId: string) => void;
  updateImageLikeCount: (imageId: string, delta: number) => void;
  // Pagination
  allImageIds: string[];
  setAllImageIds: (ids: string[]) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
}

const GalleryContext = createContext<GalleryContextValue | undefined>(undefined);

export function GalleryProvider({ children }: { children: ReactNode }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [allImageIds, setAllImageIds] = useState<string[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadingRef = useRef(false);

  const hasMore = images.length < allImageIds.length;

  const toggleLikedId = useCallback((imageId: string) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
  }, []);

  const updateImageLikeCount = useCallback((imageId: string, delta: number) => {
    setImages((prev) =>
      prev.map((img) =>
        img.id === imageId
          ? { ...img, likeCount: Math.max(0, img.likeCount + delta) }
          : img
      )
    );
  }, []);

  const loadMore = useCallback(() => {
    if (loadingRef.current) return;

    setAllImageIds((currentAllIds) => {
      setImages((currentImages) => {
        const offset = currentImages.length;
        if (offset >= currentAllIds.length) return currentImages;

        loadingRef.current = true;
        setIsLoadingMore(true);

        const nextBatch = currentAllIds.slice(offset, offset + PAGE_SIZE);
        getImagesByIdsOrdered(nextBatch).then((newImages) => {
          setImages((prev) => [...prev, ...newImages]);
          loadingRef.current = false;
          setIsLoadingMore(false);
        }).catch((err) => {
          console.error('Failed to load more images:', err);
          loadingRef.current = false;
          setIsLoadingMore(false);
        });

        return currentImages;
      });
      return currentAllIds;
    });
  }, []);

  return (
    <GalleryContext.Provider
      value={{
        invitation,
        setInvitation,
        images,
        setImages,
        likedIds,
        setLikedIds,
        toggleLikedId,
        updateImageLikeCount,
        allImageIds,
        setAllImageIds,
        hasMore,
        isLoadingMore,
        loadMore,
      }}
    >
      {children}
    </GalleryContext.Provider>
  );
}

export function useGallery() {
  const context = useContext(GalleryContext);
  if (!context) throw new Error('useGallery must be used within GalleryProvider');
  return context;
}
