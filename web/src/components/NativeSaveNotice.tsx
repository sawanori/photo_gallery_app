'use client';

import { useEffect, useRef } from 'react';
import { postToNative } from '@/lib/nativeBridge';
import type { NativeSaveResult } from '@/hooks/useNativeSave';
import ModalPortal from './ModalPortal';

interface Props {
  result: NativeSaveResult;
  onClose: () => void;
}

interface Notice {
  title: string;
  body: string;
  /** OS の設定アプリを開くボタンを出すか。 */
  showSettings?: boolean;
  /** 成功時はトーストとして自動的に消す。 */
  autoDismissMs?: number;
}

function buildNotice(result: NativeSaveResult): Notice {
  if (result.ok) {
    return {
      title:
        result.savedCount > 1
          ? `${result.savedCount}枚を写真に保存しました`
          : '写真に保存しました',
      body: '',
      autoDismissMs: 2500,
    };
  }

  switch (result.errorCode) {
    case 'permission_denied':
      return {
        title: '写真への保存が許可されていません',
        body: '設定アプリで「写真の追加」を許可してください。',
        showSettings: true,
      };
    case 'insufficient_storage':
      return {
        title: '端末の空き容量が不足しています',
        body: result.requiredBytes
          ? `保存には約 ${formatBytes(result.requiredBytes)} の空き容量が必要です。`
          : '空き容量を確保してからもう一度お試しください。',
      };
    case 'cancelled':
      return {
        title: '保存を中止しました',
        body:
          result.savedCount > 0
            ? `${result.savedCount}枚は保存済みです。`
            : '保存された写真はありません。',
      };
    case 'download_failed':
      return {
        title: '写真を取得できませんでした',
        body: '通信状況を確認して、もう一度お試しください。',
      };
    case 'too_many_items':
      return {
        title: '一度に保存できる枚数を超えています',
        body: '枚数を分けて保存してください。',
      };
    case 'manifest_failed':
      return {
        title: '保存の準備に失敗しました',
        body: '通信状況を確認して、もう一度お試しください。',
      };
    case 'invalid_url':
    case 'unauthorized':
      return {
        title: 'この写真は保存できません',
        body: 'リンクの有効期限が切れている可能性があります。お手数ですが、撮影担当者にお問い合わせください。',
      };
    default:
      return {
        title: '保存に失敗しました',
        body:
          result.savedCount > 0
            ? `${result.savedCount}枚は保存できましたが、${result.failedCount}枚は失敗しました。`
            : 'もう一度お試しください。',
      };
  }
}

export default function NativeSaveNotice({ result, onClose }: Props) {
  const notice = buildNotice(result);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!notice.autoDismissMs) return;
    const timer = window.setTimeout(onClose, notice.autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [notice.autoDismissMs, onClose]);

  // モーダル表示中はフォーカスを閉じ込め、閉じたら発火元へ戻す
  useEffect(() => {
    if (notice.autoDismissMs) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [notice.autoDismissMs, onClose]);

  // 成功時は控えめなトースト
  if (notice.autoDismissMs) {
    return (
      <ModalPortal>
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-ink text-white text-sm shadow-[0_8px_30px_rgba(0,0,0,0.18)]"
        >
          {notice.title}
        </div>
      </ModalPortal>
    );
  }

  return (
    <ModalPortal>
      <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="native-save-notice-title"
    >
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-bg p-6 border border-border shadow-[0_16px_48px_rgba(0,0,0,0.12)]">
        <h3 id="native-save-notice-title" className="text-base font-medium text-ink">
          {notice.title}
        </h3>
        {notice.body && (
          <p className="mt-2 text-sm text-muted leading-relaxed">{notice.body}</p>
        )}

        <div className="mt-5 flex gap-2">
          {notice.showSettings && (
            <button
              onClick={() => postToNative({ type: 'openSettings' })}
              className="flex-1 rounded-xl bg-ink text-white text-sm font-medium py-2.5 cursor-pointer transition-opacity duration-200 hover:opacity-90"
            >
              設定を開く
            </button>
          )}
          <button
            ref={closeRef}
            onClick={onClose}
            className="flex-1 rounded-xl border border-border text-ink text-sm font-medium py-2.5 cursor-pointer transition-colors duration-200 hover:bg-surface"
          >
            閉じる
          </button>
        </div>
      </div>
      </div>
    </ModalPortal>
  );
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.ceil(mb)} MB`;
}
