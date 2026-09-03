import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
  type RulesTestContext,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp, type Firestore } from 'firebase/firestore';
import { ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

export const PROJECT_ID = 'demo-photo-gallery';

export const ADMIN_UID = 'admin-uid';
export const OTHER_ADMIN_UID = 'other-admin-uid';
export const VIEWER_UID = 'viewer-uid';
export const OTHER_VIEWER_UID = 'other-viewer-uid';

export const ACTIVE_INVITATION = 'tok-active-invitation';
export const OTHER_INVITATION = 'tok-other-invitation';
export const INACTIVE_INVITATION = 'tok-inactive-invitation';
export const EXPIRED_INVITATION = 'tok-expired-invitation';

export const IMAGE_IN_INVITATION = 'img-in-invitation';
export const IMAGE_ALSO_IN_INVITATION = 'img-also-in-invitation';
/** 招待の imageIds に入っていない画像。存在はする。 */
export const IMAGE_OUTSIDE_INVITATION = 'img-outside-invitation';

export const PROJECT_ID_DOC = 'project-1';

let cached: RulesTestEnvironment | null = null;

export async function getTestEnv(): Promise<RulesTestEnvironment> {
  if (cached) return cached;
  cached = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(repoRoot, 'firestore.rules'), 'utf8'),
    },
    storage: {
      rules: readFileSync(resolve(repoRoot, 'storage.rules'), 'utf8'),
    },
  });
  return cached;
}

const future = () => Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
const past = () => Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);

/**
 * ルールを迂回して土台のデータを入れる。
 * ここで入れるものは「管理画面が正しく作った状態」を表す。
 */
export async function seed(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (context: RulesTestContext) => {
    const db = context.firestore() as unknown as Firestore;

    await setDoc(doc(db, 'users', ADMIN_UID), {
      email: 'admin@example.com',
      role: 'admin',
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'users', OTHER_ADMIN_UID), {
      email: 'other-admin@example.com',
      role: 'admin',
      createdAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'projects', PROJECT_ID_DOC), {
      name: 'テスト案件',
      status: 'active',
      imageCount: 3,
      createdAt: Timestamp.now(),
    });

    for (const imageId of [
      IMAGE_IN_INVITATION,
      IMAGE_ALSO_IN_INVITATION,
      IMAGE_OUTSIDE_INVITATION,
    ]) {
      await setDoc(doc(db, 'images', imageId), {
        projectId: PROJECT_ID_DOC,
        url: `https://example.invalid/${imageId}.jpg`,
        storagePath: `images/${ADMIN_UID}/${imageId}`,
        title: imageId,
        description: '',
        userId: ADMIN_UID,
        likeCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }

    const baseInvitation = {
      token: ACTIVE_INVITATION,
      projectId: PROJECT_ID_DOC,
      clientName: 'テスト様',
      clientEmail: '',
      createdBy: ADMIN_UID,
      imageIds: [IMAGE_IN_INVITATION, IMAGE_ALSO_IN_INVITATION],
      viewingDays: 7,
      accessCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await setDoc(doc(db, 'invitations', ACTIVE_INVITATION), {
      ...baseInvitation,
      isActive: true,
      expiresAt: future(),
    });
    await setDoc(doc(db, 'invitations', OTHER_INVITATION), {
      ...baseInvitation,
      token: OTHER_INVITATION,
      isActive: true,
      expiresAt: future(),
    });
    await setDoc(doc(db, 'invitations', INACTIVE_INVITATION), {
      ...baseInvitation,
      token: INACTIVE_INVITATION,
      isActive: false,
      expiresAt: future(),
    });
    await setDoc(doc(db, 'invitations', EXPIRED_INVITATION), {
      ...baseInvitation,
      token: EXPIRED_INVITATION,
      isActive: true,
      expiresAt: past(),
    });

    // list の絞り込みを確かめるため、2 つの招待の like を用意する。
    await setDoc(doc(db, 'likes', `${ACTIVE_INVITATION}_${IMAGE_IN_INVITATION}`), {
      invitationId: ACTIVE_INVITATION,
      imageId: IMAGE_IN_INVITATION,
      userId: VIEWER_UID,
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'likes', `${OTHER_INVITATION}_${IMAGE_IN_INVITATION}`), {
      invitationId: OTHER_INVITATION,
      imageId: IMAGE_IN_INVITATION,
      userId: OTHER_VIEWER_UID,
      createdAt: Timestamp.now(),
    });
  });
}

/** ルールを迂回してセッションを作る。セッション作成そのものは別テストで検証する。 */
export async function seedSession(
  env: RulesTestEnvironment,
  uid: string,
  invitationId: string
): Promise<void> {
  await env.withSecurityRulesDisabled(async (context: RulesTestContext) => {
    const db = context.firestore() as unknown as Firestore;
    await setDoc(doc(db, 'sessions', uid), {
      invitationId,
      anonymousUid: uid,
      createdAt: Timestamp.now(),
      lastAccessedAt: Timestamp.now(),
    });
  });
}

/** ルールを迂回して Storage にファイルを置く。読み取りテストの土台。 */
export async function seedStorageObject(
  env: RulesTestEnvironment,
  path: string
): Promise<void> {
  await env.withSecurityRulesDisabled(async (context: RulesTestContext) => {
    const storage = context.storage() as unknown as FirebaseStorage;
    await uploadBytes(ref(storage, path), pngBytes(), { contentType: 'image/png' });
  });
}

/** 1x1 PNG 相当の適当なバイト列。内容は問わない。 */
export function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}
