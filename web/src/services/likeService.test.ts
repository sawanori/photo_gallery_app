import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * お気に入りの鍵が招待 ID であることを固定する。
 *
 * 匿名 UID を鍵にすると、同じ招待リンクでもブラウザとアプリで別人扱いになり、
 * クライアントがブラウザで選んだお気に入りがアプリで消える。WebView は Safari とは
 * 別のストレージを持つため、ネイティブアプリでは必ず起きる。
 * Firestore ルールもこの ID 形式（`{invitationId}_{imageId}`）を前提にしているので、
 * 形式が変わると書き込み自体が拒否される。
 */

const mocks = {
  doc: vi.fn(),
  collection: vi.fn(),
  getDoc: vi.fn(),
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
  getDoc: (...args: unknown[]) => mocks.getDoc(...args),
  getDocs: (...args: unknown[]) => mocks.getDocs(...args),
  query: (...args: unknown[]) => mocks.query(...args),
  where: (...args: unknown[]) => mocks.where(...args),
  runTransaction: (...args: unknown[]) => mocks.runTransaction(...args),
  serverTimestamp: () => mocks.serverTimestamp(),
  increment: (n: number) => mocks.increment(n),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

let likeService: typeof import('./likeService');

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.doc.mockImplementation((_db: unknown, coll: string, id: string) => `${coll}/${id}`);
  mocks.serverTimestamp.mockReturnValue('server-time');
  mocks.increment.mockImplementation((n: number) => ({ __increment: n }));
  likeService = await import('./likeService');
});

describe('likeService', () => {
  it('お気に入りの ID は招待 ID と画像 ID から作る', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => true });

    await likeService.hasLiked('inv-1', 'img-9');

    expect(mocks.doc).toHaveBeenCalledWith({}, 'likes', 'inv-1_img-9');
  });

  it('匿名 UID を鍵にしない（同じ招待なら端末が変わっても同じ ID）', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });

    await likeService.hasLiked('inv-1', 'img-9');
    const first = mocks.doc.mock.calls.at(-1);
    mocks.doc.mockClear();
    await likeService.hasLiked('inv-1', 'img-9');
    const second = mocks.doc.mock.calls.at(-1);

    expect(second).toEqual(first);
  });

  it('お気に入りの登録で invitationId を保存する', async () => {
    const set = vi.fn();
    const update = vi.fn();
    mocks.runTransaction.mockImplementation(
      async (_db: unknown, fn: (t: unknown) => Promise<void>) =>
        fn({ get: async () => ({ exists: () => false }), set, update })
    );

    await likeService.likeImage('inv-1', 'img-9', 'anon-uid');

    expect(set).toHaveBeenCalledWith(
      'likes/inv-1_img-9',
      expect.objectContaining({
        invitationId: 'inv-1',
        imageId: 'img-9',
        userId: 'anon-uid',
      })
    );
    expect(update).toHaveBeenCalledWith('images/img-9', { likeCount: { __increment: 1 } });
  });

  it('お気に入りの解除で likeCount を1減らす', async () => {
    const del = vi.fn();
    const update = vi.fn();
    mocks.runTransaction.mockImplementation(
      async (_db: unknown, fn: (t: unknown) => Promise<void>) =>
        fn({ get: async () => ({ exists: () => true }), delete: del, update })
    );

    await likeService.unlikeImage('inv-1', 'img-9');

    expect(del).toHaveBeenCalledWith('likes/inv-1_img-9');
    expect(update).toHaveBeenCalledWith('images/img-9', { likeCount: { __increment: -1 } });
  });

  it('一覧の取得は invitationId で絞る（userId では絞らない）', async () => {
    mocks.getDocs.mockResolvedValue({
      docs: [{ data: () => ({ imageId: 'img-1' }) }, { data: () => ({ imageId: 'img-2' }) }],
    });

    const result = await likeService.getLikedImageIds('inv-1');

    expect(mocks.where).toHaveBeenCalledWith('invitationId', '==', 'inv-1');
    expect(mocks.where).not.toHaveBeenCalledWith('userId', '==', expect.anything());
    expect(result).toEqual(['img-1', 'img-2']);
  });
});
