'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useInvitation } from '@/hooks/useInvitation';
import { useLikedImages } from '@/hooks/useLikedImages';
import { useBulkDownload } from '@/hooks/useBulkDownload';
import { useNativeSave } from '@/hooks/useNativeSave';
import { useIsNativeShell } from '@/hooks/useIsNativeShell';
import { useGallery } from '@/contexts/GalleryContext';
import Header from '@/components/Header';
import MasonryGrid from '@/components/MasonryGrid';
import ExpiredLink from '@/components/ExpiredLink';
import AndroidSaveGuide from '@/components/AndroidSaveGuide';

const ImageLightbox = dynamic(() => import('@/components/ImageLightbox'), {
  ssr: false,
});

const DownloadProgressModal = dynamic(() => import('@/components/DownloadProgressModal'), {
  ssr: false,
});

const NativeSaveNotice = dynamic(() => import('@/components/NativeSaveNotice'), {
  ssr: false,
});

const BulkDownloadNotice = dynamic(() => import('@/components/BulkDownloadNotice'), {
  ssr: false,
});

function LikedPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const { isLoading, error, isValid } = useInvitation(token);
  const { invitation } = useGallery();
  const { likedImages } = useLikedImages();
  const {
    isDownloading,
    progress,
    lastResult: downloadResult,
    startDownload,
    cancelDownload,
    clearResult: clearDownloadResult,
  } = useBulkDownload();
  const { isNative } = useIsNativeShell();
  const nativeSave = useNativeSave();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleZipDownload = () => {
    if (likedImages.length === 0) return;

    // ネイティブシェル内では ZIP ではなくフォトライブラリへ直接保存する。
    // 送信できなければ従来の ZIP に落ちる。
    if (nativeSave.saveMany(likedImages)) return;

    const zipName = invitation?.clientName
      ? `${invitation.clientName}_favorites`
      : 'favorites';
    // 失敗は startDownload が lastResult に入れて下の通知に出す。
    // ここで受けないと unhandled rejection になる。
    startDownload(likedImages, zipName).catch(() => {});
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border border-t-ink rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !isValid) {
    return <ExpiredLink message={error || 'このリンクは無効です。'} />;
  }

  return (
    <div className="min-h-screen bg-bg">
      <Header showLikedLink={false} showBackLink showDownload={false} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl text-ink">
              お気に入り
            </h2>
            <p className="text-sm text-muted mt-1">
              {likedImages.length} photos
            </p>
          </div>

          {likedImages.length > 0 && (
            <button
              onClick={handleZipDownload}
              disabled={isDownloading || nativeSave.isSaving}
              className="
                flex items-center gap-2 px-4 py-2 rounded-lg
                bg-ink text-white hover:bg-ink/85
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200 text-sm font-medium cursor-pointer
                hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)]
              "
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {isNative ? `保存 (${likedImages.length}枚)` : 'ZIP'}
            </button>
          )}
        </div>

        {likedImages.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12 text-border mx-auto mb-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
              <p className="text-muted">
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

      <AndroidSaveGuide />

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

      {nativeSave.isSaving && nativeSave.progress && (
        <DownloadProgressModal
          mode="save"
          progress={nativeSave.progress}
          onCancel={nativeSave.cancel}
        />
      )}

      {nativeSave.lastResult && (
        <NativeSaveNotice
          result={nativeSave.lastResult}
          onClose={nativeSave.clearResult}
        />
      )}

      {downloadResult && (
        <BulkDownloadNotice result={downloadResult} onClose={clearDownloadResult} />
      )}
    </div>
  );
}

export default function LikedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border border-t-ink rounded-full animate-spin" />
      </div>
    }>
      <LikedPageContent />
    </Suspense>
  );
}
