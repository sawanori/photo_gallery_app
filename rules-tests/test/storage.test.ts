import { beforeAll, beforeEach, afterAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage';
import {
  ADMIN_UID,
  OTHER_ADMIN_UID,
  VIEWER_UID,
  getTestEnv,
  pngBytes,
  seed,
  seedStorageObject,
} from './helpers';

let env: RulesTestEnvironment;

const viewerStorage = () =>
  env.authenticatedContext(VIEWER_UID).storage() as unknown as FirebaseStorage;
const adminStorage = () =>
  env.authenticatedContext(ADMIN_UID).storage() as unknown as FirebaseStorage;
const otherAdminStorage = () =>
  env.authenticatedContext(OTHER_ADMIN_UID).storage() as unknown as FirebaseStorage;
const anonStorage = () => env.unauthenticatedContext().storage() as unknown as FirebaseStorage;

const IMAGE_META = { contentType: 'image/png' };

beforeAll(async () => {
  env = await getTestEnv();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  // isAdmin() は Firestore の users を読む（クロスサービス参照）ので土台が要る。
  await seed(env);
});

afterAll(async () => {
  await env?.cleanup();
});

describe('storage: images', () => {
  it('匿名ユーザーは自分の uid 配下にもアップロードできない（S1）', async () => {
    await assertFails(
      uploadBytes(ref(viewerStorage(), `images/${VIEWER_UID}/x.png`), pngBytes(), IMAGE_META)
    );
  });

  it('管理者は自分の uid 配下にアップロードできる', async () => {
    await assertSucceeds(
      uploadBytes(ref(adminStorage(), `images/${ADMIN_UID}/x.png`), pngBytes(), IMAGE_META)
    );
    await assertSucceeds(
      uploadBytes(
        ref(adminStorage(), `thumbnails/${ADMIN_UID}/x_384.png`),
        pngBytes(),
        IMAGE_META
      )
    );
  });

  it('管理者でもパスの uid が自分でなければアップロードできない', async () => {
    await assertFails(
      uploadBytes(ref(adminStorage(), `images/${OTHER_ADMIN_UID}/x.png`), pngBytes(), IMAGE_META)
    );
  });

  it('画像以外の contentType は拒否される', async () => {
    await assertFails(
      uploadBytes(ref(adminStorage(), `images/${ADMIN_UID}/x.txt`), pngBytes(), {
        contentType: 'text/plain',
      })
    );
  });

  it('管理者は他の管理者がアップロードしたファイルを削除できる（S2）', async () => {
    await seedStorageObject(env, `images/${ADMIN_UID}/orphan.png`);
    await seedStorageObject(env, `thumbnails/${ADMIN_UID}/orphan_384.png`);
    await assertSucceeds(
      deleteObject(ref(otherAdminStorage(), `images/${ADMIN_UID}/orphan.png`))
    );
    await assertSucceeds(
      deleteObject(ref(otherAdminStorage(), `thumbnails/${ADMIN_UID}/orphan_384.png`))
    );
  });

  it('匿名ユーザーは削除できない', async () => {
    await seedStorageObject(env, `images/${ADMIN_UID}/keep.png`);
    await assertFails(deleteObject(ref(viewerStorage(), `images/${ADMIN_UID}/keep.png`)));
  });

  it('匿名の閲覧者は読める', async () => {
    await seedStorageObject(env, `images/${ADMIN_UID}/readable.png`);
    await assertSucceeds(getBytes(ref(viewerStorage(), `images/${ADMIN_UID}/readable.png`)));
  });

  it('未認証のリクエストは読めない', async () => {
    await seedStorageObject(env, `images/${ADMIN_UID}/readable.png`);
    await assertFails(getBytes(ref(anonStorage(), `images/${ADMIN_UID}/readable.png`)));
  });

  it('ルールが書かれていないパスへの書き込みは拒否される', async () => {
    await assertFails(
      uploadBytes(ref(adminStorage(), `profiles/${ADMIN_UID}/avatar.png`), pngBytes(), IMAGE_META)
    );
  });
});
