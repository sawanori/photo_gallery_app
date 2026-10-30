import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

const LIKES_COLLECTION = 'likes';

/**
 * 招待ごとの選定結果（クライアントがお気に入りに入れた画像）を取得する。
 *
 * likeScope が shared の招待では、お気に入りは招待に紐づいている（`likes/{invitationId}_{imageId}`）。
 * 以前は匿名 UID 単位で保存されており、同じ招待でも端末が変わると別人扱いになったため、
 * そもそも「この招待の選定結果」という単位で集められなかった。
 * perDevice の招待では同じ画像が複数返るので、getLikeSummaryByInvitation を使う。
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

export interface LikeSummary {
  counts: { imageId: string; count: number }[];
  /** いいねした匿名 UID の数。同じ人でも別のブラウザやアプリは別に数える。 */
  deviceCount: number;
}

/**
 * perDevice の招待の集計。端末ごとの like を画像ごとの件数にまとめる。
 * images.likeCount は perDevice の招待では更新されないので使わない。
 */
export const getLikeSummaryByInvitation = async (invitationId: string): Promise<LikeSummary> => {
  const snapshot = await getDocs(
    query(collection(db, LIKES_COLLECTION), where('invitationId', '==', invitationId))
  );

  const counts = new Map<string, number>();
  const devices = new Set<string>();
  for (const likeDoc of snapshot.docs) {
    const { imageId, userId } = likeDoc.data();
    if (typeof imageId !== 'string') continue;
    counts.set(imageId, (counts.get(imageId) ?? 0) + 1);
    if (typeof userId === 'string') devices.add(userId);
  }

  return {
    counts: Array.from(counts, ([imageId, count]) => ({ imageId, count })),
    deviceCount: devices.size,
  };
};
