import { useState, useCallback, useRef } from 'react';
import { getImage, Image as FirebaseImage } from '../services/imageService';
import { getLikedImageIds, unlikeImage } from '../services/likeService';
import { useNetwork } from '../contexts';
import { useAuth } from '../contexts';

interface Image extends FirebaseImage {
  isLiked?: boolean;
}

interface UseLikedImagesReturn {
  likedImages: Image[];
  loading: boolean;
  error: string | null;
  loadLikedImages: () => Promise<void>;
  toggleLike: (imageId: string) => Promise<void>;
}

export const useLikedImages = (): UseLikedImagesReturn => {
  const [likedImages, setLikedImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isConnected } = useNetwork();
  const { user } = useAuth();
  const loadLikedImagesRef = useRef<() => Promise<void>>();

  const loadLikedImages = useCallback(async () => {
    if (!isConnected) {
      setError('インターネット接続がありません');
      return;
    }

    if (!user) {
      setError('ログインが必要です');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get liked image IDs
      const likedIds = await getLikedImageIds(user.uid);

      // Fetch each image
      const images: Image[] = [];
      for (const imageId of likedIds) {
        const image = await getImage(imageId);
        if (image) {
          images.push({ ...image, isLiked: true });
        }
      }

      setLikedImages(images);
    } catch (err) {
      console.error('Load liked images error:', err);
      setError(err instanceof Error ? err.message : 'いいねした画像の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [isConnected, user]);

  // Store the latest loadLikedImages in ref
  loadLikedImagesRef.current = loadLikedImages;

  const toggleLike = useCallback(async (imageId: string) => {
    if (!user) {
      throw new Error('ログインが必要です');
    }

    // Optimistic update - remove from list
    setLikedImages((prev) => prev.filter((img) => img.id !== imageId));

    try {
      // In liked images screen, all images are liked, so we always unlike
      await unlikeImage(user.uid, imageId);
    } catch {
      // Revert on error by reloading
      if (loadLikedImagesRef.current) {
        await loadLikedImagesRef.current();
      }
      throw new Error('いいねの解除に失敗しました');
    }
  }, [user]);

  return {
    likedImages,
    loading,
    error,
    loadLikedImages,
    toggleLike,
  };
};
