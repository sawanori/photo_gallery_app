import { MANIFEST_CHUNK_SIZE, MANIFEST_ENDPOINT } from '../config';
import { fetchManifest } from './manifest';

/**
 * マニフェスト取得の分割と、HTTP ステータスの読み替え。
 *
 * ここが誤ると web には「通信状況を確認してください」としか出ないため、
 * 「保存できない理由」がすべて通信障害に化ける。
 */

const originalFetch = global.fetch;
let warnSpy: jest.SpyInstance;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function itemFor(id: string) {
  return {
    imageId: id,
    url: `https://photo-gallery-app-20251204.firebasestorage.app/images/uid/${id}.jpg`,
    filename: `${id}.jpg`,
  };
}

/** 送られた imageIds を呼び出し順に取り出す。 */
function sentImageIds(mock: jest.Mock): string[][] {
  return mock.mock.calls.map((call) => JSON.parse(call[1].body).imageIds);
}

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  global.fetch = originalFetch;
  warnSpy.mockRestore();
});

describe('fetchManifest / 分割', () => {
  it('サーバーの上限以下なら1回で取得する', async () => {
    const ids = Array.from({ length: MANIFEST_CHUNK_SIZE }, (_, i) => `id${i}`);
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ items: ids.map(itemFor) }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const outcome = await fetchManifest('tok', ids);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcome.ok && outcome.items).toHaveLength(MANIFEST_CHUNK_SIZE);
  });

  // 501 件を1回で送るとサーバーが 400 を返す（web の MAX_MANIFEST_ITEMS = 500）。
  it('上限を超えたら分割して送り、結果を結合する', async () => {
    const ids = Array.from(
      { length: MANIFEST_CHUNK_SIZE + 1 },
      (_, i) => `id${i}`
    );
    const fetchMock = jest.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { imageIds: string[] };
      return jsonResponse({ items: body.imageIds.map(itemFor) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const outcome = await fetchManifest('tok', ids);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sent = sentImageIds(fetchMock as unknown as jest.Mock);
    expect(sent[0]).toHaveLength(MANIFEST_CHUNK_SIZE);
    expect(sent[1]).toEqual(['id500']);
    // どの分割もサーバーの上限を超えない
    for (const chunk of sent) {
      expect(chunk.length).toBeLessThanOrEqual(MANIFEST_CHUNK_SIZE);
    }
    expect(outcome.ok && outcome.items.map((i) => i.imageId)).toEqual(ids);
  });

  it('0件なら通信しない', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const outcome = await fetchManifest('tok', []);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(outcome).toEqual({ ok: true, items: [] });
  });

  it('途中の分割が失敗したら全体を失敗にする', async () => {
    const ids = Array.from(
      { length: MANIFEST_CHUNK_SIZE + 1 },
      (_, i) => `id${i}`
    );
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
    global.fetch = fetchMock as unknown as typeof fetch;

    const outcome = await fetchManifest('tok', ids);

    expect(outcome).toEqual({ ok: false, reason: 'manifest_failed' });
  });

  it('トークンとエンドポイントを毎回同じにする', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ items: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchManifest('tok', ['a']);

    expect(fetchMock).toHaveBeenCalledWith(
      MANIFEST_ENDPOINT,
      expect.objectContaining({ method: 'POST' })
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      token: 'tok',
      imageIds: ['a'],
    });
  });
});

describe('fetchManifest / HTTP ステータス', () => {
  it.each([403, 404])('%d は unauthorized（招待が無効）', async (status) => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({}, status)) as unknown as typeof fetch;

    expect(await fetchManifest('tok', ['a'])).toEqual({
      ok: false,
      reason: 'unauthorized',
    });
  });

  it.each([400, 429, 500])('%d は manifest_failed', async (status) => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({}, status)) as unknown as typeof fetch;

    expect(await fetchManifest('tok', ['a'])).toEqual({
      ok: false,
      reason: 'manifest_failed',
    });
  });

  it('通信例外は manifest_failed', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    expect(await fetchManifest('tok', ['a'])).toEqual({
      ok: false,
      reason: 'manifest_failed',
    });
  });
});

describe('fetchManifest / 応答の検証', () => {
  it('items でない応答を拒否する', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ items: 'nope' })) as unknown as typeof fetch;

    expect(await fetchManifest('tok', ['a'])).toEqual({
      ok: false,
      reason: 'manifest_failed',
    });
  });

  it('形の壊れた要素だけを捨てる', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        items: [
          itemFor('good'),
          { imageId: 'no-url', filename: 'a.jpg' },
          { url: 'https://x/', filename: 'a.jpg' },
          null,
        ],
      })
    ) as unknown as typeof fetch;

    const outcome = await fetchManifest('tok', ['good']);
    expect(outcome.ok && outcome.items.map((i) => i.imageId)).toEqual(['good']);
  });

  it('bytes は正の数のときだけ採用する', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        items: [
          { ...itemFor('a'), bytes: 4096 },
          { ...itemFor('b'), bytes: 0 },
          { ...itemFor('c'), bytes: 'many' },
          itemFor('d'),
        ],
      })
    ) as unknown as typeof fetch;

    const outcome = await fetchManifest('tok', ['a', 'b', 'c', 'd']);
    expect(outcome.ok && outcome.items.map((i) => i.bytes)).toEqual([
      4096,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
