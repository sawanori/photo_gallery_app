import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Invitation, Session } from '@/types';

const INVITATIONS_COLLECTION = 'invitations';
const SESSIONS_COLLECTION = 'sessions';

/**
 * 招待の取得結果。
 *
 * **コレクションクエリ（list）を使ってはいけない。** 招待ドキュメントの ID は
 * トークンそのものであり、単一ドキュメント取得（get）で引く。
 * `where('token','==',token)` で引く実装に戻すと list が必要になり、
 * その list を許可すると匿名認証しただけの第三者が招待を全件列挙して
 * トークンを平文で収穫できる状態に戻る（2026-08-17 に実際に列挙できることを確認した）。
 *
 * 「サーバーが拒否した」と「サーバーに届かなかった」を区別する。
 * 前者は確定した無効であり、ネイティブアプリに保存済みトークンを破棄させてよい。
 * 後者は一時障害であり、破棄すると電波の悪い場所でアプリを開いただけで
 * 有効なトークンが消える。
 *
 * **不存在と無効・期限切れは区別しない（できない）。** Firestore のルールが
 * `resource.data.isActive` を評価するため、ドキュメントが無い場合も
 * 評価に失敗して `permission-denied` になる。列挙対策としてもこれが正しい。
 *
 * `fromCache` は、取得がキャッシュ由来かどうか。古いデータで
 * 「期限切れ」と判断してトークンを破棄しないために呼び出し側が見る。
 */
export type InvitationLookup =
  | { status: 'found'; invitation: Invitation; fromCache: boolean }
  /** サーバーが拒否した。不存在・無効化・期限切れのいずれか */
  | { status: 'denied' }
  /** サーバーに届かなかった。オフライン等 */
  | { status: 'unavailable' };

export const lookupInvitation = async (token: string): Promise<InvitationLookup> => {
  let docSnap;
  try {
    docSnap = await getDoc(doc(db, INVITATIONS_COLLECTION, token));
  } catch (error) {
    const code = (error as { code?: string })?.code;
    return code === 'permission-denied' ? { status: 'denied' } : { status: 'unavailable' };
  }

  // ルールが `resource` に依存するため、匿名クライアントでここに来ることは無い想定。
  // 将来ルールが変わって「存在しない」が素通りしたときのために拒否として扱う。
  if (!docSnap.exists()) return { status: 'denied' };

  return {
    status: 'found',
    fromCache: docSnap.metadata.fromCache,
    invitation: toInvitation(docSnap.id, docSnap.data()),
  };
};

/** 既存の呼び出し互換。区別が要る場合は lookupInvitation を使う。 */
export const getInvitationByToken = async (token: string): Promise<Invitation | null> => {
  const result = await lookupInvitation(token);
  return result.status === 'found' ? result.invitation : null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toInvitation(id: string, data: any): Invitation {
  return {
    id,
    token: data.token,
    clientName: data.clientName,
    clientEmail: data.clientEmail,
    createdBy: data.createdBy,
    imageIds: data.imageIds || [],
    expiresAt: data.expiresAt?.toDate(),
    isActive: data.isActive,
    accessCount: data.accessCount || 0,
    lastAccessedAt: data.lastAccessedAt?.toDate(),
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
}

/**
 * 招待が閲覧可能かどうか。
 *
 * 理由の文言を1つに統一している。無効化・期限切れ・閲覧期限切れを撃ち分けると、
 * トークンが実在することを第三者に伝えてしまう。加えて Firestore ルール側でも
 * 無効・期限切れの招待は取得自体が拒否され、呼び出し側には「見つからない」として
 * 届くため、ここだけ細かく分けても利用者から見た文言は揃わない。
 */
export const INVALID_INVITATION_MESSAGE = 'このリンクは無効か、有効期限が切れています。';

export const validateInvitation = (invitation: Invitation): { valid: boolean; reason?: string } => {
  if (!invitation.isActive) {
    return { valid: false, reason: INVALID_INVITATION_MESSAGE };
  }
  if (invitation.expiresAt && new Date() > invitation.expiresAt) {
    return { valid: false, reason: INVALID_INVITATION_MESSAGE };
  }
  if (invitation.createdAt) {
    const viewingDeadline = new Date(invitation.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (new Date() > viewingDeadline) {
      return { valid: false, reason: INVALID_INVITATION_MESSAGE };
    }
  }
  return { valid: true };
};

export const createSession = async (uid: string, invitationId: string): Promise<void> => {
  await setDoc(doc(db, SESSIONS_COLLECTION, uid), {
    invitationId,
    anonymousUid: uid,
    createdAt: serverTimestamp(),
    lastAccessedAt: serverTimestamp(),
  });
};

export const getSession = async (uid: string): Promise<Session | null> => {
  const docSnap = await getDoc(doc(db, SESSIONS_COLLECTION, uid));
  if (!docSnap.exists()) return null;
  const data = docSnap.data();
  return {
    invitationId: data.invitationId,
    anonymousUid: data.anonymousUid,
    createdAt: data.createdAt?.toDate(),
    lastAccessedAt: data.lastAccessedAt?.toDate(),
  };
};

export const updateInvitationAccess = async (invitationId: string): Promise<void> => {
  const ref = doc(db, INVITATIONS_COLLECTION, invitationId);
  await updateDoc(ref, {
    accessCount: increment(1),
    lastAccessedAt: serverTimestamp(),
  });
};

/**
 * セッションが指す招待を貼り替える。
 *
 * createSession（setDoc）で作り直すと createdAt も書き換わり、
 * セッション更新のルール（lastAccessedAt と invitationId だけ変更可）に反する。
 * 変更するフィールドを絞った updateDoc を使う。
 */
export const updateSessionInvitation = async (
  uid: string,
  invitationId: string
): Promise<void> => {
  await updateDoc(doc(db, SESSIONS_COLLECTION, uid), {
    invitationId,
    lastAccessedAt: serverTimestamp(),
  });
};

export const updateSessionAccess = async (uid: string): Promise<void> => {
  const ref = doc(db, SESSIONS_COLLECTION, uid);
  await updateDoc(ref, {
    lastAccessedAt: serverTimestamp(),
  });
};
