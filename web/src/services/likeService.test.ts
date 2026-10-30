import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * お気に入りの鍵が招待の likeScope で決まることを固定する。
 *
 * shared（既定）で匿名 UID を鍵にすると、同じ招待リンクでもブラウザとアプリで別人扱いになり、
 * クライアントがブラウザで選んだお気に入りがアプリで消える。WebView は Safari とは
 * 別のストレージを持つため、ネイティブアプリでは必ず起きる。
 * perDevice では逆に、参加者どうしのいいねが混ざらないよう匿名 UID を鍵にする。
 * Firestore ルールもこれらの ID 形式を前提にしているので、形式が変わると書き込み自体が拒否される。
 */

const mocks = {
  doc: vi.fn(),
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-time'),
  increment: vi.fn((n: number) => ({ __increment: n })),
};

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mocks.doc(...args),
  collection: (...args: unknown[]) => mocks.collection(...args),
  getDocs: (...args: unknown[]) => mocks.getDocs(...args),
  query: (...args: unknown[]) => mocks.query(...args),
  where: (...args: unknown[]) => mocks.where(...args),
  runTransaction: (...args: unknown[]) => mocks.runTransaction(...args),
  serverTimestamp: () => mocks.serverTimestamp(),
  increment: (n: number) => mocks.increment(n),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

let likeService: typeof import('./likeService');

const SHARED = { id: 'inv-1' };
const PER_DEVICE = { id: 'inv-1', likeScope: 'perDevice' as const };

/** transaction を差し替えて setLiked を実行する。like 文書の有無を exists で与える。 */
function mockTransaction(exists: boolean) {
  const transaction = {
    get: vi.fn(async () => ({ exists: () => exists })),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  mocks.runTransaction.mockImplementation(
    async (_db: unknown, fn: (t: unknown) => Promise<void>) => fn(transaction)
  );
  return transaction;
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.doc.mockImplementation((_db: unknown, coll: string, id: string) => `${coll}/${id}`);
  mocks.serverTimestamp.mockReturnValue('server-time');
  mocks.increment.mockImplementation((n: number) => ({ __increment: n }));
  likeService = await import('./likeService');
});

describe('setLiked / shared', () => {
  it('お気に入りの ID は招待 ID と画像 ID から作る', async () => {
    const transaction = mockTransaction(false);

    await likeService.setLiked(SHARED, 'img-9', 'anon-uid', true);

    expect(transaction.get).toHaveBeenCalledWith('likes/inv-1_img-9');
  });

  it('匿名 UID を鍵にしない（同じ招待なら端末が変わっても同じ ID）', async () => {
    const transaction = mockTransaction(false);

    await likeService.setLiked(SHARED, 'img-9', 'uid-a', true);
    await likeService.setLiked(SHARED, 'img-9', 'uid-b', true);

    expect(transaction.get.mock.calls[0]).toEqual(transaction.get.mock.calls[1]);
  });

  it('お気に入りの登録で invitationId を保存し、likeCount を1増やす', async () => {
    const transaction = mockTransaction(false);

    await likeService.setLiked(SHARED, 'img-9', 'anon-uid', true);

    expect(transaction.set).toHaveBeenCalledWith(
      'likes/inv-1_img-9',
      expect.objectContaining({
        invitationId: 'inv-1',
        imageId: 'img-9',
        userId: 'anon-uid',
      })
    );
    expect(transaction.update).toHaveBeenCalledWith('images/img-9', {
      likeCount: { __increment: 1 },
    });
  });

  it('お気に入りの解除で likeCount を1減らす', async () => {
    const transaction = mockTransaction(true);

    await likeService.setLiked(SHARED, 'img-9', 'anon-uid', false);

    expect(transaction.delete).toHaveBeenCalledWith('likes/inv-1_img-9');
    expect(transaction.update).toHaveBeenCalledWith('images/img-9', {
      likeCount: { __increment: -1 },
    });
  });

  it('未知の likeScope は shared として扱う', async () => {
    const transaction = mockTransaction(false);

    await likeService.setLiked(
      { id: 'inv-1', likeScope: 'unknown' as never },
      'img-9',
      'anon-uid',
      true
    );

    expect(transaction.get).toHaveBeenCalledWith('likes/inv-1_img-9');
    expect(transaction.update).toHaveBeenCalled();
  });
});

describe('setLiked / perDevice', () => {
  it('お気に入りの ID に匿名 UID を含める', async () => {
    const transaction = mockTransaction(false);

    await likeService.setLiked(PER_DEVICE, 'img-9', 'anon-uid', true);

    expect(transaction.set).toHaveBeenCalledWith(
      'likes/inv-1_anon-uid_img-9',
      expect.objectContaining({
        invitationId: 'inv-1',
        imageId: 'img-9',
        userId: 'anon-uid',
      })
    );
  });

  it('端末が違えば別の ID になる', async () => {
    const transaction = mockTransaction(false);

    await likeService.setLiked(PER_DEVICE, 'img-9', 'uid-a', true);
    await likeService.setLiked(PER_DEVICE, 'img-9', 'uid-b', true);

    expect(transaction.get).toHaveBeenNthCalledWith(1, 'likes/inv-1_uid-a_img-9');
    expect(transaction.get).toHaveBeenNthCalledWith(2, 'likes/inv-1_uid-b_img-9');
  });

  it('likeCount を更新しない（登録でも解除でも）', async () => {
    const adding = mockTransaction(false);
    await likeService.setLiked(PER_DEVICE, 'img-9', 'anon-uid', true);
    expect(adding.update).not.toHaveBeenCalled();

    const removing = mockTransaction(true);
    await likeService.setLiked(PER_DEVICE, 'img-9', 'anon-uid', false);
    expect(removing.delete).toHaveBeenCalledWith('likes/inv-1_anon-uid_img-9');
    expect(removing.update).not.toHaveBeenCalled();
  });
});

// 2 つのタブで同時に押す、画面が古い、といった場合に例外で画面を巻き戻さないため
describe('setLiked / 既に目的の状態', () => {
  it.each([
    ['shared', SHARED],
    ['perDevice', PER_DEVICE],
  ])('%s: 登録済みを登録しても書き込まず、例外にならない', async (_name, invitation) => {
    const transaction = mockTransaction(true);

    await expect(
      likeService.setLiked(invitation, 'img-9', 'anon-uid', true)
    ).resolves.toBeUndefined();

    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it.each([
    ['shared', SHARED],
    ['perDevice', PER_DEVICE],
  ])('%s: 未登録を解除しても書き込まず、例外にならない', async (_name, invitation) => {
    const transaction = mockTransaction(false);

    await expect(
      likeService.setLiked(invitation, 'img-9', 'anon-uid', false)
    ).resolves.toBeUndefined();

    expect(transaction.delete).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
  });
});

describe('getLikedImageIds', () => {
  beforeEach(() => {
    mocks.getDocs.mockResolvedValue({
      docs: [{ data: () => ({ imageId: 'img-1' }) }, { data: () => ({ imageId: 'img-2' }) }],
    });
  });

  it('shared: invitationId で絞る（userId では絞らない）', async () => {
    const result = await likeService.getLikedImageIds(SHARED, 'anon-uid');

    expect(mocks.where).toHaveBeenCalledWith('invitationId', '==', 'inv-1');
    expect(mocks.where).not.toHaveBeenCalledWith('userId', '==', expect.anything());
    expect(result).toEqual(['img-1', 'img-2']);
  });

  it('perDevice: invitationId と自分の userId で絞る', async () => {
    const result = await likeService.getLikedImageIds(PER_DEVICE, 'anon-uid');

    expect(mocks.where).toHaveBeenCalledWith('invitationId', '==', 'inv-1');
    expect(mocks.where).toHaveBeenCalledWith('userId', '==', 'anon-uid');
    expect(result).toEqual(['img-1', 'img-2']);
  });
});
