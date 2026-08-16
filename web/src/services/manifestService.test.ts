import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 認可ロジックの検証。
 *
 * ここが「ネイティブに保存させてよい画像」を決める唯一の場所なので、
 * 招待に属さない imageId・期限切れ・無効化のそれぞれが拒否されることを固定する。
 */

const getDoc = vi.fn();
const getDocs = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => ({ __collection: args }),
  doc: (_db: unknown, path: string, id: string) => ({ __doc: `${path}/${id}` }),
  getDoc: (...args: unknown[]) => getDoc(...args),
  getDocs: (...args: unknown[]) => getDocs(...args),
  limit: (n: number) => ({ __limit: n }),
  query: (...args: unknown[]) => ({ __query: args }),
  where: (...args: unknown[]) => ({ __where: args }),
}));

import { filenameFor, resolveManifest } from './manifestService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = {} as any;

const NOW = new Date('2026-08-16T00:00:00Z');

function invitationDoc(overrides: Record<string, unknown> = {}) {
  return {
    exists: () => true,
    id: 'tok',
    data: () => ({
      token: 'tok',
      imageIds: ['img1', 'img2'],
      isActive: true,
      createdAt: { toDate: () => new Date('2026-08-14T00:00:00Z') },
      expiresAt: { toDate: () => new Date('2026-08-20T00:00:00Z') },
      ...overrides,
    }),
  };
}

function imageDoc(id: string) {
  return {
    exists: () => true,
    id,
    data: () => ({
      url: `https://firebasestorage.googleapis.com/v0/b/photo-gallery-app-20251204.firebasestorage.app/o/images%2Fuid%2F${id}.jpg?alt=media`,
      storagePath: `images/uid/${id}.jpg`,
      title: `DSC_${id}`,
    }),
  };
}

const missingDoc = { exists: () => false, id: 'x', data: () => undefined };

beforeEach(() => {
  vi.clearAllMocks();
  getDocs.mockResolvedValue({ empty: true, docs: [] });
});

describe('resolveManifest / 入力検証', () => {
  it('token が無ければ 400', async () => {
    expect(await resolveManifest(db, undefined, ['img1'], NOW)).toMatchObject({
      status: 400,
    });
    expect(await resolveManifest(db, '', ['img1'], NOW)).toMatchObject({ status: 400 });
  });

  it('imageIds が空・非配列・文字列以外を含む場合は 400', async () => {
    expect(await resolveManifest(db, 'tok', [], NOW)).toMatchObject({ status: 400 });
    expect(await resolveManifest(db, 'tok', 'img1', NOW)).toMatchObject({ status: 400 });
    expect(await resolveManifest(db, 'tok', [1, 2], NOW)).toMatchObject({ status: 400 });
  });

  it('件数上限を超えたら 400', async () => {
    const many = Array.from({ length: 501 }, (_, i) => `img${i}`);
    expect(await resolveManifest(db, 'tok', many, NOW)).toMatchObject({ status: 400 });
  });
});

describe('resolveManifest / 認可', () => {
  it('招待に属する imageId は URL を返す', async () => {
    getDoc
      .mockResolvedValueOnce(invitationDoc())
      .mockResolvedValueOnce(imageDoc('img1'));

    const result = await resolveManifest(db, 'tok', ['img1'], NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        imageId: 'img1',
        filename: 'img1.jpg',
      });
      expect(result.items[0].url).toContain('firebasestorage.googleapis.com');
    }
  });

  // 本計画の中心。ここが通ってしまうと他クライアントの写真を保存できる。
  it('招待に属さない imageId は 403 で全体を拒否する', async () => {
    getDoc.mockResolvedValueOnce(invitationDoc());

    const result = await resolveManifest(db, 'tok', ['img1', 'other'], NOW);
    expect(result).toMatchObject({ status: 403, code: 'forbidden' });
  });

  it('1件でも属さなければ部分的にも返さない', async () => {
    getDoc.mockResolvedValueOnce(invitationDoc());

    const result = await resolveManifest(db, 'tok', ['other'], NOW);
    expect(result.ok).toBe(false);
    // 画像ドキュメントの取得まで進んでいないこと（存在の有無を漏らさない）
    expect(getDoc).toHaveBeenCalledTimes(1);
  });

  it('無効化された招待は 403', async () => {
    getDoc.mockResolvedValueOnce(invitationDoc({ isActive: false }));
    expect(await resolveManifest(db, 'tok', ['img1'], NOW)).toMatchObject({
      status: 403,
    });
  });

  it('expiresAt を過ぎた招待は 403', async () => {
    getDoc.mockResolvedValueOnce(
      invitationDoc({ expiresAt: { toDate: () => new Date('2026-08-15T00:00:00Z') } })
    );
    expect(await resolveManifest(db, 'tok', ['img1'], NOW)).toMatchObject({
      status: 403,
    });
  });

  it('作成から7日の閲覧期限を過ぎた招待は 403', async () => {
    getDoc.mockResolvedValueOnce(
      invitationDoc({ createdAt: { toDate: () => new Date('2026-08-01T00:00:00Z') } })
    );
    expect(await resolveManifest(db, 'tok', ['img1'], NOW)).toMatchObject({
      status: 403,
    });
  });

  it('存在しないトークンは 404', async () => {
    getDoc.mockResolvedValueOnce(missingDoc);
    expect(await resolveManifest(db, 'nope', ['img1'], NOW)).toMatchObject({
      status: 404,
    });
  });

  it('ドキュメントIDで見つからなければ token フィールドで引き直す', async () => {
    getDoc.mockResolvedValueOnce(missingDoc).mockResolvedValueOnce(imageDoc('img1'));
    getDocs.mockResolvedValue({ empty: false, docs: [invitationDoc()] });

    const result = await resolveManifest(db, 'tok', ['img1'], NOW);
    expect(result.ok).toBe(true);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('画像ドキュメントが消えていても他は返す', async () => {
    getDoc
      .mockResolvedValueOnce(invitationDoc())
      .mockResolvedValueOnce(imageDoc('img1'))
      .mockResolvedValueOnce(missingDoc);

    const result = await resolveManifest(db, 'tok', ['img1', 'img2'], NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.items).toHaveLength(1);
  });

  it('重複した imageId を1件にまとめる', async () => {
    getDoc
      .mockResolvedValueOnce(invitationDoc())
      .mockResolvedValueOnce(imageDoc('img1'));

    const result = await resolveManifest(db, 'tok', ['img1', 'img1'], NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.items).toHaveLength(1);
  });
});

describe('filenameFor', () => {
  it('storagePath の末尾に拡張子があればそれを使う', () => {
    expect(filenameFor('images/uid/IMG_0012.jpg', 'https://x/y', 'id1', 'DSC05710')).toBe(
      'IMG_0012.jpg'
    );
  });

  // 実データの storagePath は `images/{uid}/1786861045375-0ubf6g` のように拡張子が無い。
  // その場合に imageId を使うと、写真アプリに意味のない名前が並ぶ。
  it('storagePath に拡張子が無ければ title を使う', () => {
    expect(
      filenameFor(
        'images/uid/1786861045375-0ubf6g',
        'https://x/o/images%2Fuid%2F1786861045375-0ubf6g?alt=media',
        'bgIVseNkms1ol613Qwy0',
        'DSC05710'
      )
    ).toBe('DSC05710.jpg');
  });

  it('URL から拡張子を導出して title に付ける', () => {
    expect(filenameFor(undefined, 'https://x/y/a.png?alt=media', 'id1', 'DSC05710')).toBe(
      'DSC05710.png'
    );
  });

  it('title が無ければ imageId にフォールバックする', () => {
    expect(filenameFor(undefined, 'https://x/y/a.png', 'id1')).toBe('id1.png');
    expect(filenameFor(undefined, 'https://x/y/a.png', 'id1', '')).toBe('id1.png');
  });

  it('拡張子がどこからも取れなければ jpg にする', () => {
    expect(filenameFor(undefined, 'not a url', 'id1', 'DSC05710')).toBe('DSC05710.jpg');
    expect(filenameFor(null, null, 'id1')).toBe('id1.jpg');
  });

  // native 側（validate.ts）はパス区切りを含むファイル名を拒否するため、
  // ここで無害化しておかないと保存が丸ごと失敗する
  it('title のパス区切りを下線に置き換える', () => {
    expect(filenameFor(undefined, 'https://x/y/a.jpg', 'id1', 'a/b\\c')).toBe(
      'a_b_c.jpg'
    );
  });

  it('title の制御文字を取り除く', () => {
    expect(filenameFor(undefined, 'https://x/y/a.jpg', 'id1', 'A\u0000B\u000aC')).toBe(
      'ABC.jpg'
    );
  });

  it("'..' で始まる title は使わず imageId にフォールバックする", () => {
    expect(filenameFor(undefined, 'https://x/y/a.jpg', 'id1', '../../etc/passwd')).toBe(
      'id1.jpg'
    );
  });

  it('長すぎる title を切り詰める', () => {
    const long = 'A'.repeat(200);
    const result = filenameFor(undefined, 'https://x/y/a.jpg', 'id1', long);
    expect(result.length).toBeLessThanOrEqual(105);
    expect(result.endsWith('.jpg')).toBe(true);
  });

  it('日本語の title を通す', () => {
    expect(filenameFor(undefined, 'https://x/y/a.jpg', 'id1', '前撮り_001')).toBe(
      '前撮り_001.jpg'
    );
  });
});
