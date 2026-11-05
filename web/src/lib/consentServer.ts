import { getAdminDb } from '@/lib/firebaseAdmin';
import { sendMail } from '@/lib/mailer';
import type { ConsentDeps } from '@/services/consentService';

/**
 * メールに載せるギャラリーのオリジン。
 *
 * 本番では `GALLERY_ORIGIN` を必須にする。リクエストのオリジンに頼ると、
 * `*.vercel.app` から送ったときにその URL がメールに載る。そのドメインは
 * アプリのユニバーサルリンク / App Links の対象外なので、NT-photo で開けない。
 * **間違った URL を配るより失敗させる**（admin の getGalleryUrl と同じ方針）。
 */
export function galleryOrigin(requestOrigin: string): string {
  const configured = process.env.GALLERY_ORIGIN;
  if (configured) return configured.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('GALLERY_ORIGIN が設定されていません。');
  }
  return requestOrigin;
}

export function consentDeps(requestOrigin: string): ConsentDeps {
  return { db: getAdminDb(), sendMail, galleryOrigin: galleryOrigin(requestOrigin) };
}
