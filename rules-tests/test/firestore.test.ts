import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import {
  ACTIVE_INVITATION,
  ADMIN_UID,
  EXPIRED_INVITATION,
  IMAGE_ALSO_IN_INVITATION,
  IMAGE_IN_INVITATION,
  IMAGE_OUTSIDE_INVITATION,
  INACTIVE_INVITATION,
  OTHER_INVITATION,
  OTHER_VIEWER_UID,
  PROJECT_ID_DOC,
  VIEWER_UID,
  getTestEnv,
  seed,
  seedSession,
} from './helpers';

let env: RulesTestEnvironment;

const viewerDb = () => env.authenticatedContext(VIEWER_UID).firestore() as unknown as Firestore;
const otherViewerDb = () =>
  env.authenticatedContext(OTHER_VIEWER_UID).firestore() as unknown as Firestore;
const adminDb = () => env.authenticatedContext(ADMIN_UID).firestore() as unknown as Firestore;
const anonDb = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await getTestEnv();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed(env);
});

afterAll(async () => {
  await env?.cleanup();
});

describe('users', () => {
  it('匿名ユーザーは自分の users ドキュメントを作れない（S3）', async () => {
    await assertFails(
      setDoc(doc(viewerDb(), 'users', VIEWER_UID), {
        email: 'anon@example.com',
        role: 'user',
        createdAt: serverTimestamp(),
      })
    );
  });

  it('管理者を騙る role: admin の自己作成も拒否される', async () => {
    await assertFails(
      setDoc(doc(viewerDb(), 'users', VIEWER_UID), {
        email: 'anon@example.com',
        role: 'admin',
        createdAt: serverTimestamp(),
      })
    );
  });

  it('自分の users ドキュメントは自分では更新できない（管理者のみ）', async () => {
    await assertFails(updateDoc(doc(adminDbAsNonAdmin(), 'users', ADMIN_UID), { email: 'x@y.z' }));
  });

  it('管理者は users を更新できる', async () => {
    await assertSucceeds(updateDoc(doc(adminDb(), 'users', ADMIN_UID), { email: 'new@example.com' }));
  });

  it('管理者は users を list できる', async () => {
    await assertSucceeds(getDocs(collection(adminDb(), 'users')));
  });

  it('匿名ユーザーは users を list できない', async () => {
    await assertFails(getDocs(collection(viewerDb(), 'users')));
  });
});

/** users ドキュメントを持たない（＝管理者でない）認証ユーザー。 */
function adminDbAsNonAdmin(): Firestore {
  return env.authenticatedContext('not-an-admin').firestore() as unknown as Firestore;
}

describe('invitations', () => {
  it('匿名の閲覧者は有効な招待を get できる', async () => {
    await assertSucceeds(getDoc(doc(viewerDb(), 'invitations', ACTIVE_INVITATION)));
  });

  it('無効化された招待は get できない', async () => {
    await assertFails(getDoc(doc(viewerDb(), 'invitations', INACTIVE_INVITATION)));
  });

  it('期限切れの招待は get できない', async () => {
    await assertFails(getDoc(doc(viewerDb(), 'invitations', EXPIRED_INVITATION)));
  });

  it('匿名ユーザーは invitations を list できない（トークンの収穫を防ぐ）', async () => {
    await assertFails(getDocs(collection(viewerDb(), 'invitations')));
  });

  it('管理者は invitations を list できる', async () => {
    await assertSucceeds(getDocs(collection(adminDb(), 'invitations')));
  });

  it('セッションを持つ閲覧者は accessCount を +1 して lastAccessedAt をサーバー時刻にできる', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertSucceeds(
      updateDoc(doc(viewerDb(), 'invitations', ACTIVE_INVITATION), {
        accessCount: increment(1),
        lastAccessedAt: serverTimestamp(),
      })
    );
  });

  it('accessCount の +2 は拒否される', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertFails(
      updateDoc(doc(viewerDb(), 'invitations', ACTIVE_INVITATION), {
        accessCount: increment(2),
        lastAccessedAt: serverTimestamp(),
      })
    );
  });

  it('accessCount の任意の値への書き換えは拒否される', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertFails(
      updateDoc(doc(viewerDb(), 'invitations', ACTIVE_INVITATION), {
        accessCount: 9999,
        lastAccessedAt: serverTimestamp(),
      })
    );
  });

  it('lastAccessedAt をクライアント時刻にすると拒否される', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertFails(
      updateDoc(doc(viewerDb(), 'invitations', ACTIVE_INVITATION), {
        accessCount: increment(1),
        lastAccessedAt: Timestamp.fromMillis(Date.now() - 1000),
      })
    );
  });

  it('accessCount / lastAccessedAt 以外のフィールドは書けない', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    // 値が変わらない書き込みは diff().affectedKeys() に現れないので、
    // 実際に値を変える形で確かめる。
    await assertFails(
      updateDoc(doc(viewerDb(), 'invitations', ACTIVE_INVITATION), {
        accessCount: increment(1),
        lastAccessedAt: serverTimestamp(),
        isActive: false,
      })
    );
    await assertFails(
      updateDoc(doc(viewerDb(), 'invitations', ACTIVE_INVITATION), {
        accessCount: increment(1),
        lastAccessedAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000),
      })
    );
    await assertFails(
      updateDoc(doc(viewerDb(), 'invitations', ACTIVE_INVITATION), {
        imageIds: [IMAGE_OUTSIDE_INVITATION],
      })
    );
  });

  it('自分のセッションが指していない招待の accessCount は動かせない', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertFails(
      updateDoc(doc(viewerDb(), 'invitations', OTHER_INVITATION), {
        accessCount: increment(1),
        lastAccessedAt: serverTimestamp(),
      })
    );
  });

  it('失効した招待の accessCount は動かせない（セッションがあっても）', async () => {
    await seedSession(env, VIEWER_UID, EXPIRED_INVITATION);
    await assertFails(
      updateDoc(doc(viewerDb(), 'invitations', EXPIRED_INVITATION), {
        accessCount: increment(1),
        lastAccessedAt: serverTimestamp(),
      })
    );
  });

  it('匿名ユーザーは招待を作れない / 消せない', async () => {
    await assertFails(
      setDoc(doc(viewerDb(), 'invitations', 'forged'), {
        projectId: PROJECT_ID_DOC,
        isActive: true,
        imageIds: [],
        accessCount: 0,
        expiresAt: Timestamp.fromMillis(Date.now() + 1000),
      })
    );
    await assertFails(deleteDoc(doc(viewerDb(), 'invitations', ACTIVE_INVITATION)));
  });
});

describe('sessions', () => {
  it('有効な招待に対してセッションを作れる', async () => {
    await assertSucceeds(
      setDoc(doc(viewerDb(), 'sessions', VIEWER_UID), {
        invitationId: ACTIVE_INVITATION,
        anonymousUid: VIEWER_UID,
        createdAt: serverTimestamp(),
        lastAccessedAt: serverTimestamp(),
      })
    );
  });

  it('失効した招待に対してはセッションを作れない（S4-B3）', async () => {
    await assertFails(
      setDoc(doc(viewerDb(), 'sessions', VIEWER_UID), {
        invitationId: EXPIRED_INVITATION,
        anonymousUid: VIEWER_UID,
        createdAt: serverTimestamp(),
        lastAccessedAt: serverTimestamp(),
      })
    );
    await assertFails(
      setDoc(doc(viewerDb(), 'sessions', VIEWER_UID), {
        invitationId: INACTIVE_INVITATION,
        anonymousUid: VIEWER_UID,
        createdAt: serverTimestamp(),
        lastAccessedAt: serverTimestamp(),
      })
    );
  });

  it('存在しない招待に対してはセッションを作れない', async () => {
    await assertFails(
      setDoc(doc(viewerDb(), 'sessions', VIEWER_UID), {
        invitationId: 'does-not-exist',
        anonymousUid: VIEWER_UID,
        createdAt: serverTimestamp(),
        lastAccessedAt: serverTimestamp(),
      })
    );
  });

  it('他人の uid のセッションは作れない', async () => {
    await assertFails(
      setDoc(doc(viewerDb(), 'sessions', OTHER_VIEWER_UID), {
        invitationId: ACTIVE_INVITATION,
        anonymousUid: OTHER_VIEWER_UID,
        createdAt: serverTimestamp(),
        lastAccessedAt: serverTimestamp(),
      })
    );
  });

  it('lastAccessedAt だけの更新は本人に許される', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertSucceeds(
      updateDoc(doc(viewerDb(), 'sessions', VIEWER_UID), {
        lastAccessedAt: serverTimestamp(),
      })
    );
  });

  it('有効な招待への貼り替えは許される', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertSucceeds(
      updateDoc(doc(viewerDb(), 'sessions', VIEWER_UID), {
        invitationId: OTHER_INVITATION,
        lastAccessedAt: serverTimestamp(),
      })
    );
  });

  it('失効した招待への貼り替えは拒否される', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertFails(
      updateDoc(doc(viewerDb(), 'sessions', VIEWER_UID), {
        invitationId: EXPIRED_INVITATION,
        lastAccessedAt: serverTimestamp(),
      })
    );
  });
});

describe('images', () => {
  it('匿名の閲覧者は images を1件ずつ get できる', async () => {
    await assertSucceeds(getDoc(doc(viewerDb(), 'images', IMAGE_IN_INVITATION)));
  });

  it('匿名の閲覧者は images を list できない', async () => {
    await assertFails(getDocs(collection(viewerDb(), 'images')));
  });

  it('管理者は images を list できる', async () => {
    await assertSucceeds(
      getDocs(query(collection(adminDb(), 'images'), where('projectId', '==', PROJECT_ID_DOC)))
    );
  });

  it('匿名ユーザーは images を作れない（S3）', async () => {
    await assertFails(
      setDoc(doc(viewerDb(), 'images', 'forged-image'), {
        projectId: PROJECT_ID_DOC,
        url: 'https://example.invalid/forged.jpg',
        storagePath: `images/${VIEWER_UID}/forged`,
        title: 'forged',
        userId: VIEWER_UID,
        likeCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('管理者は images を作れる / 消せる', async () => {
    await assertSucceeds(
      setDoc(doc(adminDb(), 'images', 'admin-created-image'), {
        projectId: PROJECT_ID_DOC,
        url: 'https://example.invalid/new.jpg',
        storagePath: `images/${ADMIN_UID}/new`,
        title: 'new',
        userId: ADMIN_UID,
        likeCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(deleteDoc(doc(adminDb(), 'images', IMAGE_OUTSIDE_INVITATION)));
  });

  it('匿名ユーザーは images を消せない', async () => {
    await assertFails(deleteDoc(doc(viewerDb(), 'images', IMAGE_IN_INVITATION)));
  });

  it('招待に含まれる画像の likeCount は ±1 できる', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertSucceeds(
      updateDoc(doc(viewerDb(), 'images', IMAGE_IN_INVITATION), { likeCount: increment(1) })
    );
    await assertSucceeds(
      updateDoc(doc(viewerDb(), 'images', IMAGE_IN_INVITATION), { likeCount: increment(-1) })
    );
  });

  it('招待に含まれない画像の likeCount は動かせない（S4-B1）', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertFails(
      updateDoc(doc(viewerDb(), 'images', IMAGE_OUTSIDE_INVITATION), { likeCount: increment(1) })
    );
  });

  it('失効した招待のセッションでは likeCount を動かせない（S4-B2）', async () => {
    await seedSession(env, VIEWER_UID, EXPIRED_INVITATION);
    await assertFails(
      updateDoc(doc(viewerDb(), 'images', IMAGE_IN_INVITATION), { likeCount: increment(1) })
    );
  });

  it('likeCount の ±1 以外、および他フィールドの変更は拒否される', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertFails(
      updateDoc(doc(viewerDb(), 'images', IMAGE_IN_INVITATION), { likeCount: 500 })
    );
    await assertFails(
      updateDoc(doc(viewerDb(), 'images', IMAGE_IN_INVITATION), {
        likeCount: increment(1),
        url: 'https://example.invalid/hijacked.jpg',
      })
    );
  });

  it('セッションを持たない匿名ユーザーは likeCount を動かせない', async () => {
    await assertFails(
      updateDoc(doc(viewerDb(), 'images', IMAGE_IN_INVITATION), { likeCount: increment(1) })
    );
  });
});

describe('likes', () => {
  it('有効な招待のセッションで like を作れ、likeCount が +1 される（本番のトランザクションと同じ形）', async () => {
    const db = viewerDb();
    await assertSucceeds(
      setDoc(doc(db, 'sessions', VIEWER_UID), {
        invitationId: ACTIVE_INVITATION,
        anonymousUid: VIEWER_UID,
        createdAt: serverTimestamp(),
        lastAccessedAt: serverTimestamp(),
      })
    );

    await assertSucceeds(
      runTransaction(db, async (transaction) => {
        const likeRef = doc(db, 'likes', `${ACTIVE_INVITATION}_${IMAGE_ALSO_IN_INVITATION}`);
        const likeDoc = await transaction.get(likeRef);
        expect(likeDoc.exists()).toBe(false);
        transaction.set(likeRef, {
          invitationId: ACTIVE_INVITATION,
          imageId: IMAGE_ALSO_IN_INVITATION,
          userId: VIEWER_UID,
          createdAt: serverTimestamp(),
        });
        transaction.update(doc(db, 'images', IMAGE_ALSO_IN_INVITATION), {
          likeCount: increment(1),
        });
      })
    );

    await env.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore() as unknown as Firestore;
      const snap = await getDoc(doc(admin, 'images', IMAGE_ALSO_IN_INVITATION));
      expect(snap.data()?.likeCount).toBe(1);
    });
  });

  it('失効した招待では like を作れない（S4-B2）', async () => {
    await seedSession(env, VIEWER_UID, EXPIRED_INVITATION);
    await assertFails(
      setDoc(doc(viewerDb(), 'likes', `${EXPIRED_INVITATION}_${IMAGE_IN_INVITATION}`), {
        invitationId: EXPIRED_INVITATION,
        imageId: IMAGE_IN_INVITATION,
        userId: VIEWER_UID,
        createdAt: serverTimestamp(),
      })
    );
  });

  it('招待に含まれない imageId の like は作れない（S4-B5）', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertFails(
      setDoc(doc(viewerDb(), 'likes', `${ACTIVE_INVITATION}_${IMAGE_OUTSIDE_INVITATION}`), {
        invitationId: ACTIVE_INVITATION,
        imageId: IMAGE_OUTSIDE_INVITATION,
        userId: VIEWER_UID,
        createdAt: serverTimestamp(),
      })
    );
  });

  it('自分のセッションが指していない招待の like は作れない', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertFails(
      setDoc(doc(viewerDb(), 'likes', `${OTHER_INVITATION}_${IMAGE_IN_INVITATION}`), {
        invitationId: OTHER_INVITATION,
        imageId: IMAGE_IN_INVITATION,
        userId: VIEWER_UID,
        createdAt: serverTimestamp(),
      })
    );
  });

  it('ドキュメント ID が invitationId_imageId でない like は作れない', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertFails(
      setDoc(doc(viewerDb(), 'likes', 'arbitrary-id'), {
        invitationId: ACTIVE_INVITATION,
        imageId: IMAGE_IN_INVITATION,
        userId: VIEWER_UID,
        createdAt: serverTimestamp(),
      })
    );
  });

  it('like の list は自分のセッションの招待に限定される', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    const db = viewerDb();
    await assertSucceeds(
      getDocs(query(collection(db, 'likes'), where('invitationId', '==', ACTIVE_INVITATION)))
    );
    await assertFails(
      getDocs(query(collection(db, 'likes'), where('invitationId', '==', OTHER_INVITATION)))
    );
    await assertFails(getDocs(collection(db, 'likes')));
  });

  it('失効した招待では like を list できない', async () => {
    await seedSession(env, VIEWER_UID, EXPIRED_INVITATION);
    await assertFails(
      getDocs(query(collection(viewerDb(), 'likes'), where('invitationId', '==', EXPIRED_INVITATION)))
    );
  });

  it('自分の招待の like は削除できるが、他の招待の like は削除できない', async () => {
    await seedSession(env, VIEWER_UID, ACTIVE_INVITATION);
    await assertFails(
      deleteDoc(doc(viewerDb(), 'likes', `${OTHER_INVITATION}_${IMAGE_IN_INVITATION}`))
    );
    await assertSucceeds(
      deleteDoc(doc(viewerDb(), 'likes', `${ACTIVE_INVITATION}_${IMAGE_IN_INVITATION}`))
    );
  });

  it('管理者は招待横断で like を list / delete できる', async () => {
    await assertSucceeds(
      getDocs(query(collection(adminDb(), 'likes'), where('imageId', '==', IMAGE_IN_INVITATION)))
    );
    await assertSucceeds(
      deleteDoc(doc(adminDb(), 'likes', `${OTHER_INVITATION}_${IMAGE_IN_INVITATION}`))
    );
  });
});

describe('projects', () => {
  it('管理者は projects を list できる', async () => {
    await assertSucceeds(getDocs(collection(adminDb(), 'projects')));
  });

  it('匿名ユーザーは projects を読めない', async () => {
    await assertFails(getDocs(collection(viewerDb(), 'projects')));
    await assertFails(getDoc(doc(viewerDb(), 'projects', PROJECT_ID_DOC)));
  });

  it('未認証のリクエストは何も読めない', async () => {
    await assertFails(getDoc(doc(anonDb(), 'invitations', ACTIVE_INVITATION)));
    await assertFails(getDoc(doc(anonDb(), 'images', IMAGE_IN_INVITATION)));
  });
});
