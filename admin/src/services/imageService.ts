import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
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
  arrayRemove,
  arrayUnion,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import type { ThumbnailResult } from '../utils/thumbnailGenerator';
import {
  getInvitationsByProject,
  getActiveInvitationsByProject,
} from './invitationService';

export interface Image {
  id: string;
  projectId?: string;
  url: string;
  storagePath: string;
  title: string;
  description?: string;
  userId: string;
  likeCount: number;
  thumbnails?: {
    small: string;
    medium: string;
  };
  thumbnailPaths?: string[];
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
const LIKES_COLLECTION = 'likes';
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
    thumbnails: data.thumbnails,
    thumbnailPaths: data.thumbnailPaths,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
};

const INVITATIONS_COLLECTION = 'invitations';

/**
 * 削除された画像IDを全招待から除去（アトミック操作）
 * arrayRemoveは対象値が存在しない場合no-opのため、フィルタ不要
 */
const syncInvitationsOnImageDelete = async (
  projectId: string,
  deletedImageId: string
): Promise<void> => {
  try {
    const invitations = await getInvitationsByProject(projectId);
    await Promise.all(
      invitations.map((inv) =>
        updateDoc(doc(db, INVITATIONS_COLLECTION, inv.id), {
          imageIds: arrayRemove(deletedImageId),
          updatedAt: serverTimestamp(),
        }).catch((error) =>
          console.warn(`Failed to sync invitation ${inv.id} on delete:`, error)
        )
      )
    );
  } catch (error) {
    console.warn('Failed to sync invitations on image delete:', error);
  }
};

/**
 * arrayUnion に一度に渡す ID の最大数。
 * 公式に上限の明示は無いが、1回のコミットを肥大させないため分割する。
 */
const ARRAY_UNION_CHUNK = 300;

/**
 * 新画像IDをアクティブ招待に追加（アトミック操作）
 * arrayUnionは重複追加を防ぐ
 *
 * 以前は画像1枚ごとに呼んでいたため、同じ招待ドキュメントへ枚数分の書き込みが
 * 集中していた。現在は finalizeUploadBatch から**複数IDをまとめて**呼ぶ。
 */
const syncInvitationsOnImageUpload = async (
  projectId: string,
  newImageIds: string[]
): Promise<void> => {
  if (newImageIds.length === 0) return;
  try {
    const activeInvitations = await getActiveInvitationsByProject(projectId);
    if (activeInvitations.length === 0) return;

    const chunks: string[][] = [];
    for (let i = 0; i < newImageIds.length; i += ARRAY_UNION_CHUNK) {
      chunks.push(newImageIds.slice(i, i + ARRAY_UNION_CHUNK));
    }

    await Promise.all(
      activeInvitations.map(async (inv) => {
        for (const chunk of chunks) {
          try {
            await updateDoc(doc(db, INVITATIONS_COLLECTION, inv.id), {
              imageIds: arrayUnion(...chunk),
              updatedAt: serverTimestamp(),
            });
          } catch (error) {
            console.warn(`Failed to sync invitation ${inv.id} on upload:`, error);
          }
        }
      })
    );
  } catch (error) {
    console.warn('Failed to sync invitations on image upload:', error);
  }
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

/**
 * プロジェクトの存在を1回だけ確認する。
 *
 * 以前は画像1枚ごとにトランザクション内で確認していたため、枚数分の読み取りが発生していた。
 * バッチの開始時に1回呼べば十分である。
 *
 * @throws プロジェクトが存在しない場合（従来のトランザクションと同じメッセージ）
 */
export const assertProjectExists = async (projectId: string): Promise<void> => {
  const snap = await getDoc(doc(db, PROJECTS_COLLECTION, projectId));
  if (!snap.exists()) {
    throw new Error('Project not found');
  }
};

/**
 * アップロード1バッチ分の後処理をまとめて行う。
 *
 * `projects.imageCount` の加算と招待への画像ID追加は、いずれも**同じドキュメント**への
 * 書き込みになる。これを画像1枚ごとに行うと書き込みが集中して競合し、
 * アップロード全体が遅くなる。ここでまとめて実行する。
 *
 * 呼び出し元のアップロードは既に成功しているため、この関数は**例外を投げない**。
 * 失敗した場合はログに残し、画像自体は保存済みのままとする。
 */
export const finalizeUploadBatch = async (
  projectId: string,
  imageIds: string[]
): Promise<void> => {
  if (imageIds.length === 0) return;

  try {
    await updateDoc(doc(db, PROJECTS_COLLECTION, projectId), {
      imageCount: increment(imageIds.length),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Failed to update project imageCount:', error);
  }

  await syncInvitationsOnImageUpload(projectId, imageIds);
};

/**
 * 画像1枚を Storage と Firestore に保存する。
 *
 * この関数は `projects` と `invitations` に**一切書き込まない**。
 * それらの更新は finalizeUploadBatch がバッチ単位で行う。
 * ここで書き込むと同じドキュメントへの書き込みが枚数分集中してしまう。
 *
 * サムネイルは呼び出し元（prepareUpload）が生成済みのものを受け取る。
 * 関数内で生成すると画像を2回デコードすることになる。
 */
export const uploadImageFile = async (
  projectId: string,
  userId: string,
  file: File,
  thumbnailResults: ThumbnailResult[],
  title: string,
  description?: string
): Promise<Image> => {
  // Generate unique filename
  const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const storagePath = `images/${userId}/${filename}`;
  const storageRef = ref(storage, storagePath);

  const metadata = { contentType: file.type || 'image/jpeg' };
  const webpMeta = { contentType: 'image/webp' };

  let thumbnailData: { small: string; medium: string } | undefined;
  let thumbnailPaths: string[] | undefined;

  await uploadBytes(storageRef, file, metadata);

  // Upload thumbnails + get original URL in parallel
  const thumbnailUploads = thumbnailResults.map(async (thumb) => {
    const thumbPath = `thumbnails/${userId}/${filename}_${thumb.width}.webp`;
    const thumbRef = ref(storage, thumbPath);
    await uploadBytes(thumbRef, thumb.blob, webpMeta);
    const thumbUrl = await getDownloadURL(thumbRef);
    return { name: thumb.name, url: thumbUrl, path: thumbPath };
  });

  const [url, ...thumbResults] = await Promise.all([
    getDownloadURL(storageRef),
    ...thumbnailUploads,
  ]);

  if (thumbResults.length > 0) {
    thumbnailData = { small: '', medium: '' };
    thumbnailPaths = [];
    for (const t of thumbResults) {
      thumbnailData[t.name] = t.url;
      thumbnailPaths.push(t.path);
    }
  }

  // 新規ドキュメントへの書き込みなので競合しない。トランザクションは不要。
  // プロジェクトの存在確認は assertProjectExists がバッチ開始時に済ませている。
  const imageDocRef = doc(collection(db, IMAGES_COLLECTION));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageData: Record<string, any> = {
    projectId,
    url,
    storagePath,
    title,
    description: description || '',
    userId,
    likeCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (thumbnailData) {
    imageData.thumbnails = thumbnailData;
    imageData.thumbnailPaths = thumbnailPaths;
  }

  await setDoc(imageDocRef, imageData);

  // 書いたばかりのドキュメントを読み直さず、手元のデータから組み立てる。
  // Firestore 上の createdAt / updatedAt はサーバー時刻のままで、
  // クライアント時刻になるのはこの戻り値だけ（呼び出し元は件数にしか使っていない）。
  const now = new Date();
  return {
    id: imageDocRef.id,
    projectId,
    url,
    storagePath,
    title,
    description: description || '',
    userId,
    likeCount: 0,
    thumbnails: thumbnailData,
    thumbnailPaths,
    createdAt: now,
    updatedAt: now,
  };
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
  let projectId: string | undefined;

  // Use transaction to atomically delete image and update project count
  await runTransaction(db, async (transaction) => {
    const imageSnap = await transaction.get(imageDocRef);
    if (!imageSnap.exists()) {
      throw new Error('Image not found');
    }

    const imageData = imageSnap.data();
    const storagePath = imageData?.storagePath;
    projectId = imageData?.projectId;
    const thumbPaths: string[] = imageData?.thumbnailPaths || [];

    // Delete from Storage (best-effort)
    if (storagePath) {
      const storageRef = ref(storage, storagePath);
      try {
        await deleteObject(storageRef);
      } catch (error) {
        console.warn('Failed to delete file from storage:', error);
      }
    }

    // Delete thumbnails (best-effort)
    for (const tp of thumbPaths) {
      try {
        await deleteObject(ref(storage, tp));
      } catch (error) {
        console.warn('Failed to delete thumbnail from storage:', error);
      }
    }

    // Delete associated likes (best-effort, outside transaction)
    try {
      const likesQuery = query(
        collection(db, LIKES_COLLECTION),
        where('imageId', '==', imageId)
      );
      const likesSnapshot = await getDocs(likesQuery);
      for (const likeDoc of likesSnapshot.docs) {
        await deleteDoc(doc(db, LIKES_COLLECTION, likeDoc.id));
      }
    } catch (error) {
      console.warn('Failed to delete likes for image:', error);
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

  // トランザクション成功後にベストエフォートで招待同期
  if (projectId) {
    await syncInvitationsOnImageDelete(projectId, imageId);
  }
};

// Delete multiple images
export const deleteImages = async (imageIds: string[]): Promise<void> => {
  await Promise.all(imageIds.map((id) => deleteImage(id)));
};
