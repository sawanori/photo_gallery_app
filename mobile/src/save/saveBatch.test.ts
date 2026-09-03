import {
  CANCEL_POLL_INTERVAL_MS,
  MAX_BATCH_ITEMS,
  MAX_TOTAL_BYTES,
} from '../config';

/**
 * 一括保存の分岐。
 *
 * ここで守りたいのは「保存できないときに、正しい理由が web に届くこと」。
 * 件数超過を通信障害に化けさせない、推定サイズで拒否しない、
 * 1件失敗しても残りを続ける、キャンセルは進行中のダウンロードごと止める。
 */

/** checkFreeSpace が読む値。テストごとに差し替える。 */
let mockAvailableDiskSpace: number | null = 100 * 1024 * 1024 * 1024;

jest.mock('expo-file-system', () => ({
  get Paths() {
    return {
      cache: 'file:///cache',
      get availableDiskSpace() {
        return mockAvailableDiskSpace;
      },
    };
  },
  File: class {},
  Directory: class {},
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(),
}));

jest.mock('./saveToLibrary', () => ({
  ensureWritePermission: jest.fn(async () => true),
  downloadToCache: jest.fn(async () => ({ uri: 'file:///cache/x.jpg' })),
  saveCachedFile: jest.fn(async () => undefined),
  discardCached: jest.fn(),
  classifyError: jest.fn(() => 'download_failed'),
}));

import { saveMany } from './saveBatch';
import {
  discardCached,
  downloadToCache,
  ensureWritePermission,
  saveCachedFile,
} from './saveToLibrary';

const downloadMock = downloadToCache as jest.MockedFunction<typeof downloadToCache>;
const saveMock = saveCachedFile as jest.MockedFunction<typeof saveCachedFile>;
const permissionMock = ensureWritePermission as jest.MockedFunction<
  typeof ensureWritePermission
>;
const discardMock = discardCached as jest.MockedFunction<typeof discardCached>;

const HOST = 'https://photo-gallery-app-20251204.firebasestorage.app';

function items(count: number, bytes?: number) {
  return Array.from({ length: count }, (_, i) => ({
    imageId: `id${i}`,
    url: `${HOST}/images/uid/p${i}.jpg`,
    filename: `p${i}.jpg`,
    ...(bytes === undefined ? {} : { bytes }),
  }));
}

const noop = { onProgress: () => undefined, isCancelled: () => false };

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailableDiskSpace = 100 * 1024 * 1024 * 1024;
  permissionMock.mockResolvedValue(true);
  downloadMock.mockResolvedValue({ uri: 'file:///cache/x.jpg' } as never);
  saveMock.mockResolvedValue(undefined);
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('saveMany / 件数とサイズの上限', () => {
  it('件数超過は too_many_items で断り、1件もダウンロードしない', async () => {
    const result = await saveMany(items(MAX_BATCH_ITEMS + 1), noop);

    expect(result).toEqual({
      ok: false,
      savedCount: 0,
      failedCount: MAX_BATCH_ITEMS + 1,
      errorCode: 'too_many_items',
    });
    expect(downloadMock).not.toHaveBeenCalled();
  });

  /**
   * 監査 F2 の本体。bytes 不明の 409 枚は推定 5MB × 409 = 2.045GB で
   * MAX_TOTAL_BYTES を超えるが、件数上限の 500 には収まる。
   * 推定値で拒否していたため「410 枚以上は保存できない」になっていた。
   */
  it('サイズ不明なら 409 枚でも保存する（推定合計で断らない）', async () => {
    const result = await saveMany(items(409), noop);

    expect(result).toEqual({ ok: true, savedCount: 409, failedCount: 0 });
    expect(downloadMock).toHaveBeenCalledTimes(409);
  });

  it('実サイズの合計が上限を超えたら too_many_items', async () => {
    const bytes = 6 * 1024 * 1024;
    const count = Math.ceil(MAX_TOTAL_BYTES / bytes) + 1;
    const result = await saveMany(items(count, bytes), noop);

    expect(result.errorCode).toBe('too_many_items');
    expect(result.requiredBytes).toBe(count * bytes);
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('実サイズの合計が上限内なら保存する', async () => {
    const result = await saveMany(items(10, 1024 * 1024), noop);
    expect(result).toEqual({ ok: true, savedCount: 10, failedCount: 0 });
  });

  it('空き容量が足りなければ insufficient_storage（件数の問題と区別する）', async () => {
    mockAvailableDiskSpace = 10 * 1024 * 1024;

    const result = await saveMany(items(5), noop);

    expect(result.errorCode).toBe('insufficient_storage');
    expect(result.requiredBytes).toBeGreaterThan(0);
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('空き容量が取れない端末では止めない', async () => {
    mockAvailableDiskSpace = null;
    const result = await saveMany(items(3), noop);
    expect(result.ok).toBe(true);
  });
});

describe('saveMany / 入口の検証', () => {
  it('保存できる項目が1つも無ければ invalid_url', async () => {
    const result = await saveMany([{ url: 'https://evil.example/x.jpg' }], noop);
    expect(result).toEqual({
      ok: false,
      savedCount: 0,
      failedCount: 1,
      errorCode: 'invalid_url',
    });
  });

  it('不正な項目は失敗に数え、残りは保存する', async () => {
    const result = await saveMany([...items(2), { url: 'nope' }], noop);
    expect(result).toEqual({ ok: false, savedCount: 2, failedCount: 1 });
  });

  it('権限が無ければ1件もダウンロードしない', async () => {
    permissionMock.mockResolvedValue(false);

    const result = await saveMany(items(3), noop);

    expect(result.errorCode).toBe('permission_denied');
    expect(downloadMock).not.toHaveBeenCalled();
  });
});

describe('saveMany / 部分失敗', () => {
  it('1件失敗しても残りを続け、失敗数を返す', async () => {
    downloadMock.mockImplementation(async (item) => {
      if (item.safeFilename === 'p1.jpg') throw new Error('download timed out');
      return { uri: `file:///cache/${item.safeFilename}` } as never;
    });

    const result = await saveMany(items(5), noop);

    expect(result).toEqual({ ok: false, savedCount: 4, failedCount: 1 });
    expect(saveMock).toHaveBeenCalledTimes(4);
  });

  it('タイムアウトした項目も失敗として数える', async () => {
    downloadMock
      .mockRejectedValueOnce(new Error('download timed out'))
      .mockResolvedValue({ uri: 'file:///cache/x.jpg' } as never);

    const result = await saveMany(items(3), noop);

    expect(result.savedCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.errorCode).toBeUndefined();
  });

  it('フォトライブラリへの書き込み失敗も失敗として数える', async () => {
    saveMock.mockRejectedValueOnce(new Error('save failed'));

    const result = await saveMany(items(3), noop);

    expect(result.savedCount).toBe(2);
    expect(result.failedCount).toBe(1);
  });

  it('成否によらず一時ファイルを片付ける', async () => {
    downloadMock.mockRejectedValueOnce(new Error('boom'));

    await saveMany(items(3), noop);

    expect(discardMock).toHaveBeenCalledTimes(3);
  });

  it('進捗を報告する', async () => {
    const progress: number[] = [];
    await saveMany(items(3), {
      onProgress: ({ current, total }) => {
        expect(total).toBe(3);
        progress.push(current);
      },
      isCancelled: () => false,
    });

    expect(progress[progress.length - 1]).toBe(3);
  });
});

describe('saveMany / キャンセル', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ダウンロード中でも abort して止める', async () => {
    const signals: AbortSignal[] = [];
    downloadMock.mockImplementation(
      (_item, options) =>
        new Promise((_resolve, reject) => {
          const signal = options?.signal;
          if (!signal) throw new Error('signal が渡されていない');
          signals.push(signal);
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    let cancelRequested = false;
    const promise = saveMany(items(10), {
      onProgress: () => undefined,
      isCancelled: () => cancelRequested,
    });

    // worker がダウンロードを開始するまで進める
    await jest.advanceTimersByTimeAsync(0);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s.aborted)).toBe(false);

    cancelRequested = true;
    await jest.advanceTimersByTimeAsync(CANCEL_POLL_INTERVAL_MS);

    const result = await promise;

    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('cancelled');
    // 止めた分は「失敗」ではない
    expect(result.failedCount).toBe(0);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('キャンセル前に保存できた分は savedCount に残る', async () => {
    let cancelRequested = false;
    downloadMock.mockImplementation((item, options) => {
      if (item.safeFilename === 'p0.jpg') {
        return Promise.resolve({ uri: 'file:///cache/a' } as never);
      }
      // 以降はキャンセルされるまで応答しない
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () =>
          reject(new Error('aborted'))
        );
      });
    });

    const promise = saveMany(items(4), {
      onProgress: () => undefined,
      isCancelled: () => cancelRequested,
    });

    // 1件目が保存されるところまで進める
    await jest.advanceTimersByTimeAsync(0);
    expect(saveMock).toHaveBeenCalledTimes(1);

    cancelRequested = true;
    await jest.advanceTimersByTimeAsync(CANCEL_POLL_INTERVAL_MS);
    const result = await promise;

    expect(result.errorCode).toBe('cancelled');
    expect(result.savedCount).toBe(1);
    expect(result.failedCount).toBe(0);
  });

  it('開始前にキャンセル済みなら1件も落とさない', async () => {
    const promise = saveMany(items(5), {
      onProgress: () => undefined,
      isCancelled: () => true,
    });

    await jest.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result.errorCode).toBe('cancelled');
    expect(downloadMock).not.toHaveBeenCalled();
  });
});
