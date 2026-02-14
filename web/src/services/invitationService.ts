import {
  collection,
  query,
  where,
  getDocs,
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

export const getInvitationByToken = async (token: string): Promise<Invitation | null> => {
  const q = query(
    collection(db, INVITATIONS_COLLECTION),
    where('token', '==', token)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  const data = docSnap.data();
  return {
    id: docSnap.id,
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
};

export const validateInvitation = (invitation: Invitation): { valid: boolean; reason?: string } => {
  if (!invitation.isActive) {
    return { valid: false, reason: 'このリンクは無効化されています。' };
  }
  if (invitation.expiresAt && new Date() > invitation.expiresAt) {
    return { valid: false, reason: 'このリンクの有効期限が切れています。' };
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

export const updateSessionAccess = async (uid: string): Promise<void> => {
  const ref = doc(db, SESSIONS_COLLECTION, uid);
  await updateDoc(ref, {
    lastAccessedAt: serverTimestamp(),
  });
};
