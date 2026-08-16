import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Route Handler から Firestore を読むための初期化。
 *
 * ブラウザ用の `@/lib/firebase` とは別のアプリインスタンスを使う。
 * 同じインスタンスを共有すると、サーバー側の匿名サインインが
 * クライアント側の認証状態と混ざる。
 *
 * Firebase Admin SDK ではなくクライアント SDK を使っている理由:
 * 読み取りたいのは `invitations` と `images` だけで、どちらも認証済みユーザーなら
 * 読める。認可（この imageId がこの招待に属するか）は Firestore ルールではなく
 * Route Handler 側のコードで判定するため、Admin 権限は不要である。
 * サービスアカウント鍵を新たに運用に持ち込まずに済む利点を採った。
 *
 * トレードオフ: サーバーのコールドスタートごとに匿名ユーザーが1つ増える。
 * 数が問題になる、または将来ルールを匿名不可に締める場合は Admin SDK へ移行する。
 */

const SERVER_APP_NAME = 'server';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function serverApp(): FirebaseApp {
  const existing = getApps().find((app) => app.name === SERVER_APP_NAME);
  if (existing) return existing;
  try {
    return initializeApp(firebaseConfig, SERVER_APP_NAME);
  } catch {
    return getApp(SERVER_APP_NAME);
  }
}

let signInPromise: Promise<void> | null = null;

/** サーバーインスタンスごとに一度だけ匿名サインインする。 */
async function ensureSignedIn(auth: Auth): Promise<void> {
  if (auth.currentUser) return;
  if (!signInPromise) {
    signInPromise = signInAnonymously(auth)
      .then(() => undefined)
      .catch((error) => {
        // 失敗したら次のリクエストで再試行できるようにキャッシュを捨てる
        signInPromise = null;
        throw error;
      });
  }
  await signInPromise;
}

/** 認証済みの Firestore ハンドルを返す。 */
export async function getServerDb(): Promise<Firestore> {
  const app = serverApp();
  await ensureSignedIn(getAuth(app));
  return getFirestore(app);
}
