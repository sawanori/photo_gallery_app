'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useInvitation } from '@/hooks/useInvitation';
import { useLikedImages } from '@/hooks/useLikedImages';
import { useBulkDownload } from '@/hooks/useBulkDownload';
import { useGallery } from '@/contexts/GalleryContext';
import Header from '@/components/Header';
import MasonryGrid from '@/components/MasonryGrid';
import ExpiredLink from '@/components/ExpiredLink';

const ImageLightbox = dynamic(() => import('@/components/ImageLightbox'), {
  ssr: false,
});

const DownloadProgressModal = dynamic(() => import('@/components/DownloadProgressModal'), {
  ssr: false,
});

function LikedPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const { isLoading, error, isValid } = useInvitation(token);
  const { invitation } = useGallery();
  const { likedImages } = useLikedImages();
  const { isDownloading, progress, startDownload, cancelDownload } = useBulkDownload();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleZipDownload = () => {
    if (likedImages.length === 0) return;
    const zipName = invitation?.clientName
      ? `${invitation.clientName}_favorites`
      : 'favorites';
    startDownload(likedImages, zipName);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !isValid) {
    return <ExpiredLink message={error || 'このリンクは無効です。'} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showLikedLink={false} showBackLink showDownload={false} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              お気に入り
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {likedImages.length} photos
            </p>
          </div>

          {likedImages.length > 0 && (
            <button
              onClick={handleZipDownload}
              disabled={isDownloading}
              className="
                flex items-center gap-2 px-4 py-2 rounded-lg
                bg-gray-900 text-white hover:bg-gray-800
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-200 text-sm font-medium cursor-pointer
              "
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              ZIP
            </button>
          )}
        </div>

        {likedImages.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12 text-gray-300 mx-auto mb-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
              <p className="text-gray-400">
                お気に入りの写真はまだありません
              </p>
            </div>
          </div>
        ) : (
          <MasonryGrid
            images={likedImages}
            onImageClick={(index) => setLightboxIndex(index)}
          />
        )}
      </main>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={likedImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}

      {isDownloading && progress && (
        <DownloadProgressModal progress={progress} onCancel={cancelDownload} />
      )}
    </div>
  );
}

export default function LikedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    }>
      <LikedPageContent />
    </Suspense>
  );
}
