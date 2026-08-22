import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 招待の取得結果の分類。
 *
 * ネイティブアプリは、この分類が `denied` のときだけ保存済みトークンを破棄する。
 * したがって**誤分類が直接ユーザーの被害になる**。
 *
 * - `unavailable` を `denied` と誤ると、電波の悪い場所でアプリを開いただけで
 *   有効なトークンが端末から消える
 * - `denied` を `unavailable` と誤ると、無効なトークンが残り続けて
 *   アプリが回復不能な行き止まりに戻る
 */

const mocks = {
  getDoc: vi.fn(),
  doc: vi.fn((_db: unknown, coll: string, id: string) => `${coll}/${id}`),
};

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mocks.doc(...(args as [unknown, string, string])),
  getDoc: (...args: unknown[]) => mocks.getDoc(...args),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  increment: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

let service: typeof import('./invitationService');

const snapshot = (data: Record<string, unknown>, fromCache = false) => ({
  exists: () => true,
  id: 'tok-123',
  metadata: { fromCache },
  data: () => data,
});

const firebaseError = (code: string) => Object.assign(new Error(code), { code });

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.doc.mockImplementation((_db, coll: string, id: string) => `${coll}/${id}`);
  service = await import('./invitationService');
});

describe('lookupInvitation', () => {
  it('取得できたら found と招待を返す', async () => {
    mocks.getDoc.mockResolvedValue(
      snapshot({ token: 'tok-123', clientName: 'sawada', imageIds: ['a', 'b'] })
    );

    const result = await service.lookupInvitation('tok-123');

    expect(result.status).toBe('found');
    if (result.status !== 'found') throw new Error('unreachable');
    expect(result.invitation.clientName).toBe('sawada');
    expect(result.invitation.imageIds).toEqual(['a', 'b']);
    expect(result.fromCache).toBe(false);
  });

  it('キャッシュ由来かどうかを返す', async () => {
    mocks.getDoc.mockResolvedValue(snapshot({ token: 'tok-123' }, true));

    const result = await service.lookupInvitation('tok-123');

    expect(result.status).toBe('found');
    if (result.status !== 'found') throw new Error('unreachable');
    expect(result.fromCache).toBe(true);
  });

  // サーバーが拒否した。不存在・無効化・期限切れのいずれかだが、
  // クライアントからは区別できない（区別できるとトークンの実在が漏れる）。
  it('permission-denied は denied として扱う', async () => {
    mocks.getDoc.mockRejectedValue(firebaseError('permission-denied'));

    expect((await service.lookupInvitation('tok-123')).status).toBe('denied');
  });

  // **これがこの修正の核心。** ここを denied にすると、電波の悪い場所で
  // アプリを開いただけで有効なトークンが消える。
  it('unavailable は denied にしない', async () => {
    mocks.getDoc.mockRejectedValue(firebaseError('unavailable'));

    expect((await service.lookupInvitation('tok-123')).status).toBe('unavailable');
  });

  it('code を持たない例外も denied にしない', async () => {
    mocks.getDoc.mockRejectedValue(new Error('boom'));

    expect((await service.lookupInvitation('tok-123')).status).toBe('unavailable');
  });

  it('code が未知の FirebaseError も denied にしない', async () => {
    mocks.getDoc.mockRejectedValue(firebaseError('deadline-exceeded'));

    expect((await service.lookupInvitation('tok-123')).status).toBe('unavailable');
  });

  // 現行のルールは resource.data を評価するため、存在しない招待も
  // permission-denied になる（2026-08-22 に本番で実測）。ここに来ることは無い想定だが、
  // 将来ルールが変わって素通りしたときに「有効な招待」として扱わないようにする。
  it('exists() が false なら denied として扱う', async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => false,
      id: 'tok-123',
      metadata: { fromCache: false },
      data: () => undefined,
    });

    expect((await service.lookupInvitation('tok-123')).status).toBe('denied');
  });

  it('コレクションクエリを使わず単一ドキュメント取得で引く', async () => {
    mocks.getDoc.mockResolvedValue(snapshot({ token: 'tok-123' }));

    await service.lookupInvitation('tok-123');

    // list を使う実装に戻ると、匿名認証だけで招待を全件列挙できる状態に戻る
    expect(mocks.doc).toHaveBeenCalledWith({}, 'invitations', 'tok-123');
    expect(mocks.getDoc).toHaveBeenCalledWith('invitations/tok-123');
  });
});

describe('getInvitationByToken（既存の呼び出し互換）', () => {
  it('取得できたら招待を返す', async () => {
    mocks.getDoc.mockResolvedValue(snapshot({ token: 'tok-123', clientName: 'sawada' }));

    expect((await service.getInvitationByToken('tok-123'))?.clientName).toBe('sawada');
  });

  it('拒否も一時障害もどちらも null に正規化する', async () => {
    mocks.getDoc.mockRejectedValue(firebaseError('permission-denied'));
    expect(await service.getInvitationByToken('tok-123')).toBeNull();

    mocks.getDoc.mockRejectedValue(firebaseError('unavailable'));
    expect(await service.getInvitationByToken('tok-123')).toBeNull();
  });
});

describe('validateInvitation', () => {
  const base = {
    id: 'x',
    token: 'x',
    clientName: 'c',
    createdBy: 'u',
    imageIds: ['a'],
    accessCount: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
  };

  it('有効な招待を通す', () => {
    expect(service.validateInvitation({ ...base }).valid).toBe(true);
  });

  it('無効化・期限切れ・閲覧期限切れで同じ文言を返す', () => {
    const reasons = [
      service.validateInvitation({ ...base, isActive: false }).reason,
      service.validateInvitation({ ...base, expiresAt: new Date(Date.now() - 1) }).reason,
      service.validateInvitation({
        ...base,
        createdAt: new Date(Date.now() - 8 * 86400000),
      }).reason,
    ];

    // 撃ち分けるとトークンの実在を第三者に伝えることになる
    expect(new Set(reasons).size).toBe(1);
    expect(reasons[0]).toBe(service.INVALID_INVITATION_MESSAGE);
  });
});
