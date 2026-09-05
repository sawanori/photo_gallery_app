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
import type { ThumbnailResult } from '../utils/prepareUpload';
import { createBatchWriter, MAX_BATCH_OPERATIONS } from '../utils/batchWriter';
import { runWithConcurrency } from '../utils/uploadQueue';
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
  /**
   * Storage に置いた**原本の** bytes。
   *
   * mobile の一括保存が「1枚 5MB」と推定して 410 枚で誤って弾いていたため、
   * アップロード時に実測値を保存する。web の manifest が `bytes` として載せる。
   * 2026-09-02 より前にアップロードされた画像には無い。
   */
  size?: number;
  thumbnails?: {
    small: string;
    medium: string;
    /**
     * ライトボックス用の 1920px WebP。2026-09-06 より前にアップロードした
     * 画像には無い。web 側はこれが無ければ `/api/image` に落ちる。
     */
    large?: string;
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

/**
 * Storage が配信時に返す `Cache-Control`。
 *
 * 指定しないと Cloud Storage は `private, max-age=0` を返す。ブラウザは
 * ギャラリーを開き直すたびに全サムネイルを再検証しにいき、写真が出るまで
 * 毎回ネットワークを待つ。**この 1 行が再訪問時の体感を決める。**
 *
 * `immutable` を付けてよいのは、ファイル名が `${Date.now()}-${乱数}` で一意に
 * 決まり、同じパスの中身が後から書き換わらないためである。写真を差し替えるときは
 * 別のパスに上がり、Firestore の URL ごと変わる。
 */
const STORAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

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
    size: typeof data.size === 'number' ? data.size : undefined,
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
 *
 * **原本を上げたあとの工程が失敗したら、上げ済みのファイルを消してから投げ直す。**
 * 以前は原本だけが Storage に残り、どの画像ドキュメントからも参照されない孤児になっていた。
 * 画面には「N枚失敗」としか出ないため、誰も気付かないまま容量だけが増える。
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

  const metadata = {
    contentType: file.type || 'image/jpeg',
    cacheControl: STORAGE_CACHE_CONTROL,
  };
  const webpMeta = {
    contentType: 'image/webp',
    cacheControl: STORAGE_CACHE_CONTROL,
  };

  let thumbnailData: Image['thumbnails'];
  let thumbnailPaths: string[] | undefined;

  await uploadBytes(storageRef, file, metadata);

  // ここから先で失敗したときに消すパス。**アップロードが成功した時点で足す。**
  // 先に足すと、上がっていないパスを消しにいって余計なエラーを増やす。
  const uploadedPaths: string[] = [storagePath];

  try {
    // Upload thumbnails + get original URL in parallel
    const thumbnailUploads = thumbnailResults.map(async (thumb) => {
      // 実寸ではなく呼称の幅で名前を付ける。実寸だと元画像が小さいときに
      // medium と large が同じパスになり、片方がもう片方を上書きする。
      const thumbPath = `thumbnails/${userId}/${filename}_${thumb.nominalWidth}.webp`;
      const thumbRef = ref(storage, thumbPath);
      await uploadBytes(thumbRef, thumb.blob, webpMeta);
      uploadedPaths.push(thumbPath);
      const thumbUrl = await getDownloadURL(thumbRef);
      return { name: thumb.name, url: thumbUrl, path: thumbPath };
    });

    const [url, ...thumbResults] = await Promise.all([
      getDownloadURL(storageRef),
      ...thumbnailUploads,
    ]);

    if (thumbResults.length > 0) {
      const urls: Record<string, string> = {};
      thumbnailPaths = [];
      for (const t of thumbResults) {
        urls[t.name] = t.url;
        thumbnailPaths.push(t.path);
      }
      thumbnailData = { small: '', medium: '', ...urls };
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
      // 原本の bytes。mobile の一括保存が推定値で誤判定しないようにする。
      size: file.size,
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
      size: file.size,
      thumbnails: thumbnailData,
      thumbnailPaths,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    // 掃除の失敗で元の原因を隠さない。投げ直すのは必ず元の例外。
    await Promise.all(
      uploadedPaths.map((path) =>
        deleteObject(ref(storage, path)).catch((cleanupError) =>
          console.warn(`Failed to clean up orphaned upload: ${path}`, cleanupError)
        )
      )
    );
    throw error;
  }
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

/**
 * 削除の同時実行数。
 *
 * 実在する前例に合わせた値（アップロードは UPLOAD_CONCURRENCY = 4）。
 * ここを上げすぎると Firestore と Storage を叩きすぎてレート制限に当たる。
 * 実測して調整する（docs/project-delete/measurement.md）。
 */
const DELETE_CONCURRENCY = 4;

/** `in` クエリ1回に渡せる値の上限。Firestore Standard は 30。 */
const IN_QUERY_CHUNK = 30;

/**
 * 画像に紐づく Storage 上のファイル（原本とサムネイル）を削除する。
 *
 * **必ず画像ドキュメントより先に呼ぶ。** ドキュメントを先に消すと storagePath を
 * 失い、この削除に失敗したファイルは永久に孤児として残る。先に消しておけば
 * 画像ドキュメントが手元に残るので、再実行で回収できる。
 *
 * 例外にはしないが、**消せなかったパスを戻り値で返す**。呼び出し元はこれを見て
 * 「その画像の Firestore ドキュメントを残す」判断をする。以前はここが警告を
 * 出すだけで結果を捨てており、ドキュメントだけが消えてファイルが孤児になっていた。
 */
const deleteImageFiles = async (
  storagePath: string | undefined,
  thumbnailPaths: string[] = []
): Promise<string[]> => {
  const paths = [storagePath, ...thumbnailPaths].filter(
    (p): p is string => typeof p === 'string' && p.length > 0
  );

  const outcomes = await Promise.all(
    paths.map(async (path) => {
      try {
        await deleteObject(ref(storage, path));
        return null;
      } catch (error) {
        /**
         * **既に無いのは成功と同じ。**
         *
         * ここを失敗として扱うと、Storage のファイルだけが先に失われた画像を
         * 二度と消せなくなる。呼び出し元は「消せなかったファイルがあるなら
         * Firestore ドキュメントを残す」ので、管理画面には毎回
         * 「削除に失敗しました。再実行してください」が出続け、再実行しても
         * 同じ結果になる。実際に 2026-09-06 にそういうドキュメントが 1 件見つかった。
         */
        if ((error as { code?: string })?.code === 'storage/object-not-found') {
          return null;
        }
        console.warn(`Failed to delete file from storage: ${path}`, error);
        return path;
      }
    })
  );

  return outcomes.filter((path): path is string => path !== null);
};

/** Storage の削除に失敗し、Firestore ドキュメントを残した画像。 */
export interface FailedImageDelete {
  imageId: string;
  /** 消せなかった Storage のパス。再実行の手掛かりになる。 */
  paths: string[];
}

/**
 * 画像削除の結果。
 *
 * `failed` が空でなければ、その画像の Firestore ドキュメントは**残っている**。
 * 呼び出し元（UI）は件数を利用者に見せて再実行を促す。黙って成功にしない。
 */
export interface DeleteImagesResult {
  deletedCount: number;
  failed: FailedImageDelete[];
}

/** 画像1枚に紐づく Storage のパス一覧。 */
const storagePathsOf = (image: Pick<Image, 'storagePath' | 'thumbnailPaths'>): string[] =>
  [image.storagePath, ...(image.thumbnailPaths ?? [])].filter(
    (p): p is string => typeof p === 'string' && p.length > 0
  );

/**
 * 画像1枚に付いたお気に入りを削除する。
 *
 * **失敗を握り潰さない。** 2026-08-17 に firestore.rules の likes の delete から
 * isAdmin() が抜け落ちた際、ここが try-catch で握り潰していたため、管理画面からの
 * 画像削除でお気に入りだけが permission-denied で消えず、孤児が溜まり続けていた。
 * 権限の欠落が表に出ないのが一番まずい。
 */
const deleteLikesForImage = async (imageId: string): Promise<void> => {
  const likesSnapshot = await getDocs(
    query(collection(db, LIKES_COLLECTION), where('imageId', '==', imageId))
  );
  await Promise.all(
    likesSnapshot.docs.map((likeDoc) =>
      deleteDoc(doc(db, LIKES_COLLECTION, likeDoc.id))
    )
  );
};

/**
 * 複数の画像に付いたお気に入りの ID を、画像 ID ごとにまとめて返す。
 *
 * 画像1枚ごとにクエリを投げると700枚で700往復になる。`in` でまとめると
 * 30枚分を1回で引けるので 24 往復で済む。
 */
const findLikeIdsForImages = async (
  imageIds: string[]
): Promise<Map<string, string[]>> => {
  const byImage = new Map<string, string[]>();
  if (imageIds.length === 0) return byImage;

  const chunks: string[][] = [];
  for (let i = 0; i < imageIds.length; i += IN_QUERY_CHUNK) {
    chunks.push(imageIds.slice(i, i + IN_QUERY_CHUNK));
  }

  const results = await runWithConcurrency(chunks, DELETE_CONCURRENCY, (chunk) =>
    getDocs(query(collection(db, LIKES_COLLECTION), where('imageId', 'in', chunk)))
  );

  let failures = 0;
  for (const result of results) {
    if (!result.ok) {
      failures += 1;
      console.warn('Failed to look up likes for images:', result.error);
      continue;
    }
    for (const likeDoc of result.value.docs) {
      const imageId = likeDoc.data()?.imageId;
      if (typeof imageId !== 'string') continue;
      const ids = byImage.get(imageId);
      if (ids) ids.push(likeDoc.id);
      else byImage.set(imageId, [likeDoc.id]);
    }
  }

  // 引けなかった分を黙って飛ばすと、お気に入りだけが孤児として残る。
  if (failures > 0) {
    throw new Error(`Failed to look up likes for ${failures} image chunk(s)`);
  }

  return byImage;
};

/** 削除の進捗。件数は画像の枚数で数える。 */
export interface DeleteProgress {
  completed: number;
  total: number;
}

/**
 * プロジェクトに属する画像をまとめて削除する。
 *
 * 1枚ずつの deleteImage とは**意図的に別経路**にしている。プロジェクトごと消す場合、
 * 招待は先に消えているので招待同期は要らない。1枚ごとに走らせると700枚で
 * 700回の招待取得が発生し、これが遅さの主因だった。
 *
 * 引数が ID ではなく Image なのは、Storage を消すのに storagePath と
 * thumbnailPaths が要るため。getImagesByProject の結果をそのまま渡せる。
 *
 * 順序は **Storage → Firestore**。逆にすると storagePath を失う。
 * `imageCount` はバッチごとに減らす。省くと、途中で失敗したときに
 * 「700枚」と表示されたまま中身が空、という戻せない状態になる。
 *
 * **Storage の削除に失敗した画像は Firestore ドキュメントを消さない。**
 * 消すと storagePath ごと失われ、そのファイルは二度と回収できない。
 * 戻り値の `failed` に積んで呼び出し元へ返す（UI が再実行を促す）。
 *
 * @throws Firestore の削除に失敗した場合。
 */
export const deleteImagesForProject = async (
  projectId: string,
  images: Image[],
  onProgress?: (progress: DeleteProgress) => void
): Promise<DeleteImagesResult> => {
  if (images.length === 0) return { deletedCount: 0, failed: [] };

  const likeIdsByImage = await findLikeIdsForImages(images.map((img) => img.id));

  // 1. Storage を先に消す。失敗しても止めないが、どの画像が失敗したかは覚えておく。
  const storageOutcomes = await runWithConcurrency(images, DELETE_CONCURRENCY, (image) =>
    deleteImageFiles(image.storagePath, image.thumbnailPaths)
  );

  const failed: FailedImageDelete[] = [];
  const deletable: Image[] = [];
  images.forEach((image, index) => {
    const outcome = storageOutcomes[index];
    const failedPaths = outcome.ok ? outcome.value : storagePathsOf(image);
    if (failedPaths.length > 0) {
      failed.push({ imageId: image.id, paths: failedPaths });
      return;
    }
    deletable.push(image);
  });

  // 2. Firestore はバッチで消す。commit が失敗すればそのまま例外になる。
  const writer = createBatchWriter(db);
  const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
  let queued = 0;
  let completed = 0;

  const commitGroup = async (): Promise<void> => {
    if (queued === 0) return;
    await writer.update(projectRef, {
      imageCount: increment(-queued),
      updatedAt: serverTimestamp(),
    });
    await writer.flush();
    completed += queued;
    queued = 0;
    onProgress?.({ completed, total: images.length });
  };

  for (const image of deletable) {
    const likeIds = likeIdsByImage.get(image.id) ?? [];
    // この画像の分（画像1 + お気に入り + プロジェクト更新1）が収まらなければ先に確定させる。
    // 収まらないまま積むと BatchWriter が画像の途中で分割し、imageCount の減算が
    // その画像の削除とは別のバッチに落ちる。
    if (writer.size + likeIds.length + 2 > MAX_BATCH_OPERATIONS) {
      await commitGroup();
    }
    await writer.delete(doc(db, IMAGES_COLLECTION, image.id));
    for (const likeId of likeIds) {
      await writer.delete(doc(db, LIKES_COLLECTION, likeId));
    }
    queued += 1;
  }

  await commitGroup();

  return { deletedCount: completed, failed };
};

/**
 * 画像1枚を削除する。管理画面の画像一覧から呼ばれる経路。
 *
 * 順序は **Storage → お気に入り → 画像ドキュメント**。
 * 以前は Storage の削除とお気に入りの検索をトランザクションのコールバック内で
 * 行っていた。トランザクションは競合すると**丸ごと再実行される**ため、
 * 中に外部への副作用を置くと Storage の削除が何度も走る。
 * トランザクションに残すのは、画像ドキュメントの削除と imageCount の更新だけ。
 *
 * **Storage の削除に失敗したらドキュメントを消さずに戻る。**
 * 消すと storagePath を失い、ファイルが永久に孤児になる。
 * 呼び出し元は戻り値の `failed` を見て利用者に再実行を促す。
 */
export const deleteImage = async (imageId: string): Promise<DeleteImagesResult> => {
  const imageDocRef = doc(db, IMAGES_COLLECTION, imageId);

  const imageSnap = await getDoc(imageDocRef);
  if (!imageSnap.exists()) {
    throw new Error('Image not found');
  }

  const imageData = imageSnap.data();
  const projectId: string | undefined = imageData?.projectId;

  const failedPaths = await deleteImageFiles(
    imageData?.storagePath,
    imageData?.thumbnailPaths
  );
  if (failedPaths.length > 0) {
    return { deletedCount: 0, failed: [{ imageId, paths: failedPaths }] };
  }

  await deleteLikesForImage(imageId);

  await runTransaction(db, async (transaction) => {
    const current = await transaction.get(imageDocRef);
    // 別経路で既に消えている場合、ここで imageCount を二重に減らさない。
    if (!current.exists()) return;

    transaction.delete(imageDocRef);

    if (projectId) {
      transaction.update(doc(db, PROJECTS_COLLECTION, projectId), {
        imageCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    }
  });

  // 招待から画像 ID を外す。プロジェクトごと消す場合は招待が先に消えるため不要で、
  // deleteImagesForProject では呼んでいない。
  if (projectId) {
    await syncInvitationsOnImageDelete(projectId, imageId);
  }

  return { deletedCount: 1, failed: [] };
};

// Delete multiple images
export const deleteImages = async (imageIds: string[]): Promise<DeleteImagesResult> => {
  const results = await Promise.all(imageIds.map((id) => deleteImage(id)));
  return results.reduce<DeleteImagesResult>(
    (acc, result) => ({
      deletedCount: acc.deletedCount + result.deletedCount,
      failed: [...acc.failed, ...result.failed],
    }),
    { deletedCount: 0, failed: [] }
  );
};
