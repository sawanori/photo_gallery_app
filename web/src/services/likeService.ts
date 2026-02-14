import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  increment,
  runTransaction,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const LIKES_COLLECTION = 'likes';
const IMAGES_COLLECTION = 'images';

const getLikeId = (userId: string, imageId: string): string => {
  return `${userId}_${imageId}`;
};

export const hasLiked = async (userId: string, imageId: string): Promise<boolean> => {
  const likeId = getLikeId(userId, imageId);
  const docRef = doc(db, LIKES_COLLECTION, likeId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists();
};

export const likeImage = async (userId: string, imageId: string): Promise<void> => {
  const likeId = getLikeId(userId, imageId);
  const likeRef = doc(db, LIKES_COLLECTION, likeId);
  const imageRef = doc(db, IMAGES_COLLECTION, imageId);

  await runTransaction(db, async (transaction) => {
    const likeDoc = await transaction.get(likeRef);
    if (likeDoc.exists()) throw new Error('Already liked');

    transaction.set(likeRef, {
      userId,
      imageId,
      createdAt: serverTimestamp(),
    });
    transaction.update(imageRef, {
      likeCount: increment(1),
    });
  });
};

export const unlikeImage = async (userId: string, imageId: string): Promise<void> => {
  const likeId = getLikeId(userId, imageId);
  const likeRef = doc(db, LIKES_COLLECTION, likeId);
  const imageRef = doc(db, IMAGES_COLLECTION, imageId);

  await runTransaction(db, async (transaction) => {
    const likeDoc = await transaction.get(likeRef);
    if (!likeDoc.exists()) throw new Error('Not liked');

    transaction.delete(likeRef);
    transaction.update(imageRef, {
      likeCount: increment(-1),
    });
  });
};

export const toggleLike = async (userId: string, imageId: string): Promise<boolean> => {
  const liked = await hasLiked(userId, imageId);
  if (liked) {
    await unlikeImage(userId, imageId);
    return false;
  } else {
    await likeImage(userId, imageId);
    return true;
  }
};

export const getLikedImageIds = async (userId: string): Promise<string[]> => {
  const q = query(
    collection(db, LIKES_COLLECTION),
    where('userId', '==', userId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data().imageId);
};
