'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useGallery } from '@/contexts/GalleryContext';
import BulkDownloadButton from './BulkDownloadButton';
import LeaveGalleryButton from './LeaveGalleryButton';
import { effectiveDeadline } from '@/utils/viewingWindow';

interface HeaderProps {
  showLikedLink?: boolean;
  showBackLink?: boolean;
  showDownload?: boolean;
}

export default function Header({ showLikedLink = true, showBackLink = false, showDownload = true }: HeaderProps) {
  const { invitation, likedIds, totalCount } = useGallery();
  const token = invitation?.token || '';

  /**
   * 「あと何日」の基準時刻。
   *
   * レンダー中に `Date.now()` を直接呼ぶと React のピュア性の規則に反する
   * （同じ入力で描画のたびに違う結果になる）。マウント時に一度だけ取って固定する。
   * ここは残り 2 日を切ったかの色分けにしか使わないので、開いている間に
   * 日付が変わっても実害は無い。
   */
  const [mountedAt] = useState(() => Date.now());

  // 表示する期限と実際の判定を必ず同じ計算にする。
  // 閲覧期限だけを出していたため、expiresAt のほうが先に来る招待では
  // 実際より遅い日付を表示していた（監査 F6）。早いほうを出す。
  const expiryDate = effectiveDeadline(
    invitation?.createdAt,
    invitation?.viewingDays,
    invitation?.expiresAt
  );

  const isExpiringSoon = expiryDate
    ? expiryDate.getTime() - mountedAt < 2 * 24 * 60 * 60 * 1000
    : false;

  return (
    <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left */}
          <div className="flex items-center gap-4">
            {showBackLink && (
              <Link
                href={`/gallery/${token}`}
                className="text-muted hover:text-ink transition-colors duration-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </Link>
            )}
            <div>
              <h1 className="font-serif text-xl tracking-tight text-ink">
                {invitation?.clientName || 'ギャラリー'}
              </h1>
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted font-light">
                  {totalCount}枚
                </p>
                {expiryDate && (
                  <p className={`text-xs font-light ${isExpiringSoon ? 'text-accent' : 'text-muted'}`}>
                    {expiryDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}まで
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            {showLikedLink && likedIds.size > 0 && (
              <Link
                href={`/liked?token=${token}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted hover:text-accent hover:bg-accent/5 transition-all duration-200 hover:-translate-y-[1px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-accent">
                  <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                </svg>
                <span>{likedIds.size}</span>
              </Link>
            )}
            {showDownload && <BulkDownloadButton />}
            {/* ネイティブでのみ描かれる。ブラウザでは null を返す。 */}
            <LeaveGalleryButton />
          </div>
        </div>
      </div>
    </header>
  );
}
