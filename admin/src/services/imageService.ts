import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  serverTimestamp,
  increment,
  runTransaction,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  getCountFromServer,
  arrayRemove,
  arrayUnion,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { generateThumbnails } from '../utils/thumbnailGenerator';
import {
  getInvitationsByProject,
  getActiveInvitationsByProject,
} from './invitationService';

export interface Image {
  id: string;
  projectId?: string;
  url: string;
  storagePath: string;
  title: string;
  description?: string;
  userId: string;
  likeCount: number;
  thumbnails?: {
    small: string;
    medium: string;
  };
  thumbnailPaths?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedImages {
  images: Image[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
  total: number;
}

const IMAGES_COLLECTION = 'images';
const PROJECTS_COLLECTION = 'projects';
const LIKES_COLLECTION = 'likes';
const PAGE_SIZE = 20;

// Convert Firestore document to Image object
const docToImage = (docSnap: DocumentSnapshot): Image | null => {
  const data = docSnap.data();
  if (!data) return null;

  return {
    id: docSnap.id,
    projectId: data.projectId,
    url: data.url,
    storagePath: data.storagePath,
    title: data.title,
    description: data.description,
    userId: data.userId,
    likeCount: data.likeCount || 0,
    thumbnails: data.thumbnails,
    thumbnailPaths: data.thumbnailPaths,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
};

const INVITATIONS_COLLECTION = 'invitations';

/**
 * 削除された画像IDを全招待から除去（アトミック操作）
 * arrayRemoveは対象値が存在しない場合no-opのため、フィルタ不要
 */
const syncInvitationsOnImageDelete = async (
  projectId: string,
  deletedImageId: string
): Promise<void> => {
  try {
    const invitations = await getInvitationsByProject(projectId);
    await Promise.all(
      invitations.map((inv) =>
        updateDoc(doc(db, INVITATIONS_COLLECTION, inv.id), {
          imageIds: arrayRemove(deletedImageId),
          updatedAt: serverTimestamp(),
        }).catch((error) =>
          console.warn(`Failed to sync invitation ${inv.id} on delete:`, error)
        )
      )
    );
  } catch (error) {
    console.warn('Failed to sync invitations on image delete:', error);
  }
};

/**
 * 新画像IDをアクティブ招待に追加（アトミック操作）
 * arrayUnionは重複追加を防ぐ
 */
const syncInvitationsOnImageUpload = async (
  projectId: string,
  newImageId: string
): Promise<void> => {
  try {
    const activeInvitations = await getActiveInvitationsByProject(projectId);
    if (activeInvitations.length === 0) return;
    await Promise.all(
      activeInvitations.map((inv) =>
        updateDoc(doc(db, INVITATIONS_COLLECTION, inv.id), {
          imageIds: arrayUnion(newImageId),
          updatedAt: serverTimestamp(),
        }).catch((error) =>
          console.warn(`Failed to sync invitation ${inv.id} on upload:`, error)
        )
      )
    );
  } catch (error) {
    console.warn('Failed to sync invitations on image upload:', error);
  }
};

// Get total count of images
export const getImagesCount = async (): Promise<number> => {
  const coll = collection(db, IMAGES_COLLECTION);
  const snapshot = await getCountFromServer(coll);
  return snapshot.data().count;
};

// Get paginated images
export const getImages = async (
  lastDoc?: QueryDocumentSnapshot | null,
  pageSize: number = PAGE_SIZE
): Promise<PaginatedImages> => {
  const total = await getImagesCount();

  let q = query(
    collection(db, IMAGES_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(pageSize + 1)
  );

  if (lastDoc) {
    q = query(
      collection(db, IMAGES_COLLECTION),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(pageSize + 1)
    );
  }

  const snapshot = await getDocs(q);
  const docs = snapshot.docs;
  const hasMore = docs.length > pageSize;

  const images = docs
    .slice(0, pageSize)
    .map((d) => docToImage(d))
    .filter((img): img is Image => img !== null);

  return {
    images,
    lastDoc: docs.length > 0 ? docs[Math.min(docs.length - 1, pageSize - 1)] : null,
    hasMore,
    total,
  };
};

// Get images by project ID
export const getImagesByProject = async (projectId: string): Promise<Image[]> => {
  const q = query(
    collection(db, IMAGES_COLLECTION),
    where('projectId', '==', projectId),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => docToImage(d))
    .filter((img): img is Image => img !== null);
};

// Get single image
export const getImage = async (imageId: string): Promise<Image | null> => {
  const docRef = doc(db, IMAGES_COLLECTION, imageId);
  const docSnap = await getDoc(docRef);
  return docToImage(docSnap);
};

// Upload image with project association (transaction for imageCount sync)
export const uploadImage = async (
  projectId: string,
  userId: string,
  file: File,
  title: string,
  description?: string
): Promise<Image> => {
  // Generate unique filename
  const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const storagePath = `images/${userId}/${filename}`;
  const storageRef = ref(storage, storagePath);

  // Generate thumbnails + upload original in parallel
  const metadata = { contentType: file.type || 'image/jpeg' };
  const webpMeta = { contentType: 'image/webp' };

  let thumbnailData: { small: string; medium: string } | undefined;
  let thumbnailPaths: string[] | undefined;

  const [, thumbnailResults] = await Promise.all([
    uploadBytes(storageRef, file, metadata),
    generateThumbnails(file).catch((err) => {
      console.warn('Thumbnail generation failed, continuing without:', err);
      return [];
    }),
  ]);

  // Upload thumbnails + get original URL in parallel
  const thumbnailUploads = thumbnailResults.map(async (thumb) => {
    const thumbPath = `thumbnails/${userId}/${filename}_${thumb.width}.webp`;
    const thumbRef = ref(storage, thumbPath);
    await uploadBytes(thumbRef, thumb.blob, webpMeta);
    const thumbUrl = await getDownloadURL(thumbRef);
    return { name: thumb.name, url: thumbUrl, path: thumbPath };
  });

  const [url, ...thumbResults] = await Promise.all([
    getDownloadURL(storageRef),
    ...thumbnailUploads,
  ]);

  if (thumbResults.length > 0) {
    thumbnailData = { small: '', medium: '' };
    thumbnailPaths = [];
    for (const t of thumbResults) {
      thumbnailData[t.name] = t.url;
      thumbnailPaths.push(t.path);
    }
  }

  // Create document in Firestore with transaction to update project imageCount
  const imageDocRef = doc(collection(db, IMAGES_COLLECTION));
  const projectDocRef = doc(db, PROJECTS_COLLECTION, projectId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageData: Record<string, any> = {
    projectId,
    url,
    storagePath,
    title,
    description: description || '',
    userId,
    likeCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (thumbnailData) {
    imageData.thumbnails = thumbnailData;
    imageData.thumbnailPaths = thumbnailPaths;
  }

  await runTransaction(db, async (transaction) => {
    const projectSnap = await transaction.get(projectDocRef);
    if (!projectSnap.exists()) {
      throw new Error('Project not found');
    }

    transaction.set(imageDocRef, imageData);

    transaction.update(projectDocRef, {
      imageCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  });

  const newDoc = await getDoc(imageDocRef);
  const newImage = docToImage(newDoc) as Image;

  // トランザクション成功後にベストエフォートで招待同期
  await syncInvitationsOnImageUpload(projectId, newImage.id);

  return newImage;
};

// Update image
export const updateImage = async (
  imageId: string,
  updates: { title?: string; description?: string }
): Promise<void> => {
  const docRef = doc(db, IMAGES_COLLECTION, imageId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

// Delete image with transaction for imageCount sync
export const deleteImage = async (imageId: string): Promise<void> => {
  const imageDocRef = doc(db, IMAGES_COLLECTION, imageId);
  let projectId: string | undefined;

  // Use transaction to atomically delete image and update project count
  await runTransaction(db, async (transaction) => {
    const imageSnap = await transaction.get(imageDocRef);
    if (!imageSnap.exists()) {
      throw new Error('Image not found');
    }

    const imageData = imageSnap.data();
    const storagePath = imageData?.storagePath;
    projectId = imageData?.projectId;
    const thumbPaths: string[] = imageData?.thumbnailPaths || [];

    // Delete from Storage (best-effort)
    if (storagePath) {
      const storageRef = ref(storage, storagePath);
      try {
        await deleteObject(storageRef);
      } catch (error) {
        console.warn('Failed to delete file from storage:', error);
      }
    }

    // Delete thumbnails (best-effort)
    for (const tp of thumbPaths) {
      try {
        await deleteObject(ref(storage, tp));
      } catch (error) {
        console.warn('Failed to delete thumbnail from storage:', error);
      }
    }

    // Delete associated likes (best-effort, outside transaction)
    try {
      const likesQuery = query(
        collection(db, LIKES_COLLECTION),
        where('imageId', '==', imageId)
      );
      const likesSnapshot = await getDocs(likesQuery);
      for (const likeDoc of likesSnapshot.docs) {
        await deleteDoc(doc(db, LIKES_COLLECTION, likeDoc.id));
      }
    } catch (error) {
      console.warn('Failed to delete likes for image:', error);
    }

    // Delete image document
    transaction.delete(imageDocRef);

    // Update project imageCount if projectId exists
    if (projectId) {
      const projectDocRef = doc(db, PROJECTS_COLLECTION, projectId);
      transaction.update(projectDocRef, {
        imageCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    }
  });

  // トランザクション成功後にベストエフォートで招待同期
  if (projectId) {
    await syncInvitationsOnImageDelete(projectId, imageId);
  }
};

// Delete multiple images
export const deleteImages = async (imageIds: string[]): Promise<void> => {
  await Promise.all(imageIds.map((id) => deleteImage(id)));
};
