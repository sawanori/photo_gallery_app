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
  limit,
  startAfter,
  where,
  serverTimestamp,
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from '../config/firebase';

export interface Image {
  id: string;
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
}

const IMAGES_COLLECTION = 'images';
const PAGE_SIZE = 10;

// Convert Firestore document to Image object
const docToImage = (doc: DocumentSnapshot): Image | null => {
  const data = doc.data();
  if (!data) return null;

  return {
    id: doc.id,
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

// Get paginated images
export const getImages = async (
  lastDoc?: QueryDocumentSnapshot | null,
  pageSize: number = PAGE_SIZE
): Promise<PaginatedImages> => {
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
    .map((doc) => docToImage(doc))
    .filter((img): img is Image => img !== null);

  return {
    images,
    lastDoc: docs.length > 0 ? docs[Math.min(docs.length - 1, pageSize - 1)] : null,
    hasMore,
  };
};

// Get images by user
export const getImagesByUser = async (userId: string): Promise<Image[]> => {
  const q = query(
    collection(db, IMAGES_COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((doc) => docToImage(doc))
    .filter((img): img is Image => img !== null);
};

// Get single image
export const getImage = async (imageId: string): Promise<Image | null> => {
  const docRef = doc(db, IMAGES_COLLECTION, imageId);
  const docSnap = await getDoc(docRef);
  return docToImage(docSnap);
};

// Upload image
export const uploadImage = async (
  userId: string,
  file: Blob,
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

  // Create document in Firestore
  const docRef = await addDoc(collection(db, IMAGES_COLLECTION), {
    url,
    storagePath,
    title,
    description: description || '',
    userId,
    likeCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const newDoc = await getDoc(docRef);
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

// Delete image
export const deleteImage = async (imageId: string): Promise<void> => {
  // Get image to find storage path
  const image = await getImage(imageId);
  if (!image) throw new Error('Image not found');

  // Delete from Storage
  const storageRef = ref(storage, image.storagePath);
  try {
    await deleteObject(storageRef);
  } catch (error) {
    console.warn('Failed to delete file from storage:', error);
  }

  // Delete from Firestore
  await deleteDoc(doc(db, IMAGES_COLLECTION, imageId));
};
