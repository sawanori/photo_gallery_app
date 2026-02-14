'use client';

import { useState } from 'react';
import { Image as ImageType } from '@/types';

interface ShareButtonProps {
  image: ImageType;
  size?: 'sm' | 'md';
}

export default function ShareButton({ image, size = 'md' }: ShareButtonProps) {
  const [isSharing, setIsSharing] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSharing) return;

    // Web Share API not supported — fall back to download
    if (!navigator.share) return;

    setIsSharing(true);
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      const extension = blob.type.split('/')[1] || 'jpg';
      const filename = `${image.title || image.id}.${extension}`;
      const file = new File([blob], filename, { type: blob.type });

      await navigator.share({
        files: [file],
      });
    } catch (err) {
      // User cancelled share or error
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    } finally {
      setIsSharing(false);
    }
  };

  // Hide on browsers that don't support sharing files
  if (typeof navigator !== 'undefined' && !navigator.share) {
    return null;
  }

  const sizeClasses = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';

  return (
    <button
      onClick={handleClick}
      disabled={isSharing}
      className={`
        ${sizeClasses} rounded-full flex items-center justify-center
        bg-white/90 text-gray-600 hover:bg-white hover:text-blue-500
        transition-all duration-200 backdrop-blur-sm shadow-md cursor-pointer
        ${isSharing ? 'opacity-50' : ''}
      `}
      aria-label="共有"
    >
      {isSharing ? (
        <svg className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" className="animate-spin" strokeDasharray="31.4" strokeDashoffset="10" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      )}
    </button>
  );
}
