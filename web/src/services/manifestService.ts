import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';

/**
 * ネイティブアプリ向けの「保存してよい画像」の解決。
 *
 * ここが本計画の認可の中心である。ネイティブは URL を一切受け取らず、
 * 招待トークンと imageId だけを送る。この関数が
 *   1. 招待が有効か（isActive / expiresAt / 閲覧期限）
 *   2. 要求された imageId がすべてその招待に属するか
 * を確認したうえで URL を返す。
 *
 * Route Handler から使う純粋なドメインロジックとして切り出してあり、
 * Firestore ハンドルを引数で受け取るためテストしやすい。
 */

const INVITATIONS_COLLECTION = 'invitations';
const IMAGES_COLLECTION = 'images';

/** 閲覧期限（招待作成からの日数）。web/src/services/invitationService.ts と揃える。 */
const VIEWING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const MAX_MANIFEST_ITEMS = 500;

export interface ManifestItem {
  imageId: string;
  url: string;
  filename: string;
}

export type ManifestFailure =
  | { ok: false; status: 400; code: 'bad_request' }
  | { ok: false; status: 403; code: 'forbidden' }
  | { ok: false; status: 404; code: 'not_found' };

export type ManifestResult =
  | { ok: true; items: ManifestItem[] }
  | ManifestFailure;

interface InvitationRecord {
  id: string;
  imageIds: string[];
  isActive: boolean;
  expiresAt?: Date;
  createdAt?: Date;
}

/**
 * 招待をトークンで引く。
 *
 * 別計画 `docs/implementation-plan.md` の task_002 で招待のドキュメント ID が
 * トークンそのものになる予定なので、まず単一ドキュメント取得を試し、
 * 見つからなければ現行のコレクションクエリにフォールバックする。
 * これで移行の前後どちらでも動く。
 */
async function findInvitation(
  db: Firestore,
  token: string
): Promise<InvitationRecord | null> {
  try {
    const direct = await getDoc(doc(db, INVITATIONS_COLLECTION, token));
    if (direct.exists()) return toInvitation(direct.id, direct.data());
  } catch {
    // 権限拒否は「見つからない」と同じに正規化する（存在の有無を漏らさない）
  }

  try {
    const snapshot = await getDocs(
      query(
        collection(db, INVITATIONS_COLLECTION),
        where('token', '==', token),
        limit(1)
      )
    );
    if (snapshot.empty) return null;
    const found = snapshot.docs[0];
    return toInvitation(found.id, found.data());
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toInvitation(id: string, data: any): InvitationRecord {
  return {
    id,
    imageIds: Array.isArray(data.imageIds) ? data.imageIds : [],
    isActive: data.isActive !== false,
    expiresAt: data.expiresAt?.toDate?.(),
    createdAt: data.createdAt?.toDate?.(),
  };
}

function isUsable(invitation: InvitationRecord, now: Date): boolean {
  if (!invitation.isActive) return false;
  if (invitation.expiresAt && now > invitation.expiresAt) return false;
  if (
    invitation.createdAt &&
    now > new Date(invitation.createdAt.getTime() + VIEWING_WINDOW_MS)
  ) {
    return false;
  }
  return true;
}

/**
 * 端末に保存されるファイル名を決める。
 *
 * クライアントの写真アプリに並ぶ名前になるため、`DSC05710` のような
 * 元の撮影ファイル名を優先する。Firestore のドキュメントIDが並ぶと
 * 受け取った人がどれがどれだか分からない。
 *
 * 優先順位:
 *   1. storagePath の末尾に拡張子が付いていればそれをそのまま使う
 *   2. title（＝アップロード時の元ファイル名から拡張子を除いたもの）＋ 導出した拡張子
 *   3. imageId ＋ 導出した拡張子
 *
 * ネイティブ側（mobile/src/save/validate.ts）はパス区切りや制御文字を含む
 * ファイル名を**拒否する**ため、ここで必ず安全な文字だけにしておく。
 */
export function filenameFor(
  storagePath: unknown,
  url: unknown,
  imageId: string,
  title?: unknown
): string {
  if (typeof storagePath === 'string') {
    const tail = storagePath.split('/').pop();
    if (tail && /\.[a-z0-9]{2,5}$/i.test(tail)) {
      const safeTail = sanitizeFilename(tail);
      if (safeTail) return safeTail;
    }
  }

  const extension = extensionFromUrl(url) ?? 'jpg';
  const stem = typeof title === 'string' ? sanitizeFilename(title) : null;
  return `${stem || imageId}.${extension}`;
}

function extensionFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const match = path.match(/\.([a-z0-9]{2,5})$/i);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

/** ファイル名として安全な文字だけにする。危険な要素しか無ければ null。 */
function sanitizeFilename(raw: string): string | null {
  const cleaned = raw
    // パス区切りは下線に置き換える（native 側は '/' '\\' を含む名前を拒否する）
    .replace(/[/\\]/g, '_')
    // NUL や制御文字は取り除く
    .replace(CONTROL_CHARS, '')
    .trim();

  // '..' 始まりはディレクトリ参照とみなされて native 側で弾かれる
  if (cleaned.length === 0 || cleaned === '.' || cleaned.startsWith('..')) return null;
  return cleaned.length > 100 ? cleaned.slice(0, 100) : cleaned;
}

export async function resolveManifest(
  db: Firestore,
  token: unknown,
  imageIds: unknown,
  now: Date = new Date()
): Promise<ManifestResult> {
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, status: 400, code: 'bad_request' };
  }
  if (!Array.isArray(imageIds) || imageIds.length === 0) {
    return { ok: false, status: 400, code: 'bad_request' };
  }
  if (imageIds.length > MAX_MANIFEST_ITEMS) {
    return { ok: false, status: 400, code: 'bad_request' };
  }
  if (!imageIds.every((id) => typeof id === 'string' && id.length > 0)) {
    return { ok: false, status: 400, code: 'bad_request' };
  }

  const invitation = await findInvitation(db, token);
  if (!invitation) return { ok: false, status: 404, code: 'not_found' };

  // 無効化と期限切れを区別しない（第三者に状態を漏らさないため）
  if (!isUsable(invitation, now)) {
    return { ok: false, status: 403, code: 'forbidden' };
  }

  // 認可の核心。1件でも招待に含まれないものがあれば全体を拒否する。
  // 部分的に許可すると、総当たりで他招待の画像の存在を確認できてしまう。
  const allowed = new Set(invitation.imageIds);
  const requested = Array.from(new Set(imageIds as string[]));
  if (!requested.every((id) => allowed.has(id))) {
    return { ok: false, status: 403, code: 'forbidden' };
  }

  const docs = await Promise.all(
    requested.map((id) => getDoc(doc(db, IMAGES_COLLECTION, id)))
  );

  const items: ManifestItem[] = [];
  for (const snapshot of docs) {
    if (!snapshot.exists()) continue;
    const data = snapshot.data();
    if (typeof data.url !== 'string' || data.url.length === 0) continue;
    items.push({
      imageId: snapshot.id,
      url: data.url,
      filename: filenameFor(data.storagePath, data.url, snapshot.id, data.title),
    });
  }

  return { ok: true, items };
}
