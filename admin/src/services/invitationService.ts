import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  getCountFromServer,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { normalizeViewingDays } from '../utils/viewingWindow';
import { customAlphabet } from 'nanoid';

/**
 * 招待トークンに使う文字。nanoid の既定から `_` を除いてある。
 *
 * トークンはそのまま Firestore のドキュメント ID になる。Firestore は
 * `__` で始まり `__` で終わる ID を予約しており、`_` を含めると
 * ごく稀にそのような ID が生成されて書き込みが失敗する。
 */
const TOKEN_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-';
const generateToken = customAlphabet(TOKEN_ALPHABET, 21);

export interface Invitation {
  id: string;
  token: string;
  projectId?: string;
  clientName: string;
  clientEmail?: string;
  createdBy: string;
  imageIds: string[];
  expiresAt: Date;
  /**
   * 閲覧できる日数（作成日から）。未設定なら 7 日として扱われる。
   * **クライアントが実際に見られなくなるのはこちらで、expiresAt ではない**
   * （web/src/services/invitationService.ts の validateInvitation が判定する）。
   */
  viewingDays?: number;
  isActive: boolean;
  accessCount: number;
  lastAccessedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const INVITATIONS_COLLECTION = 'invitations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const docToInvitation = (docSnap: { id: string; data: () => any }): Invitation | null => {
  const data = docSnap.data();
  if (!data) return null;

  return {
    id: docSnap.id,
    token: data.token,
    projectId: data.projectId,
    clientName: data.clientName,
    clientEmail: data.clientEmail,
    createdBy: data.createdBy,
    imageIds: data.imageIds || [],
    expiresAt: data.expiresAt?.toDate(),
    viewingDays: data.viewingDays,
    isActive: data.isActive ?? true,
    accessCount: data.accessCount || 0,
    lastAccessedAt: data.lastAccessedAt?.toDate(),
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
};

export const getInvitationsCount = async (): Promise<number> => {
  const coll = collection(db, INVITATIONS_COLLECTION);
  const snapshot = await getCountFromServer(coll);
  return snapshot.data().count;
};

export const getActiveInvitationsCount = async (): Promise<number> => {
  const q = query(
    collection(db, INVITATIONS_COLLECTION),
    where('isActive', '==', true)
  );
  const snapshot = await getCountFromServer(q);
  return snapshot.data().count;
};

// Get invitations by project ID
export const getInvitationsByProject = async (projectId: string): Promise<Invitation[]> => {
  const q = query(
    collection(db, INVITATIONS_COLLECTION),
    where('projectId', '==', projectId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => docToInvitation(d))
    .filter((inv): inv is Invitation => inv !== null);
};

// Get active invitations by project ID
export const getActiveInvitationsByProject = async (projectId: string): Promise<Invitation[]> => {
  const q = query(
    collection(db, INVITATIONS_COLLECTION),
    where('projectId', '==', projectId),
    where('isActive', '==', true),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => docToInvitation(d))
    .filter((inv): inv is Invitation => inv !== null);
};

export const getInvitation = async (id: string): Promise<Invitation | null> => {
  const docSnap = await getDoc(doc(db, INVITATIONS_COLLECTION, id));
  return docToInvitation(docSnap);
};

export const createInvitation = async (params: {
  projectId: string;
  clientName: string;
  clientEmail?: string;
  createdBy: string;
  imageIds: string[];
  expiresAt: Date;
  /** 省略時は web 側の既定（7 日）が適用される。 */
  viewingDays?: number;
}): Promise<Invitation> => {
  if (params.imageIds.length === 0) {
    throw new Error('imageIds must not be empty');
  }

  // トークンをドキュメント ID にする。
  //
  // web はこの ID で単一ドキュメント取得（get）して招待を引く。
  // 以前は `where('token','==',token)` のコレクションクエリで引いていたが、
  // それだと list を許可する必要があり、匿名認証しただけの第三者が招待を
  // 全件列挙してトークンを平文で収穫できる状態になる
  // （2026-08-17 に実際に列挙できることを確認した）。
  const token = generateToken();

  const docRef = doc(db, INVITATIONS_COLLECTION, token);
  await setDoc(docRef, {
    token,
    projectId: params.projectId,
    clientName: params.clientName,
    clientEmail: params.clientEmail || '',
    createdBy: params.createdBy,
    imageIds: params.imageIds,
    expiresAt: Timestamp.fromDate(params.expiresAt),
    viewingDays: normalizeViewingDays(params.viewingDays),
    isActive: true,
    accessCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const newDoc = await getDoc(docRef);
  return docToInvitation(newDoc) as Invitation;
};

export const updateInvitation = async (
  id: string,
  updates: Partial<Pick<Invitation, 'clientName' | 'clientEmail' | 'imageIds' | 'isActive' | 'expiresAt' | 'viewingDays'>>
): Promise<void> => {
  const docRef = doc(db, INVITATIONS_COLLECTION, id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = { updatedAt: serverTimestamp() };

  if (updates.clientName !== undefined) updateData.clientName = updates.clientName;
  if (updates.clientEmail !== undefined) updateData.clientEmail = updates.clientEmail;
  if (updates.imageIds !== undefined) updateData.imageIds = updates.imageIds;
  if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
  if (updates.expiresAt !== undefined) updateData.expiresAt = Timestamp.fromDate(updates.expiresAt);
  if (updates.viewingDays !== undefined) updateData.viewingDays = normalizeViewingDays(updates.viewingDays);

  await updateDoc(docRef, updateData);
};

export const deleteInvitation = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, INVITATIONS_COLLECTION, id));
};

/** 開発機だけで許すホスト。ここ以外では推測でギャラリーの URL を組み立てない。 */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

export const MISSING_WEB_URL_MESSAGE =
  'NEXT_PUBLIC_WEB_URL が設定されていないため、ギャラリーの URL を作れません。Vercel の環境変数に本番のギャラリー URL を設定してください。';

/**
 * クライアントに渡すギャラリーの URL。
 *
 * `NEXT_PUBLIC_WEB_URL` が未設定のとき、以前は
 * `window.location.origin.replace(':3001', ':3002')` に落としていた。
 * 開発機では意図どおり動くが、**本番（Vercel）ではポートが無いので置換が効かず**、
 * 管理画面のドメインを指す `https://<admin>/gallery/<token>` を黙って発行していた。
 * クライアントには 404 のリンクが届く。
 *
 * localhost 以外で未設定なら例外にする。**間違った URL を配るより失敗させる。**
 *
 * @throws 未設定かつ localhost 以外の場合。呼び出し元は画面に出すこと。
 */
export const getGalleryUrl = (token: string): string => {
  const configured = process.env.NEXT_PUBLIC_WEB_URL;
  if (configured) return `${configured}/gallery/${token}`;

  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  if (!LOCAL_HOSTNAMES.has(hostname)) {
    throw new Error(MISSING_WEB_URL_MESSAGE);
  }

  return `${window.location.origin.replace(':3001', ':3002')}/gallery/${token}`;
};
