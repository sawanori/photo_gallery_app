import {
  collection,
  doc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  serverTimestamp,
  increment,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface Like {
  userId: string;
  imageId: string;
  createdAt: Date;
}

const LIKES_COLLECTION = 'likes';
const IMAGES_COLLECTION = 'images';

// Generate like document ID
const getLikeId = (userId: string, imageId: string): string => {
  return `${userId}_${imageId}`;
};

// Check if user has liked an image
export const hasLiked = async (userId: string, imageId: string): Promise<boolean> => {
  const likeId = getLikeId(userId, imageId);
  const docRef = doc(db, LIKES_COLLECTION, likeId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists();
};

// Like an image
export const likeImage = async (userId: string, imageId: string): Promise<void> => {
  const likeId = getLikeId(userId, imageId);
  const likeRef = doc(db, LIKES_COLLECTION, likeId);
  const imageRef = doc(db, IMAGES_COLLECTION, imageId);

  await runTransaction(db, async (transaction) => {
    const likeDoc = await transaction.get(likeRef);

    if (likeDoc.exists()) {
      throw new Error('Already liked');
    }

    // Create like document
    transaction.set(likeRef, {
      userId,
      imageId,
      createdAt: serverTimestamp(),
    });

    // Increment like count on image
    transaction.update(imageRef, {
      likeCount: increment(1),
    });
  });
};

// Unlike an image
export const unlikeImage = async (userId: string, imageId: string): Promise<void> => {
  const likeId = getLikeId(userId, imageId);
  const likeRef = doc(db, LIKES_COLLECTION, likeId);
  const imageRef = doc(db, IMAGES_COLLECTION, imageId);

  await runTransaction(db, async (transaction) => {
    const likeDoc = await transaction.get(likeRef);

    if (!likeDoc.exists()) {
      throw new Error('Not liked');
    }

    // Delete like document
    transaction.delete(likeRef);

    // Decrement like count on image
    transaction.update(imageRef, {
      likeCount: increment(-1),
    });
  });
};

// Toggle like
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

// Get all liked images by user
export const getLikedImageIds = async (userId: string): Promise<string[]> => {
  const q = query(
    collection(db, LIKES_COLLECTION),
    where('userId', '==', userId)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data().imageId);
};

// Get like count for an image
export const getLikeCount = async (imageId: string): Promise<number> => {
  const q = query(
    collection(db, LIKES_COLLECTION),
    where('imageId', '==', imageId)
  );

  const snapshot = await getDocs(q);
  return snapshot.size;
};
