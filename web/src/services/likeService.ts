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

/**
 * お気に入りは「招待」に紐づける。匿名 UID には紐づけない。
 *
 * 匿名 UID を鍵にすると、同じ招待リンクでもブラウザとアプリ、あるいは端末が変わるだけで
 * 別人として扱われ、クライアントがブラウザで選んだお気に入りがアプリでは空になる。
 * WebView は Safari と別のストレージを持つため、ネイティブアプリでは必ずこれが起きる。
 *
 * 招待 ID（＝招待トークン）を鍵にすることで、同じリンクを開いた人どうしで
 * 選定結果が共有される。納品の流れとしてはこちらが正しい。
 */
const getLikeId = (invitationId: string, imageId: string): string => {
  return `${invitationId}_${imageId}`;
};

export const hasLiked = async (
  invitationId: string,
  imageId: string
): Promise<boolean> => {
  const docRef = doc(db, LIKES_COLLECTION, getLikeId(invitationId, imageId));
  const docSnap = await getDoc(docRef);
  return docSnap.exists();
};

/**
 * @param userId 最後に操作した匿名 UID。監査用に残すだけで、鍵には使わない。
 */
export const likeImage = async (
  invitationId: string,
  imageId: string,
  userId: string
): Promise<void> => {
  const likeRef = doc(db, LIKES_COLLECTION, getLikeId(invitationId, imageId));
  const imageRef = doc(db, IMAGES_COLLECTION, imageId);

  await runTransaction(db, async (transaction) => {
    const likeDoc = await transaction.get(likeRef);
    if (likeDoc.exists()) throw new Error('Already liked');

    transaction.set(likeRef, {
      invitationId,
      imageId,
      userId,
      createdAt: serverTimestamp(),
    });
    transaction.update(imageRef, {
      likeCount: increment(1),
    });
  });
};

export const unlikeImage = async (
  invitationId: string,
  imageId: string
): Promise<void> => {
  const likeRef = doc(db, LIKES_COLLECTION, getLikeId(invitationId, imageId));
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

export const toggleLike = async (
  invitationId: string,
  imageId: string,
  userId: string
): Promise<boolean> => {
  const liked = await hasLiked(invitationId, imageId);
  if (liked) {
    await unlikeImage(invitationId, imageId);
    return false;
  }
  await likeImage(invitationId, imageId, userId);
  return true;
};

export const getLikedImageIds = async (invitationId: string): Promise<string[]> => {
  const q = query(
    collection(db, LIKES_COLLECTION),
    where('invitationId', '==', invitationId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((likeDoc) => likeDoc.data().imageId);
};
