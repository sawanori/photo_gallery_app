'use client';

import Link from 'next/link';
import { useGallery } from '@/contexts/GalleryContext';
import BulkDownloadButton from './BulkDownloadButton';
import LineShareButton from './LineShareButton';

interface HeaderProps {
  showLikedLink?: boolean;
  showBackLink?: boolean;
  showDownload?: boolean;
}

export default function Header({ showLikedLink = true, showBackLink = false, showDownload = true }: HeaderProps) {
  const { invitation, images, likedIds } = useGallery();
  const token = invitation?.token || '';

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left */}
          <div className="flex items-center gap-4">
            {showBackLink && (
              <Link
                href={`/gallery/${token}`}
                className="text-gray-500 hover:text-gray-900 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </Link>
            )}
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {invitation?.clientName || 'Gallery'}
              </h1>
              <p className="text-xs text-gray-500">
                {images.length} photos
              </p>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            {showLikedLink && likedIds.size > 0 && (
              <Link
                href={`/liked?token=${token}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-red-500">
                  <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                </svg>
                <span>{likedIds.size}</span>
              </Link>
            )}
            <LineShareButton />
            {showDownload && <BulkDownloadButton />}
          </div>
        </div>
      </div>
    </header>
  );
}
