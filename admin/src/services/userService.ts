import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
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

// Get all users
export const getUsers = async (): Promise<User[]> => {
  const q = query(
    collection(db, USERS_COLLECTION),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((doc) => docToUser(doc))
    .filter((user): user is User => user !== null);
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
