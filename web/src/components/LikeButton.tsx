'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGallery } from '@/contexts/GalleryContext';
import { toggleLike } from '@/services/likeService';

interface LikeButtonProps {
  imageId: string;
  isLiked: boolean;
  likeCount: number;
  size?: 'sm' | 'md';
}

export default function LikeButton({ imageId, isLiked, likeCount, size = 'md' }: LikeButtonProps) {
  const { user } = useAuth();
  const { toggleLikedId, updateImageLikeCount } = useGallery();
  const [isAnimating, setIsAnimating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || isProcessing) return;

    setIsProcessing(true);
    setIsAnimating(true);

    // Optimistic update
    toggleLikedId(imageId);
    updateImageLikeCount(imageId, isLiked ? -1 : 1);

    try {
      await toggleLike(user.uid, imageId);
    } catch {
      // Revert on error
      toggleLikedId(imageId);
      updateImageLikeCount(imageId, isLiked ? 1 : -1);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setIsAnimating(false), 300);
    }
  };

  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base';

  return (
    <button
      onClick={handleClick}
      disabled={isProcessing}
      className={`
        ${sizeClasses} rounded-full flex items-center justify-center gap-1
        transition-all duration-200 cursor-pointer
        ${isLiked
          ? 'bg-red-500 text-white hover:bg-red-600'
          : 'bg-white/90 text-gray-600 hover:bg-white hover:text-red-500'
        }
        ${isAnimating ? 'scale-125' : 'scale-100'}
        backdrop-blur-sm shadow-md
      `}
      aria-label={isLiked ? 'いいねを取り消す' : 'いいね'}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill={isLiked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={isLiked ? 0 : 2}
        className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
    </button>
  );
}
