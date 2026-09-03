import { DOWNLOAD_TIMEOUT_MS, MAX_FILE_BYTES } from '../config';

/**
 * ダウンロードの打ち切りと後始末。
 *
 * 接続が確立したまま応答が止まると、タイムアウトが無い限り worker が永久に塞がる。
 * 一括保存では 3 本しか worker が無いので、3 件詰まれば全体が進まなくなる。
 */

/**
 * expo-file-system の差し替え。
 *
 * ファクトリの外側の変数は参照しない（jest.mock は import より前に巻き上げられ、
 * const はまだ初期化されていない）。検証に使う値はモジュールの戻り値に載せて取り出す。
 */
jest.mock('expo-file-system', () => {
  const deletedUris: string[] = [];

  class MockFile {
    uri: string;
    exists = true;
    size = 1024;

    constructor(parent: { uri: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.uri;
      this.uri = name ? `${base}/${name}` : base;
    }

    delete() {
      deletedUris.push(this.uri);
    }

    static downloadFileAsync = jest.fn();
  }

  class MockDirectory {
    uri: string;
    constructor(base: string, name: string) {
      this.uri = `${base}/${name}`;
    }
    create() {}
  }

  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { cache: 'file:///cache' },
    __deletedUris: deletedUris,
  };
});

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

jest.mock('expo-media-library/legacy', () => ({
  saveToLibraryAsync: jest.fn(async () => undefined),
}));

import {
  classifyError,
  downloadToCache,
  DownloadError,
  SaveError,
} from './saveToLibrary';

const fileSystemMock = jest.requireMock('expo-file-system') as {
  File: { downloadFileAsync: jest.Mock };
  __deletedUris: string[];
};
const mockDownloadFileAsync = fileSystemMock.File.downloadFileAsync;
const mockDeletedUris = fileSystemMock.__deletedUris;

const ITEM = {
  url: 'https://photo-gallery-app-20251204.firebasestorage.app/images/uid/a.jpg',
  safeFilename: 'a.jpg',
};

/** signal が abort されるまで応答しないダウンロード。 */
function stalledDownload() {
  mockDownloadFileAsync.mockImplementation(
    (_url: string, _dest: unknown, options: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted.');
          error.name = 'AbortError';
          reject(error);
        });
      })
  );
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockDeletedUris.length = 0;
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('downloadToCache / 正常系', () => {
  it('idempotent と signal を付けて、明示した File を保存先にする', async () => {
    mockDownloadFileAsync.mockResolvedValue({
      uri: 'file:///cache/gallery-save/a.jpg',
      exists: true,
      size: 1024,
    });

    await downloadToCache(ITEM);

    expect(mockDownloadFileAsync).toHaveBeenCalledTimes(1);
    const [url, destination, options] = mockDownloadFileAsync.mock.calls[0];
    expect(url).toBe(ITEM.url);
    // Directory 渡しだと保存名がレスポンス由来になり拡張子が付かない
    expect(destination.uri).toBe('file:///cache/gallery-save/a.jpg');
    expect(options.idempotent).toBe(true);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('サイズ上限を超えたファイルは捨てて SaveError', async () => {
    mockDownloadFileAsync.mockResolvedValue({
      uri: 'file:///cache/gallery-save/a.jpg',
      exists: true,
      size: MAX_FILE_BYTES + 1,
      delete: () => mockDeletedUris.push('file:///cache/gallery-save/a.jpg'),
    });

    await expect(downloadToCache(ITEM)).rejects.toBeInstanceOf(SaveError);
    expect(mockDeletedUris.length).toBeGreaterThan(0);
  });

  it('ファイルが出来ていなければ DownloadError', async () => {
    mockDownloadFileAsync.mockResolvedValue({
      uri: 'file:///cache/gallery-save/a.jpg',
      exists: false,
      size: 0,
    });

    await expect(downloadToCache(ITEM)).rejects.toBeInstanceOf(DownloadError);
  });
});

describe('downloadToCache / タイムアウト', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('制限時間を過ぎたら abort して DownloadError にする', async () => {
    stalledDownload();

    const promise = downloadToCache(ITEM);
    const assertion = expect(promise).rejects.toBeInstanceOf(DownloadError);

    await jest.advanceTimersByTimeAsync(DOWNLOAD_TIMEOUT_MS);
    await assertion;

    const signal = mockDownloadFileAsync.mock.calls[0][2].signal as AbortSignal;
    expect(signal.aborted).toBe(true);
  });

  it('タイムアウトは download_failed に分類される（通信の問題として web に出る）', async () => {
    stalledDownload();

    const promise = downloadToCache(ITEM).catch((error) => classifyError(error));
    await jest.advanceTimersByTimeAsync(DOWNLOAD_TIMEOUT_MS);

    expect(await promise).toBe('download_failed');
  });

  it('制限時間内に終われば abort しない', async () => {
    mockDownloadFileAsync.mockResolvedValue({
      uri: 'file:///cache/gallery-save/a.jpg',
      exists: true,
      size: 1024,
    });

    await downloadToCache(ITEM);
    await jest.advanceTimersByTimeAsync(DOWNLOAD_TIMEOUT_MS * 2);

    const signal = mockDownloadFileAsync.mock.calls[0][2].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
  });

  it('書きかけの一時ファイルを消す', async () => {
    stalledDownload();

    const promise = downloadToCache(ITEM).catch(() => undefined);
    await jest.advanceTimersByTimeAsync(DOWNLOAD_TIMEOUT_MS);
    await promise;

    expect(mockDeletedUris).toContain('file:///cache/gallery-save/a.jpg');
  });
});

describe('downloadToCache / 外部からのキャンセル', () => {
  it('渡された signal が発火したら中断する', async () => {
    stalledDownload();
    const controller = new AbortController();

    const promise = downloadToCache(ITEM, { signal: controller.signal });
    const assertion = expect(promise).rejects.toThrow();

    controller.abort();
    await assertion;

    const signal = mockDownloadFileAsync.mock.calls[0][2].signal as AbortSignal;
    expect(signal.aborted).toBe(true);
    // 中断でも一時ファイルは残さない
    expect(mockDeletedUris).toContain('file:///cache/gallery-save/a.jpg');
  });

  it('すでに abort 済みの signal ならダウンロードを始めない', async () => {
    mockDownloadFileAsync.mockImplementation(
      (_url: string, _dest: unknown, options: { signal?: AbortSignal }) => {
        if (options.signal?.aborted) {
          const error = new Error('The operation was aborted.');
          error.name = 'AbortError';
          return Promise.reject(error);
        }
        return Promise.resolve({ uri: 'x', exists: true, size: 1 });
      }
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      downloadToCache(ITEM, { signal: controller.signal })
    ).rejects.toThrow();
  });
});
