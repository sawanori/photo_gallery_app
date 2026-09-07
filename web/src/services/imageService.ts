import {
  doc,
  getDoc,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Image } from '@/types';

const IMAGES_COLLECTION = 'images';

/**
 * 同時に投げる getDoc の本数。
 *
 * ここは `in` クエリではなく **1 件ずつの `get`** である（`images` の `list` は
 * 管理者にしか許していないので、ID 指定でしか読めない）。したがって
 * 「`in` は 30 件まで」という Firestore の制限はここには効かず、以前の
 * 「30 件ずつ**直列**」は往復を無駄に積み上げていただけだった。
 * 150 枚のギャラリーなら、写真の URL が決まるまでに 5 往復かかっていた。
 *
 * とはいえ無制限に並べるのも避ける。Web SDK の `getDoc` は 1 件ごとに
 * 一時的なリスナを張るため、同時数の上限は実測していない。
 * 100 で頭打ちにしておけば、実運用のギャラリー（〜150 枚）は 2 往復で済む。
 */
const FETCH_CONCURRENCY = 100;

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

/**
 * ID の配列を並列に引き、**入力と同じ順序**で返す。
 * 取れなかった ID（削除済みなど）は結果から落とす。
 */
const fetchImagesByIds = async (imageIds: string[]): Promise<Image[]> => {
  const found = new Map<string, Image>();
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < imageIds.length) {
      const id = imageIds[cursor++];
      const docSnap = await getDoc(doc(db, IMAGES_COLLECTION, id));
      const image = docToImage(docSnap);
      if (image) found.set(image.id, image);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, imageIds.length) }, worker)
  );

  return imageIds.reduce<Image[]>((acc, id) => {
    const image = found.get(id);
    if (image) acc.push(image);
    return acc;
  }, []);
};

export const getImagesByIds = async (imageIds: string[]): Promise<Image[]> => {
  if (imageIds.length === 0) return [];

  // 並び順はここで決めない。呼び出し側（useInvitation）がファイル名の自然順に
  // 並べ替えるため、ここで createdAt 順にしても必ず上書きされる。
  // 責務を1か所に寄せて、二重に並べ替えないようにしている。
  return fetchImagesByIds(imageIds);
};

/** Fetch images by IDs, preserving input order (no sort). */
export const getImagesByIdsOrdered = async (imageIds: string[]): Promise<Image[]> => {
  if (imageIds.length === 0) return [];
  return fetchImagesByIds(imageIds);
};

export const getImageById = async (imageId: string): Promise<Image | null> => {
  const docSnap = await getDoc(doc(db, IMAGES_COLLECTION, imageId));
  return docToImage(docSnap);
};
