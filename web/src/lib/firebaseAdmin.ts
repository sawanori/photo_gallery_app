import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

/**
 * 同意フォームのための Firebase Admin SDK。
 *
 * ギャラリー本体は `firebaseServer.ts`（クライアント SDK・匿名）で足りているが、
 * 同意フォームはそれでは作れない。理由は 2 つ。
 *
 * - 参加者の企業名・氏名・メールアドレスを保存する。匿名認証は誰でも得られるので、
 *   クライアント SDK で書ける場所は誰でも読める場所になりうる。`consentResponses` は
 *   ルールでクライアントからの読み書きを一切閉じ、ここからだけ書く。
 * - フォームの送信を受けて招待を発行する。招待の作成は管理者だけに許している。
 *
 * 認証情報は `FIREBASE_SERVICE_ACCOUNT_KEY`（サービスアカウント鍵の JSON をそのまま）。
 * エミュレータに向けるときは `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` を
 * 立てれば鍵は要らない（SDK が環境変数を見て自動で切り替える）。
 */

const ADMIN_APP_NAME = 'admin';

function adminApp(): App {
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME);
  if (existing) return existing;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (key) {
    return initializeApp({ credential: cert(JSON.parse(key)), projectId }, ADMIN_APP_NAME);
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId }, ADMIN_APP_NAME);
  }
  throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY が設定されていません。');
}

export function getAdminDb(): Firestore {
  return getFirestore(adminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(adminApp());
}
