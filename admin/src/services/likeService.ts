import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

const LIKES_COLLECTION = 'likes';

/**
 * 招待ごとの選定結果（クライアントがお気に入りに入れた画像）を取得する。
 *
 * お気に入りは招待に紐づいている（`likes/{invitationId}_{imageId}`）。
 * 以前は匿名 UID 単位で保存されており、同じ招待でも端末が変わると別人扱いになったため、
 * そもそも「この招待の選定結果」という単位で集められなかった。
 *
 * Firestore ルールでは likes の list を管理者と、自分のセッションが指す招待に
 * 限定している。この関数は管理画面から管理者として実行される前提。
 */
export const getLikedImageIdsByInvitation = async (
  invitationId: string
): Promise<string[]> => {
  const snapshot = await getDocs(
    query(collection(db, LIKES_COLLECTION), where('invitationId', '==', invitationId))
  );
  return snapshot.docs
    .map((likeDoc) => likeDoc.data().imageId)
    .filter((imageId): imageId is string => typeof imageId === 'string');
};
