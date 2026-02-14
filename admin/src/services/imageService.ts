import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
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
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from '../lib/firebase';

export interface Image {
  id: string;
  projectId?: string;
  url: string;
  storagePath: string;
  title: string;
  description?: string;
  userId: string;
  likeCount: number;
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
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
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

  // Upload file to Storage
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  // Create document in Firestore with transaction to update project imageCount
  const imageDocRef = doc(collection(db, IMAGES_COLLECTION));
  const projectDocRef = doc(db, PROJECTS_COLLECTION, projectId);

  await runTransaction(db, async (transaction) => {
    const projectSnap = await transaction.get(projectDocRef);
    if (!projectSnap.exists()) {
      throw new Error('Project not found');
    }

    transaction.set(imageDocRef, {
      projectId,
      url,
      storagePath,
      title,
      description: description || '',
      userId,
      likeCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    transaction.update(projectDocRef, {
      imageCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  });

  const newDoc = await getDoc(imageDocRef);
  return docToImage(newDoc) as Image;
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

  // Use transaction to atomically delete image and update project count
  await runTransaction(db, async (transaction) => {
    const imageSnap = await transaction.get(imageDocRef);
    if (!imageSnap.exists()) {
      throw new Error('Image not found');
    }

    const imageData = imageSnap.data();
    const storagePath = imageData?.storagePath;
    const projectId = imageData?.projectId;

    // Delete from Storage (best-effort)
    if (storagePath) {
      const storageRef = ref(storage, storagePath);
      try {
        await deleteObject(storageRef);
      } catch (error) {
        console.warn('Failed to delete file from storage:', error);
      }
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
};

// Delete multiple images
export const deleteImages = async (imageIds: string[]): Promise<void> => {
  await Promise.all(imageIds.map((id) => deleteImage(id)));
};
