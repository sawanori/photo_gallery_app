'use client';

import { createContext, useContext, useState, useMemo, ReactNode, useCallback } from 'react';
import { Image, Invitation } from '@/types';

const PAGE_SIZE = 20;

interface GalleryContextValue {
  invitation: Invitation | null;
  setInvitation: (inv: Invitation | null) => void;
  allImages: Image[];
  setAllImages: (imgs: Image[]) => void;
  images: Image[];
  likedIds: Set<string>;
  setLikedIds: (ids: Set<string>) => void;
  toggleLikedId: (imageId: string) => void;
  updateImageLikeCount: (imageId: string, delta: number) => void;
  totalCount: number;
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
}

const GalleryContext = createContext<GalleryContextValue | undefined>(undefined);

export function GalleryProvider({ children }: { children: ReactNode }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [allImages, setAllImages] = useState<Image[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  const images = useMemo(() => allImages.slice(0, visibleCount), [allImages, visibleCount]);
  const totalCount = allImages.length;
  const hasMore = visibleCount < allImages.length;

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
    setAllImages((prev) =>
      prev.map((img) =>
        img.id === imageId
          ? { ...img, likeCount: Math.max(0, img.likeCount + delta) }
          : img
      )
    );
  }, []);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, allImages.length));
  }, [allImages.length]);

  return (
    <GalleryContext.Provider
      value={{
        invitation,
        setInvitation,
        allImages,
        setAllImages,
        images,
        likedIds,
        setLikedIds,
        toggleLikedId,
        updateImageLikeCount,
        totalCount,
        hasMore,
        loadMore,
        isLoadingMore: false,
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
