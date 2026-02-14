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
  Timestamp,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getImagesByProject, deleteImage } from './imageService';
import { getInvitationsByProject, deleteInvitation } from './invitationService';

export type ProjectStatus = 'active' | 'delivered' | 'archived';

export interface Project {
  id: string;
  name: string;
  clientName: string;
  clientEmail?: string;
  shootingDate?: Date;
  shootingLocation?: string;
  description?: string;
  status: ProjectStatus;
  coverImageUrl?: string;
  imageCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const PROJECTS_COLLECTION = 'projects';

const docToProject = (docSnap: DocumentSnapshot): Project | null => {
  const data = docSnap.data();
  if (!data) return null;

  return {
    id: docSnap.id,
    name: data.name,
    clientName: data.clientName,
    clientEmail: data.clientEmail,
    shootingDate: data.shootingDate?.toDate(),
    shootingLocation: data.shootingLocation,
    description: data.description,
    status: data.status,
    coverImageUrl: data.coverImageUrl,
    imageCount: data.imageCount || 0,
    createdBy: data.createdBy,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
};

export const createProject = async (params: {
  name: string;
  clientName: string;
  clientEmail?: string;
  shootingDate?: Date;
  shootingLocation?: string;
  description?: string;
  createdBy: string;
}): Promise<Project> => {
  if (!params.name.trim()) {
    throw new Error('Project name is required');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docData: Record<string, any> = {
    name: params.name,
    clientName: params.clientName,
    clientEmail: params.clientEmail || '',
    shootingLocation: params.shootingLocation || '',
    description: params.description || '',
    status: 'active' as ProjectStatus,
    imageCount: 0,
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (params.shootingDate) {
    docData.shootingDate = Timestamp.fromDate(params.shootingDate);
  }

  const docRef = await addDoc(collection(db, PROJECTS_COLLECTION), docData);
  const newDoc = await getDoc(docRef);
  return docToProject(newDoc) as Project;
};

export const getProjects = async (status?: ProjectStatus): Promise<Project[]> => {
  let q;
  if (status) {
    q = query(
      collection(db, PROJECTS_COLLECTION),
      where('status', '==', status),
      orderBy('createdAt', 'desc')
    );
  } else {
    q = query(
      collection(db, PROJECTS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => docToProject(d))
    .filter((p): p is Project => p !== null);
};

export const getProject = async (projectId: string): Promise<Project | null> => {
  const docRef = doc(db, PROJECTS_COLLECTION, projectId);
  const docSnap = await getDoc(docRef);
  return docToProject(docSnap);
};

export const updateProject = async (
  projectId: string,
  updates: Partial<Pick<Project, 'name' | 'clientName' | 'clientEmail' | 'shootingDate' | 'shootingLocation' | 'description' | 'status' | 'coverImageUrl'>>
): Promise<void> => {
  const docRef = doc(db, PROJECTS_COLLECTION, projectId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = { updatedAt: serverTimestamp() };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.clientName !== undefined) updateData.clientName = updates.clientName;
  if (updates.clientEmail !== undefined) updateData.clientEmail = updates.clientEmail;
  if (updates.shootingDate !== undefined) updateData.shootingDate = Timestamp.fromDate(updates.shootingDate);
  if (updates.shootingLocation !== undefined) updateData.shootingLocation = updates.shootingLocation;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.coverImageUrl !== undefined) updateData.coverImageUrl = updates.coverImageUrl;

  await updateDoc(docRef, updateData);
};

export const deleteProject = async (projectId: string): Promise<void> => {
  // Cascade delete: images
  const images = await getImagesByProject(projectId);
  for (const image of images) {
    try {
      await deleteImage(image.id);
    } catch (error) {
      console.warn(`Failed to delete image ${image.id}:`, error);
    }
  }

  // Cascade delete: invitations
  const invitations = await getInvitationsByProject(projectId);
  for (const invitation of invitations) {
    try {
      await deleteInvitation(invitation.id);
    } catch (error) {
      console.warn(`Failed to delete invitation ${invitation.id}:`, error);
    }
  }

  // Delete project document
  const docRef = doc(db, PROJECTS_COLLECTION, projectId);
  await deleteDoc(docRef);
};
