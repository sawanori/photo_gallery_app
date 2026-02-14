'use client';

import { useState } from 'react';
import { use } from 'react';
import dynamic from 'next/dynamic';
import { useInvitation } from '@/hooks/useInvitation';
import { useGalleryImages } from '@/hooks/useGalleryImages';
import Header from '@/components/Header';
import MasonryGrid from '@/components/MasonryGrid';
import ExpiredLink from '@/components/ExpiredLink';
import IosSaveGuide from '@/components/IosSaveGuide';

const ImageLightbox = dynamic(() => import('@/components/ImageLightbox'), {
  ssr: false,
});

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function GalleryPage({ params }: PageProps) {
  const { token } = use(params);
  const { isLoading, error, isValid } = useInvitation(token);
  const { images } = useGalleryImages();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Skeleton header */}
        <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
            <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>

        {/* Skeleton grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="columns-2 md:columns-3 lg:columns-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="break-inside-avoid mb-4 rounded-xl bg-gray-200 animate-pulse"
                style={{ height: `${200 + Math.random() * 200}px` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !isValid) {
    return <ExpiredLink message={error || 'このリンクは無効です。'} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showLikedLink showBackLink={false} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <MasonryGrid
          images={images}
          onImageClick={(index) => setLightboxIndex(index)}
        />
      </main>

      <IosSaveGuide />

      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}
