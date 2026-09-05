'use client';

import { useState } from 'react';
import { useGallery } from '@/contexts/GalleryContext';
import { useSupportsNativeFeature } from '@/hooks/useIsNativeShell';
import { requestLeaveGallery } from '@/lib/nativeBridge';

/**
 * アプリで開いているギャラリーから出て、入口画面へ戻る。
 *
 * アプリは一度開いたギャラリーのトークンを覚えていて、起動のたびにそこへ直行する。
 * これが無いと、別の案件のリンクを持っていない利用者は入口画面に戻れない。
 * トークンは iOS のキーチェーンにあるため、アプリを削除しても消えない。
 *
 * **ブラウザでは何も描かない。** ブラウザに「出る」状態は無く、別の URL を
 * 開けば済む。ネイティブが `leaveGallery` に対応している場合だけ出す。
 * 対応の判定を機能名で行っているのは、web が push した瞬間に配信されるのに対して
 * アプリの更新は遅れて届くためで、古いアプリにはこのボタン自体を見せない。
 */
export default function LeaveGalleryButton() {
  const { invitation } = useGallery();
  const supported = useSupportsNativeFeature('leaveGallery');
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!supported || !invitation) return null;

  const handleLeave = () => {
    setFailed(false);
    // 成功した場合、ネイティブが入口画面へ切り替えるのでこの画面は捨てられる。
    // ここで閉じないのは、失敗したときに何も起きなかったように見せないため。
    if (!requestLeaveGallery(invitation.token)) {
      setFailed(true);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setConfirming((open) => !open)}
        aria-label="別のギャラリーを開く"
        aria-expanded={confirming}
        className="flex items-center justify-center w-9 h-9 rounded-lg text-muted hover:text-ink hover:bg-ink/5 transition-all duration-200 cursor-pointer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="w-5 h-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
          />
        </svg>
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-label="別のギャラリーを開く"
          className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-border bg-bg p-4 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
        >
          <p className="text-sm font-medium text-ink">別のギャラリーを開きますか</p>
          <p className="mt-1 text-xs text-muted">
            このギャラリーを閉じて、リンクの入力画面に戻ります。お気に入りの選択は
            残るので、同じリンクを開き直せば元どおりです。
          </p>
          {failed && (
            <p className="mt-2 text-xs text-accent">
              いま操作できませんでした。アプリを開き直してからお試しください。
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setFailed(false);
              }}
              className="px-3 py-1.5 rounded-lg text-sm text-muted hover:text-ink hover:bg-ink/5 transition-colors duration-200 cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleLeave}
              className="px-3 py-1.5 rounded-lg text-sm text-bg bg-ink hover:opacity-90 transition-opacity duration-200 cursor-pointer"
            >
              開く画面に戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
