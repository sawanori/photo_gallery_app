import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin';
  /**
   * Console で手作りした管理者のドキュメントには無いことがある。
   * 型を必須にしていたため、無い場合に `undefined` が入るのを見落としていた。
   */
  createdAt?: Date;
  updatedAt?: Date;
}

const USERS_COLLECTION = 'users';

// Convert Firestore document to User object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const docToUser = (doc: { id: string; data: () => any }): User | null => {
  const data = doc.data();
  if (!data) return null;

  return {
    id: doc.id,
    email: data.email,
    role: data.role,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
};

// Get total count of users
export const getUsersCount = async (): Promise<number> => {
  const coll = collection(db, USERS_COLLECTION);
  const snapshot = await getCountFromServer(coll);
  return snapshot.data().count;
};

/** 並べ替えに使う createdAt。持たないドキュメントは null。 */
const createdAtTime = (user: User): number | null => {
  const time = user.createdAt?.getTime();
  return typeof time === 'number' && Number.isFinite(time) ? time : null;
};

/**
 * 全ユーザーを新しい順で取得する。
 *
 * **`orderBy('createdAt')` は使わない。** Firestore はその項目を持たない
 * ドキュメントを結果から丸ごと落とすため、Console で手作りした管理者
 * （createdAt を書き忘れたもの）が一覧に出てこなかった。
 * 並べ替えはクライアント側で行い、createdAt が無いものは末尾に置く。
 */
export const getUsers = async (): Promise<User[]> => {
  const snapshot = await getDocs(collection(db, USERS_COLLECTION));
  const users = snapshot.docs
    .map((doc) => docToUser(doc))
    .filter((user): user is User => user !== null);

  return users.sort((a, b) => {
    const aTime = createdAtTime(a);
    const bTime = createdAtTime(b);
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return bTime - aTime;
  });
};

// Get single user
export const getUser = async (userId: string): Promise<User | null> => {
  const docRef = doc(db, USERS_COLLECTION, userId);
  const docSnap = await getDoc(docRef);
  return docToUser(docSnap);
};

// Update user role
export const updateUserRole = async (
  userId: string,
  role: 'user' | 'admin'
): Promise<void> => {
  const docRef = doc(db, USERS_COLLECTION, userId);
  await updateDoc(docRef, {
    role,
    updatedAt: serverTimestamp(),
  });
};

// Delete user (only from Firestore, not from Auth)
export const deleteUser = async (userId: string): Promise<void> => {
  await deleteDoc(doc(db, USERS_COLLECTION, userId));
};

// Get dashboard stats
export const getDashboardStats = async (): Promise<{
  totalUsers: number;
  totalAdmins: number;
}> => {
  const users = await getUsers();
  const totalUsers = users.length;
  const totalAdmins = users.filter((u) => u.role === 'admin').length;

  return { totalUsers, totalAdmins };
};
