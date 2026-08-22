/**
 * 招待の閲覧期限。**`web/src/utils/viewingWindow.ts` と同じ規則をここに写している。**
 *
 * 招待は `expiresAt` とは別に「作成から N 日」の閲覧期限を持ち、
 * **クライアントが実際にギャラリーを開けなくなるのはこちらである**
 * （`web/src/services/invitationService.ts` の `validateInvitation` が判定する）。
 *
 * 管理画面が `expiresAt` だけを「有効期限」として表示していたため、
 * 「有効期限 10月31日」と出ているのにクライアントは7日で見られなくなる、
 * という食い違いが起きていた（2026-08-22 に本番の招待で確認）。
 *
 * **web を変えたらここも変えること。** 共有パッケージが無いため写しになっている。
 * ずれると、表示と実際の期限が再び食い違う。
 */

export const DEFAULT_VIEWING_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 有効な閲覧日数に正規化する。
 * 1 以上の整数だけを受け付け、それ以外はすべて既定の 7 日に倒す。
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

/**
 * クライアントが実際に見られなくなる時刻。
 *
 * 閲覧期限（作成から N 日）と `expiresAt` の**早いほう**。
 * 管理画面はこれを見せる。片方だけ見せると必ず誤解を生む。
 */
export function effectiveDeadline(
  createdAt: Date | undefined,
  viewingDays: unknown,
  expiresAt: Date | undefined
): Date | null {
  const viewing = createdAt ? viewingDeadline(createdAt, viewingDays) : null;
  if (!viewing) return expiresAt ?? null;
  if (!expiresAt) return viewing;
  return viewing < expiresAt ? viewing : expiresAt;
}
