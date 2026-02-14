import {
  collection,
  doc,
  addDoc,
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
import { nanoid } from 'nanoid';

export interface Invitation {
  id: string;
  token: string;
  projectId?: string;
  clientName: string;
  clientEmail?: string;
  createdBy: string;
  imageIds: string[];
  expiresAt: Date;
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
}): Promise<Invitation> => {
  if (params.imageIds.length === 0) {
    throw new Error('imageIds must not be empty');
  }

  const token = nanoid(21);

  const docRef = await addDoc(collection(db, INVITATIONS_COLLECTION), {
    token,
    projectId: params.projectId,
    clientName: params.clientName,
    clientEmail: params.clientEmail || '',
    createdBy: params.createdBy,
    imageIds: params.imageIds,
    expiresAt: Timestamp.fromDate(params.expiresAt),
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
  updates: Partial<Pick<Invitation, 'clientName' | 'clientEmail' | 'imageIds' | 'isActive' | 'expiresAt'>>
): Promise<void> => {
  const docRef = doc(db, INVITATIONS_COLLECTION, id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = { updatedAt: serverTimestamp() };

  if (updates.clientName !== undefined) updateData.clientName = updates.clientName;
  if (updates.clientEmail !== undefined) updateData.clientEmail = updates.clientEmail;
  if (updates.imageIds !== undefined) updateData.imageIds = updates.imageIds;
  if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
  if (updates.expiresAt !== undefined) updateData.expiresAt = Timestamp.fromDate(updates.expiresAt);

  await updateDoc(docRef, updateData);
};

export const deleteInvitation = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, INVITATIONS_COLLECTION, id));
};

export const getGalleryUrl = (token: string): string => {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin.replace(':3001', ':3002') : 'http://localhost:3002';
  return `${baseUrl}/gallery/${token}`;
};
