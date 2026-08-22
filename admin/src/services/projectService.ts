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
import {
  getImagesByProject,
  deleteImagesForProject,
  type DeleteProgress,
} from './imageService';
import { getInvitationsByProject } from './invitationService';
import { createBatchWriter } from '../utils/batchWriter';
import dayjs from 'dayjs';

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

const INVITATIONS_COLLECTION = 'invitations';

/**
 * プロジェクトを削除する。画像・招待もまとめて消す。
 *
 * 順序を **招待 → 画像 → プロジェクト** に固定している。理由はそれぞれ違う。
 *
 * - **招待が最初**: アクセスを断つため。画像を先に消して途中で失敗すると、
 *   生きた招待リンクが空のギャラリーを指したまま残り、クライアントが
 *   「写真が消えた」画面を見ることになる。
 * - **プロジェクトが最後**: 途中で失敗しても一覧に残り、再実行できるようにするため。
 *
 * 画像の削除は deleteImagesForProject にまとめている。1枚ずつ deleteImage を
 * 呼ぶと、枚数分の招待取得と imageCount 更新が発生する（招待は既に消えているので
 * どちらも無駄）。
 *
 * @throws 画像の削除に失敗した場合。プロジェクトのドキュメントは残す。
 */
export const deleteProject = async (
  projectId: string,
  onProgress?: (progress: DeleteProgress) => void
): Promise<void> => {
  // 1. 招待を消す。アクセスを断つのが先。
  const invitations = await getInvitationsByProject(projectId);
  if (invitations.length > 0) {
    const writer = createBatchWriter(db);
    for (const invitation of invitations) {
      await writer.delete(doc(db, INVITATIONS_COLLECTION, invitation.id));
    }
    await writer.flush();
  }

  // 2. 画像と、それに紐づく Storage のファイル・お気に入りを消す。
  const images = await getImagesByProject(projectId);
  await deleteImagesForProject(projectId, images, onProgress);

  // 3. プロジェクト本体。ここまで来て初めて消す。
  await deleteDoc(doc(db, PROJECTS_COLLECTION, projectId));
};

export const PROJECT_LIFETIME_DAYS = 20;
const WARNING_DAYS = 7;
const DANGER_DAYS = 14;

export type ExpiryLevel = 'warning' | 'danger' | 'expired';

export interface ExpiryInfo {
  level: ExpiryLevel;
  daysRemaining: number;
  daysElapsed: number;
}

export const getProjectExpiryInfo = (project: Project): ExpiryInfo | null => {
  if (!project.createdAt || project.status === 'archived') return null;
  const elapsed = dayjs().diff(dayjs(project.createdAt), 'day');
  const remaining = PROJECT_LIFETIME_DAYS - elapsed;
  if (elapsed >= PROJECT_LIFETIME_DAYS) return { level: 'expired', daysRemaining: remaining, daysElapsed: elapsed };
  if (elapsed >= DANGER_DAYS) return { level: 'danger', daysRemaining: remaining, daysElapsed: elapsed };
  if (elapsed >= WARNING_DAYS) return { level: 'warning', daysRemaining: remaining, daysElapsed: elapsed };
  return null;
};
