'use client';

import { useIsNativeShell } from '@/hooks/useIsNativeShell';
import { useDismissibleGuide } from '@/hooks/useDismissibleGuide';

const STORAGE_KEY = 'welcome_guide_dismissed';

export default function WelcomeGuide() {
  const { isNative } = useIsNativeShell();
  const { show, dismiss: handleDismiss } = useDismissibleGuide(STORAGE_KEY);

  if (!show) return null;

  const steps = [
    {
      num: 1,
      title: '閲覧',
      desc: '写真をタップして拡大表示。左右の矢印ボタンで切り替えできます。',
    },
    {
      num: 2,
      title: 'お気に入り',
      desc: '♡ ボタンでお気に入り登録。お気に入りページで一覧できます。',
    },
    {
      num: 3,
      title: 'ダウンロード',
      desc: isNative
        ? '保存ボタンで端末の写真アプリに直接保存できます。まとめて保存も可能です。'
        : 'お気に入りページからまとめて ZIP ダウンロードが可能です。',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleDismiss}
    >
      <div
        className="relative mx-4 w-full max-w-sm rounded-2xl bg-bg p-6 shadow-[0_16px_48px_rgba(0,0,0,0.12)] animate-fade-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif text-xl text-ink text-center mb-5">
          ギャラリーの使い方
        </h2>

        <div className="space-y-4">
          {steps.map((step) => (
            <div key={step.num} className="flex gap-3 items-start">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-surface flex items-center justify-center">
                <span className="text-xs font-medium text-ink">{step.num}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">{step.title}</p>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {isNative ? (
          <p className="text-xs text-muted mt-4 leading-relaxed">
            ※ 保存した写真は端末の写真アプリに追加されます。まとめて保存する場合は、完了するまでアプリを閉じないでください。
          </p>
        ) : (
          <>
            <p className="text-xs text-muted mt-4 leading-relaxed">
              ※ スマートフォンは機種・ブラウザにより保存方法が異なります。PC からのダウンロードを推奨します。
            </p>
            <p className="text-xs text-muted mt-2 leading-relaxed">
              ※ 推奨ブラウザ: Google Chrome。Safari では表示が不安定になる場合があります。
            </p>
          </>
        )}

        <button
          onClick={handleDismiss}
          className="mt-5 w-full rounded-xl bg-ink text-white text-sm font-medium py-3 cursor-pointer transition-opacity duration-200 hover:opacity-90 active:opacity-80"
        >
          ギャラリーを見る
        </button>
      </div>
    </div>
  );
}
