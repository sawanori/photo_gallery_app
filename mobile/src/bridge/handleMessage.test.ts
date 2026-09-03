import { MAX_BATCH_ITEMS } from '../config';
import { BRIDGE_VERSION, type OutboundMessage } from './protocol';

/**
 * web から届いたメッセージの捌き方。
 *
 * ここが返す errorCode がそのまま web の文言になる。
 * 「保存できない理由」を通信障害に丸めないこと、同じ requestId で二重に動かないこと、
 * 途中で失敗しても必ず結果を1回返すことを固定する。
 */

jest.mock('../save/manifest', () => ({
  fetchManifest: jest.fn(),
}));

jest.mock('../save/saveBatch', () => ({
  saveMany: jest.fn(),
}));

jest.mock('../save/saveToLibrary', () => ({
  saveOne: jest.fn(),
}));

import { Linking } from 'react-native';

import { createMessageHandler } from './handleMessage';
import { fetchManifest } from '../save/manifest';
import { saveMany } from '../save/saveBatch';
import { saveOne } from '../save/saveToLibrary';

const manifestMock = fetchManifest as jest.MockedFunction<typeof fetchManifest>;
const saveManyMock = saveMany as jest.MockedFunction<typeof saveMany>;
const saveOneMock = saveOne as jest.MockedFunction<typeof saveOne>;
// react-native をまるごと差し替えると jest-expo の初期化が壊れるため、
// 使う1関数だけ差し替える。
const openSettingsMock = jest
  .spyOn(Linking, 'openSettings')
  .mockResolvedValue(undefined);

const NONCE = 'test-nonce';

const item = (id: string) => ({
  imageId: id,
  url: `https://photo-gallery-app-20251204.firebasestorage.app/images/uid/${id}.jpg`,
  filename: `${id}.jpg`,
});

function raw(message: Record<string, unknown>): string {
  return JSON.stringify({ v: BRIDGE_VERSION, nonce: NONCE, ...message });
}

function setup() {
  const sent: OutboundMessage[] = [];
  const invalidated: string[] = [];
  const handler = createMessageHandler(
    NONCE,
    (message) => sent.push(message),
    (token) => invalidated.push(token)
  );
  return { handler, sent, invalidated };
}

/** saveResult だけを取り出す。 */
function results(sent: OutboundMessage[]) {
  return sent.filter((m) => m.type === 'saveResult');
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  saveOneMock.mockResolvedValue({ ok: true });
  saveManyMock.mockResolvedValue({ ok: true, savedCount: 0, failedCount: 0 });
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('createMessageHandler / 入力の検証', () => {
  it('nonce が違うメッセージを無視する', async () => {
    const { handler, sent } = setup();

    await handler.handle(
      JSON.stringify({
        v: BRIDGE_VERSION,
        nonce: 'wrong',
        type: 'saveImage',
        requestId: 'r1',
        token: 'tok',
        imageId: 'i1',
      })
    );

    expect(sent).toHaveLength(0);
    expect(manifestMock).not.toHaveBeenCalled();
  });

  it('壊れた JSON と未知の type を無視する', async () => {
    const { handler, sent } = setup();

    await handler.handle('{');
    await handler.handle(raw({ type: 'somethingNew', requestId: 'r1' }));

    expect(sent).toHaveLength(0);
  });
});

describe('createMessageHandler / saveImage', () => {
  it('マニフェストで検証された URL を保存する', async () => {
    manifestMock.mockResolvedValue({ ok: true, items: [item('i1')] });
    const { handler, sent } = setup();

    await handler.handle(
      raw({ type: 'saveImage', requestId: 'r1', token: 'tok', imageId: 'i1' })
    );

    expect(manifestMock).toHaveBeenCalledWith('tok', ['i1']);
    expect(saveOneMock).toHaveBeenCalledWith(item('i1'));
    expect(results(sent)).toEqual([
      {
        v: BRIDGE_VERSION,
        type: 'saveResult',
        requestId: 'r1',
        ok: true,
        savedCount: 1,
        failedCount: 0,
        errorCode: undefined,
      },
    ]);
  });

  // 403 / 404 は「この招待では保存できない」。通信障害と混ぜない。
  it('招待が無効なら unauthorized を返す', async () => {
    manifestMock.mockResolvedValue({ ok: false, reason: 'unauthorized' });
    const { handler, sent } = setup();

    await handler.handle(
      raw({ type: 'saveImage', requestId: 'r1', token: 'tok', imageId: 'i1' })
    );

    expect(results(sent)[0]).toMatchObject({
      ok: false,
      errorCode: 'unauthorized',
      failedCount: 1,
    });
    expect(saveOneMock).not.toHaveBeenCalled();
  });

  it('マニフェスト取得の失敗は manifest_failed を返す', async () => {
    manifestMock.mockResolvedValue({ ok: false, reason: 'manifest_failed' });
    const { handler, sent } = setup();

    await handler.handle(
      raw({ type: 'saveImage', requestId: 'r1', token: 'tok', imageId: 'i1' })
    );

    expect(results(sent)[0]).toMatchObject({ errorCode: 'manifest_failed' });
  });

  it('画像が招待から消えていれば unauthorized を返す', async () => {
    manifestMock.mockResolvedValue({ ok: true, items: [] });
    const { handler, sent } = setup();

    await handler.handle(
      raw({ type: 'saveImage', requestId: 'r1', token: 'tok', imageId: 'i1' })
    );

    expect(results(sent)[0]).toMatchObject({ errorCode: 'unauthorized' });
  });

  it('保存自体の失敗をそのまま伝える', async () => {
    manifestMock.mockResolvedValue({ ok: true, items: [item('i1')] });
    saveOneMock.mockResolvedValue({ ok: false, errorCode: 'permission_denied' });
    const { handler, sent } = setup();

    await handler.handle(
      raw({ type: 'saveImage', requestId: 'r1', token: 'tok', imageId: 'i1' })
    );

    expect(results(sent)[0]).toMatchObject({
      ok: false,
      savedCount: 0,
      failedCount: 1,
      errorCode: 'permission_denied',
    });
  });
});

describe('createMessageHandler / saveImages', () => {
  it('進捗と結果を返す', async () => {
    manifestMock.mockResolvedValue({
      ok: true,
      items: [item('a'), item('b')],
    });
    saveManyMock.mockImplementation(async (_items, options) => {
      options.onProgress({ current: 1, total: 2 });
      options.onProgress({ current: 2, total: 2 });
      return { ok: true, savedCount: 2, failedCount: 0 };
    });
    const { handler, sent } = setup();

    await handler.handle(
      raw({
        type: 'saveImages',
        requestId: 'r1',
        token: 'tok',
        imageIds: ['a', 'b'],
      })
    );

    expect(sent.filter((m) => m.type === 'saveProgress')).toEqual([
      { v: BRIDGE_VERSION, type: 'saveProgress', requestId: 'r1', current: 1, total: 2 },
      { v: BRIDGE_VERSION, type: 'saveProgress', requestId: 'r1', current: 2, total: 2 },
    ]);
    expect(results(sent)[0]).toMatchObject({ ok: true, savedCount: 2 });
  });

  it('部分失敗を失敗数として返す', async () => {
    manifestMock.mockResolvedValue({
      ok: true,
      items: [item('a'), item('b'), item('c')],
    });
    saveManyMock.mockResolvedValue({ ok: false, savedCount: 2, failedCount: 1 });
    const { handler, sent } = setup();

    await handler.handle(
      raw({
        type: 'saveImages',
        requestId: 'r1',
        token: 'tok',
        imageIds: ['a', 'b', 'c'],
      })
    );

    expect(results(sent)[0]).toMatchObject({
      ok: false,
      savedCount: 2,
      failedCount: 1,
    });
  });

  // マニフェストに載らなかった ID は「画像ドキュメントが消えている」ケース。
  it('マニフェストから欠けた分を失敗として加算する', async () => {
    manifestMock.mockResolvedValue({ ok: true, items: [item('a')] });
    saveManyMock.mockResolvedValue({ ok: true, savedCount: 1, failedCount: 0 });
    const { handler, sent } = setup();

    await handler.handle(
      raw({
        type: 'saveImages',
        requestId: 'r1',
        token: 'tok',
        imageIds: ['a', 'b'],
      })
    );

    expect(results(sent)[0]).toMatchObject({
      ok: false,
      savedCount: 1,
      failedCount: 1,
    });
  });

  // 500 枚超はマニフェストを引くだけ無駄（saveMany が必ず断る）。
  // 分割送信の都合でサーバーへの往復が 2 回発生するので、手前で止める。
  it('件数上限を超えたらマニフェストを引かずに too_many_items を返す', async () => {
    const imageIds = Array.from(
      { length: MAX_BATCH_ITEMS + 1 },
      (_, i) => `id${i}`
    );
    const { handler, sent } = setup();

    await handler.handle(
      raw({ type: 'saveImages', requestId: 'r1', token: 'tok', imageIds })
    );

    expect(manifestMock).not.toHaveBeenCalled();
    expect(saveManyMock).not.toHaveBeenCalled();
    expect(results(sent)).toEqual([
      {
        v: BRIDGE_VERSION,
        type: 'saveResult',
        requestId: 'r1',
        ok: false,
        savedCount: 0,
        failedCount: MAX_BATCH_ITEMS + 1,
        errorCode: 'too_many_items',
      },
    ]);
  });

  it('件数上限ちょうどならマニフェストを引く', async () => {
    const imageIds = Array.from({ length: MAX_BATCH_ITEMS }, (_, i) => `id${i}`);
    manifestMock.mockResolvedValue({ ok: true, items: [] });
    const { handler } = setup();

    await handler.handle(
      raw({ type: 'saveImages', requestId: 'r1', token: 'tok', imageIds })
    );

    expect(manifestMock).toHaveBeenCalledWith('tok', imageIds);
  });

  it('saveMany が返した too_many_items もそのまま伝える', async () => {
    manifestMock.mockResolvedValue({ ok: true, items: [item('a')] });
    saveManyMock.mockResolvedValue({
      ok: false,
      savedCount: 0,
      failedCount: 501,
      errorCode: 'too_many_items',
    });
    const { handler, sent } = setup();

    await handler.handle(
      raw({ type: 'saveImages', requestId: 'r1', token: 'tok', imageIds: ['a'] })
    );

    expect(results(sent)[0]).toMatchObject({ errorCode: 'too_many_items' });
  });

  it('空き容量不足では必要バイト数を渡す', async () => {
    manifestMock.mockResolvedValue({ ok: true, items: [item('a')] });
    saveManyMock.mockResolvedValue({
      ok: false,
      savedCount: 0,
      failedCount: 1,
      errorCode: 'insufficient_storage',
      requiredBytes: 12345,
    });
    const { handler, sent } = setup();

    await handler.handle(
      raw({ type: 'saveImages', requestId: 'r1', token: 'tok', imageIds: ['a'] })
    );

    expect(results(sent)[0]).toMatchObject({
      errorCode: 'insufficient_storage',
      requiredBytes: 12345,
    });
  });

  it('マニフェストが失敗したら全件を失敗として返す', async () => {
    manifestMock.mockResolvedValue({ ok: false, reason: 'manifest_failed' });
    const { handler, sent } = setup();

    await handler.handle(
      raw({
        type: 'saveImages',
        requestId: 'r1',
        token: 'tok',
        imageIds: ['a', 'b', 'c'],
      })
    );

    expect(results(sent)[0]).toMatchObject({
      errorCode: 'manifest_failed',
      failedCount: 3,
    });
    expect(saveManyMock).not.toHaveBeenCalled();
  });
});

describe('createMessageHandler / 重複と キャンセル', () => {
  it('実行中の requestId を二重に処理しない', async () => {
    manifestMock.mockResolvedValue({ ok: true, items: [item('a')] });
    let release: (() => void) | undefined;
    saveManyMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, savedCount: 1, failedCount: 0 });
        })
    );
    const { handler, sent } = setup();

    const message = raw({
      type: 'saveImages',
      requestId: 'r1',
      token: 'tok',
      imageIds: ['a'],
    });
    const first = handler.handle(message);
    await handler.handle(message);

    expect(saveManyMock).toHaveBeenCalledTimes(1);

    release?.();
    await first;
    expect(results(sent)).toHaveLength(1);
  });

  it('完了後は同じ requestId をもう一度受け付ける', async () => {
    manifestMock.mockResolvedValue({ ok: true, items: [item('a')] });
    saveManyMock.mockResolvedValue({ ok: true, savedCount: 1, failedCount: 0 });
    const { handler, sent } = setup();

    const message = raw({
      type: 'saveImages',
      requestId: 'r1',
      token: 'tok',
      imageIds: ['a'],
    });
    await handler.handle(message);
    await handler.handle(message);

    expect(results(sent)).toHaveLength(2);
  });

  it('cancelSave で実行中の保存に中止を伝える', async () => {
    manifestMock.mockResolvedValue({ ok: true, items: [item('a')] });
    let isCancelled: (() => boolean) | undefined;
    let release: (() => void) | undefined;
    saveManyMock.mockImplementation(
      (_items, options) =>
        new Promise((resolve) => {
          isCancelled = options.isCancelled;
          release = () =>
            resolve({
              ok: false,
              savedCount: 0,
              failedCount: 0,
              errorCode: 'cancelled',
            });
        })
    );
    const { handler, sent } = setup();

    const running = handler.handle(
      raw({ type: 'saveImages', requestId: 'r1', token: 'tok', imageIds: ['a'] })
    );
    await Promise.resolve();

    expect(isCancelled?.()).toBe(false);
    await handler.handle(raw({ type: 'cancelSave', requestId: 'r1' }));
    expect(isCancelled?.()).toBe(true);

    release?.();
    await running;
    expect(results(sent)[0]).toMatchObject({ errorCode: 'cancelled' });
  });

  it('実行していない requestId のキャンセルは何もしない', async () => {
    const { handler, sent } = setup();
    await handler.handle(raw({ type: 'cancelSave', requestId: 'unknown' }));
    expect(sent).toHaveLength(0);
  });
});

describe('createMessageHandler / その他のメッセージ', () => {
  it('openSettings で設定画面を開く', async () => {
    const { handler, sent } = setup();
    await handler.handle(raw({ type: 'openSettings' }));

    expect(openSettingsMock).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(0);
  });

  it('invitationInvalid は上位へトークンを渡すだけ', async () => {
    const { handler, invalidated, sent } = setup();
    await handler.handle(raw({ type: 'invitationInvalid', token: 'tok' }));

    expect(invalidated).toEqual(['tok']);
    expect(sent).toHaveLength(0);
  });
});

describe('createMessageHandler / 想定外の例外', () => {
  it('例外が出ても save_failed を1回返して web を止めない', async () => {
    manifestMock.mockRejectedValue(new Error('boom'));
    const { handler, sent } = setup();

    await handler.handle(
      raw({ type: 'saveImages', requestId: 'r1', token: 'tok', imageIds: ['a'] })
    );

    expect(results(sent)).toEqual([
      {
        v: BRIDGE_VERSION,
        type: 'saveResult',
        requestId: 'r1',
        ok: false,
        savedCount: 0,
        failedCount: 0,
        errorCode: 'save_failed',
      },
    ]);
  });

  it('例外の後も同じ requestId を再実行できる', async () => {
    manifestMock.mockRejectedValueOnce(new Error('boom'));
    manifestMock.mockResolvedValue({ ok: true, items: [item('a')] });
    saveManyMock.mockResolvedValue({ ok: true, savedCount: 1, failedCount: 0 });
    const { handler, sent } = setup();

    const message = raw({
      type: 'saveImages',
      requestId: 'r1',
      token: 'tok',
      imageIds: ['a'],
    });
    await handler.handle(message);
    await handler.handle(message);

    expect(results(sent)).toHaveLength(2);
    expect(results(sent)[1]).toMatchObject({ ok: true });
  });
});
