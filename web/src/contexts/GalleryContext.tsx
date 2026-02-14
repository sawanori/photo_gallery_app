'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { Image, Invitation } from '@/types';

interface GalleryContextValue {
  invitation: Invitation | null;
  setInvitation: (inv: Invitation | null) => void;
  images: Image[];
  setImages: (imgs: Image[]) => void;
  likedIds: Set<string>;
  setLikedIds: (ids: Set<string>) => void;
  toggleLikedId: (imageId: string) => void;
  updateImageLikeCount: (imageId: string, delta: number) => void;
}

const GalleryContext = createContext<GalleryContextValue | undefined>(undefined);

export function GalleryProvider({ children }: { children: ReactNode }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

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
