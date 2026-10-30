import {
  collection,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp,
  increment,
  runTransaction,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Invitation } from '@/types';

const LIKES_COLLECTION = 'likes';
const IMAGES_COLLECTION = 'images';

type LikeTarget = Pick<Invitation, 'id' | 'likeScope'>;

const isPerDevice = (invitation: LikeTarget): boolean => invitation.likeScope === 'perDevice';

/**
 * お気に入りの範囲は招待の likeScope で決まる。未設定や未知の値は shared として扱う。
 *
 * shared: 招待に紐づける。同じリンクを開いた全員で 1 つの選択を共有する。
 * 匿名 UID を鍵にすると、同じ人でもブラウザとアプリで別人として扱われ、
 * クライアントがブラウザで選んだお気に入りがアプリでは空になる。
 * WebView は Safari と別のストレージを持つため、ネイティブアプリでは必ずこれが起きる。
 * 1 組のクライアントが選ぶ納品にはこちらが正しい。
 *
 * perDevice: 匿名 UID に紐づける。パーティーのように複数の参加者が同じリンクを使うとき、
 * 他の人のいいねを見せない。上の引き継がれない問題は受け入れている。
 */
const getLikeId = (invitation: LikeTarget, imageId: string, userId: string): string => {
  return isPerDevice(invitation)
    ? `${invitation.id}_${userId}_${imageId}`
    : `${invitation.id}_${imageId}`;
};

/**
 * お気に入りを目的の状態にする。既にその状態なら何も書かずに成功する。
 *
 * 反転ではなく目的の状態を受け取るのは、画面とサーバーがずれていても
 * 利用者が見ている操作と逆のことをしないため。
 *
 * perDevice では likeCount を更新しない。どの画面にも表示しておらず、集計は like の
 * 文書を数えれば足りる。参加者が同じ写真へ同時に押すと images の更新が競合する。
 *
 * @param userId shared では最後に操作した匿名 UID（監査用）。perDevice では所有者。
 */
export const setLiked = async (
  invitation: LikeTarget,
  imageId: string,
  userId: string,
  liked: boolean
): Promise<void> => {
  const likeRef = doc(db, LIKES_COLLECTION, getLikeId(invitation, imageId, userId));

  await runTransaction(db, async (transaction) => {
    const likeDoc = await transaction.get(likeRef);
    if (likeDoc.exists() === liked) return;

    if (liked) {
      transaction.set(likeRef, {
        invitationId: invitation.id,
        imageId,
        userId,
        createdAt: serverTimestamp(),
      });
    } else {
      transaction.delete(likeRef);
    }

    if (!isPerDevice(invitation)) {
      transaction.update(doc(db, IMAGES_COLLECTION, imageId), {
        likeCount: increment(liked ? 1 : -1),
      });
    }
  });
};

/**
 * @param userId perDevice ではこの UID の分だけを読む。ルールも絞り込みを要求する。
 */
export const getLikedImageIds = async (
  invitation: LikeTarget,
  userId: string
): Promise<string[]> => {
  const filters = [where('invitationId', '==', invitation.id)];
  if (isPerDevice(invitation)) filters.push(where('userId', '==', userId));

  const snapshot = await getDocs(query(collection(db, LIKES_COLLECTION), ...filters));
  return snapshot.docs.map((likeDoc) => likeDoc.data().imageId);
};
