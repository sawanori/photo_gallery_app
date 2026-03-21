import {
  doc,
  getDoc,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Image } from '@/types';

const IMAGES_COLLECTION = 'images';

const docToImage = (docSnap: DocumentSnapshot): Image | null => {
  const data = docSnap.data();
  if (!data) return null;

  return {
    id: docSnap.id,
    url: data.url,
    storagePath: data.storagePath,
    title: data.title,
    description: data.description,
    userId: data.userId,
    likeCount: data.likeCount || 0,
    thumbnails: data.thumbnails,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
};

export const getImagesByIds = async (imageIds: string[]): Promise<Image[]> => {
  if (imageIds.length === 0) return [];

  // Firestore 'in' queries support max 30 items, batch if needed
  const batchSize = 30;
  const images: Image[] = [];

  for (let i = 0; i < imageIds.length; i += batchSize) {
    const batch = imageIds.slice(i, i + batchSize);
    const promises = batch.map((id) => getDoc(doc(db, IMAGES_COLLECTION, id)));
    const docs = await Promise.all(promises);

    for (const docSnap of docs) {
      const image = docToImage(docSnap);
      if (image) images.push(image);
    }
  }

  // Sort by createdAt desc
  images.sort((a, b) => {
    const aTime = a.createdAt?.getTime() || 0;
    const bTime = b.createdAt?.getTime() || 0;
    return bTime - aTime;
  });

  return images;
};

/** Fetch images by IDs, preserving input order (no sort). */
export const getImagesByIdsOrdered = async (imageIds: string[]): Promise<Image[]> => {
  if (imageIds.length === 0) return [];

  const batchSize = 30;
  const imageMap = new Map<string, Image>();

  for (let i = 0; i < imageIds.length; i += batchSize) {
    const batch = imageIds.slice(i, i + batchSize);
    const promises = batch.map((id) => getDoc(doc(db, IMAGES_COLLECTION, id)));
    const docs = await Promise.all(promises);

    for (const docSnap of docs) {
      const image = docToImage(docSnap);
      if (image) imageMap.set(image.id, image);
    }
  }

  // Return in input order
  return imageIds.reduce<Image[]>((acc, id) => {
    const img = imageMap.get(id);
    if (img) acc.push(img);
    return acc;
  }, []);
};

export const getImageById = async (imageId: string): Promise<Image | null> => {
  const docSnap = await getDoc(doc(db, IMAGES_COLLECTION, imageId));
  return docToImage(docSnap);
};
