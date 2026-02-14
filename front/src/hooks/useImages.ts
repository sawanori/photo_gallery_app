import { useState, useCallback, useRef } from 'react';
import { QueryDocumentSnapshot } from 'firebase/firestore';
import { getImages, Image as FirebaseImage } from '../services/imageService';
import { toggleLike, hasLiked, getLikedImageIds } from '../services/likeService';
import { useNetwork } from '../contexts';
import { useAuth } from '../contexts';

// Frontend Image type with isLiked
interface Image extends FirebaseImage {
  isLiked?: boolean;
}

interface UseImagesReturn {
  images: Image[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  refreshing: boolean;
  loadImages: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  toggleLike: (imageId: string) => Promise<void>;
  reset: () => void;
}

export const useImages = (): UseImagesReturn => {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null);
  const loadingRef = useRef(false);
  const { isConnected } = useNetwork();
  const { user } = useAuth();

  const loadImages = useCallback(async () => {
    if (!isConnected) {
      setError('インターネット接続がありません');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await getImages(null, 20);

      // Get liked status for each image if user is logged in
      let imagesWithLikeStatus: Image[] = result.images;
      if (user) {
        const likedIds = await getLikedImageIds(user.uid);
        imagesWithLikeStatus = result.images.map(img => ({
          ...img,
          isLiked: likedIds.includes(img.id),
        }));
      }

      setImages(imagesWithLikeStatus);
      setHasMore(result.hasMore);
      lastDocRef.current = result.lastDoc;
    } catch (err) {
      console.error('Load images error:', err);
      setError(err instanceof Error ? err.message : '画像の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [isConnected, user]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingRef.current || !isConnected) return;

    try {
      loadingRef.current = true;
      setLoading(true);

      const result = await getImages(lastDocRef.current, 20);

      // Get liked status for each image if user is logged in
      let newImages: Image[] = result.images;
      if (user) {
        const likedIds = await getLikedImageIds(user.uid);
        newImages = result.images.map(img => ({
          ...img,
          isLiked: likedIds.includes(img.id),
        }));
      }

      setImages((prev) => [...prev, ...newImages]);
      setHasMore(result.hasMore);
      lastDocRef.current = result.lastDoc;
    } catch (err) {
      console.error('Load more error:', err);
      setError(err instanceof Error ? err.message : '追加の画像の読み込みに失敗しました');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [hasMore, isConnected, user]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    lastDocRef.current = null;
    await loadImages();
    setRefreshing(false);
  }, [loadImages]);

  const handleToggleLike = useCallback(async (imageId: string) => {
    if (!user) {
      throw new Error('ログインが必要です');
    }

    // Get current state
    let currentIsLiked = false;
    setImages((prev) => {
      const image = prev.find((img) => img.id === imageId);
      if (image) {
        currentIsLiked = !!image.isLiked;
      }
      return prev;
    });

    // Optimistic update
    setImages((prev) =>
      prev.map((img) =>
        img.id === imageId
          ? { ...img, isLiked: !img.isLiked, likeCount: img.likeCount + (currentIsLiked ? -1 : 1) }
          : img
      )
    );

    try {
      await toggleLike(user.uid, imageId);
    } catch (err) {
      // Revert on error
      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId
            ? { ...img, isLiked: currentIsLiked, likeCount: img.likeCount + (currentIsLiked ? 1 : -1) }
            : img
        )
      );
      throw new Error('いいねの更新に失敗しました');
    }
  }, [user]);

  const reset = useCallback(() => {
    setImages([]);
    setError(null);
    setHasMore(true);
    lastDocRef.current = null;
  }, []);

  return {
    images,
    loading,
    error,
    hasMore,
    refreshing,
    loadImages,
    loadMore,
    refresh,
    toggleLike: handleToggleLike,
    reset,
  };
};
