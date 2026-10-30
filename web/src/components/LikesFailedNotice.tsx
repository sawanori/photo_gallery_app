'use client';

/** お気に入りの一覧を読み込めなかったときの表示。「0 枚」と見分けられるようにする。 */
export default function LikesFailedNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm text-ink">
      <p>お気に入りを読み込めませんでした</p>
      <button onClick={onRetry} className="shrink-0 underline cursor-pointer">
        再試行
      </button>
    </div>
  );
}
