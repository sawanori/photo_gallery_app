'use client';

import dynamic from 'next/dynamic';
import { useBulkDownload } from '@/hooks/useBulkDownload';
import { useGallery } from '@/contexts/GalleryContext';

const DownloadProgressModal = dynamic(() => import('./DownloadProgressModal'), {
  ssr: false,
});

export default function BulkDownloadButton() {
  const { images, invitation } = useGallery();
  const { isDownloading, progress, startDownload, cancelDownload } = useBulkDownload();

  const handleClick = () => {
    if (images.length === 0) return;
    const zipName = invitation?.clientName || 'photos';
    startDownload(images, zipName);
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isDownloading || images.length === 0}
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

      {isDownloading && progress && (
        <DownloadProgressModal progress={progress} onCancel={cancelDownload} />
      )}
    </>
  );
}
