/**
 * 招待の閲覧期限。
 *
 * 招待は `expiresAt` とは別に「作成から N 日」の閲覧期限を持つ。
 * 既定は 7 日で、これは既存のすべての招待がこの前提で運用されてきたためである。
 * 招待ごとに `viewingDays` を持たせれば変えられる。
 *
 * **この期限は表示と便宜のための制御であって、写真へのアクセスを止める
 * 技術的な担保ではない。** 2026-08-21 に本番で実測して確認したとおり、
 *
 * - `images` は認証済みなら `imageId` だけで単体取得できる
 * - Storage の画像 URL は **認証なしで誰でも取得できる**（`storage.rules` が `allow read: if true`）
 *
 * つまり URL を知っている者は期限後も写真を取得できる。
 * 実効的な境界は `expiresAt` と `isActive`（Firestore ルールが評価する）、
 * および `/api/native/manifest` の認可だけである。
 * 契約上の閲覧期限を厳密に切りたい場合は `expiresAt` を使うこと。
 *
 * ここに集約している理由は、以前この 7 日が3か所（`validateInvitation`、
 * `manifestService.isUsable`、`Header` の表示）に別々に書かれており、
 * 1つ直して他を忘れると**表示と実際の期限がずれる**状態だったためである。
 */

export const DEFAULT_VIEWING_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 有効な閲覧日数に正規化する。
 *
 * 1 以上の整数だけを受け付け、それ以外（0・負数・小数・非数値・null・undefined）は
 * すべて既定の 7 日に倒す。**不正な値で期限が消えて無期限になることを避ける**のが目的で、
 * 緩く受けるより既定へ倒すほうが安全側に働く。
 */
export function normalizeViewingDays(viewingDays: unknown): number {
  if (typeof viewingDays !== 'number') return DEFAULT_VIEWING_DAYS;
  if (!Number.isInteger(viewingDays)) return DEFAULT_VIEWING_DAYS;
  if (viewingDays < 1) return DEFAULT_VIEWING_DAYS;
  return viewingDays;
}

/** 閲覧できる最後の時刻。 */
export function viewingDeadline(createdAt: Date, viewingDays?: unknown): Date {
  return new Date(createdAt.getTime() + normalizeViewingDays(viewingDays) * DAY_MS);
}

/** まだ閲覧期限内か。 */
export function isWithinViewingWindow(
  createdAt: Date,
  viewingDays?: unknown,
  now: Date = new Date()
): boolean {
  return now <= viewingDeadline(createdAt, viewingDays);
}
