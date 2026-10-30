'use client';

import { useState } from 'react';
import { useGallery } from '@/contexts/GalleryContext';
import { useIsNativeShell } from '@/hooks/useIsNativeShell';
import { isInAppBrowser } from '@/utils/device';

/**
 * perDevice の招待で、お気に入りが引き継がれないことをいいねの前に知らせる。
 *
 * お気に入りは匿名 UID に紐づくので、LINE 内ブラウザから Safari やアプリへ移ると空になる。
 * いいねの後に知っても手遅れなので、ギャラリーの先頭に常に表示する。
 */
export default function LikeScopeNotice() {
  const { invitation } = useGallery();
  const { isNative } = useIsNativeShell();
  const [copied, setCopied] = useState(false);

  if (invitation?.likeScope !== 'perDevice') return null;

  if (isNative || !isInAppBrowser()) {
    return (
      <p className="mb-4 text-sm text-muted">
        お気に入りは、この画面で開いている場所にだけ保存されます
      </p>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-border bg-surface p-3 text-sm text-ink">
      <p>
        このブラウザではお気に入りの保存がうまくいかないことがあります。Safari や Chrome、またはアプリで開いてからお選びください。
      </p>
      <button onClick={handleCopy} className="mt-2 underline cursor-pointer">
        {copied ? 'コピーしました' : 'リンクをコピー'}
      </button>
    </div>
  );
}
