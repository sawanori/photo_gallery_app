import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prepareUpload } from './prepareUpload';

/**
 * prepareUpload は「速くするだけで、出力は従来と同じ」であることが要件。
 * 圧縮の閾値・寸法・品質・形式と、サムネイルの幅・形式をここで固定する。
 * （比較対象だった imageCompression.ts / thumbnailGenerator.ts は
 *   どこからも呼ばれなくなったため 2026-09-02 に削除した。）
 */

const MB = 1024 * 1024;

interface ConvertCall {
  width: number;
  height: number;
  type: string;
  quality: number;
}

let convertCalls: ConvertCall[] = [];
let createImageBitmapCalls = 0;
let bitmapCloseCalls = 0;
/** convertToBlob が返す Blob のサイズ。テストごとに差し替える。 */
let blobSizeFor: (call: ConvertCall) => number;

function makeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function installCanvasMocks(bitmapWidth: number, bitmapHeight: number) {
  createImageBitmapCalls = 0;
  bitmapCloseCalls = 0;
  convertCalls = [];

  global.createImageBitmap = vi.fn(async () => {
    createImageBitmapCalls += 1;
    return {
      width: bitmapWidth,
      height: bitmapHeight,
      close: () => {
        bitmapCloseCalls += 1;
      },
    } as unknown as ImageBitmap;
  }) as unknown as typeof createImageBitmap;

  class MockOffscreenCanvas {
    constructor(
      public width: number,
      public height: number
    ) {}
    getContext() {
      return { drawImage: () => {} };
    }
    async convertToBlob(options: { type: string; quality: number }) {
      const call = {
        width: this.width,
        height: this.height,
        type: options.type,
        quality: options.quality,
      };
      convertCalls.push(call);
      return { size: blobSizeFor(call), type: options.type } as Blob;
    }
  }
  global.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;
}

beforeEach(() => {
  blobSizeFor = () => 1000;
  installCanvasMocks(4000, 3000);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('prepareUpload / デコード回数', () => {
  // 本タスクの中心。従来は4MB超で2回デコードしていた。
  it('4MB超でも createImageBitmap は1回だけ', async () => {
    await prepareUpload(makeFile('big.jpg', 'image/jpeg', 10 * MB));
    expect(createImageBitmapCalls).toBe(1);
  });

  it('4MB以下でも createImageBitmap は1回だけ', async () => {
    await prepareUpload(makeFile('small.jpg', 'image/jpeg', 1 * MB));
    expect(createImageBitmapCalls).toBe(1);
  });

  it('処理後にビットマップを閉じる', async () => {
    await prepareUpload(makeFile('big.jpg', 'image/jpeg', 10 * MB));
    expect(bitmapCloseCalls).toBe(1);
  });
});

describe('prepareUpload / 圧縮の仕様', () => {
  it('4MB以下は圧縮せず元ファイルを返す', async () => {
    const file = makeFile('small.jpg', 'image/jpeg', 1 * MB);
    const result = await prepareUpload(file);
    expect(result.file).toBe(file);
    // サムネイル3回分だけで、圧縮の convertToBlob は走っていない
    expect(convertCalls).toHaveLength(3);
  });

  it('4MB超は最大寸法3840・品質0.85で圧縮する', async () => {
    await prepareUpload(makeFile('big.jpg', 'image/jpeg', 10 * MB));
    const compress = convertCalls[0];
    expect(compress.quality).toBe(0.85);
    expect(compress.type).toBe('image/jpeg');
    // 4000x3000 → 長辺3840に収める
    expect(compress.width).toBe(3840);
    expect(compress.height).toBe(2880);
  });

  it('3840以下の画像は縮小しない', async () => {
    installCanvasMocks(2000, 1000);
    await prepareUpload(makeFile('big.jpg', 'image/jpeg', 10 * MB));
    expect(convertCalls[0].width).toBe(2000);
    expect(convertCalls[0].height).toBe(1000);
  });

  it('圧縮後も4MBを超えるなら品質0.7で再試行する', async () => {
    blobSizeFor = (call) => (call.quality === 0.85 ? 5 * MB : 1000);
    await prepareUpload(makeFile('big.jpg', 'image/jpeg', 10 * MB));
    expect(convertCalls[0].quality).toBe(0.85);
    expect(convertCalls[1].quality).toBe(0.7);
  });

  it('PNG は WebP に変換し拡張子も置き換える', async () => {
    const result = await prepareUpload(makeFile('photo.png', 'image/png', 10 * MB));
    expect(convertCalls[0].type).toBe('image/webp');
    expect(result.file.name).toBe('photo.webp');
    expect(result.file.type).toBe('image/webp');
  });

  it('JPEG は JPEG のまま拡張子を .jpg にする', async () => {
    const result = await prepareUpload(makeFile('photo.jpeg', 'image/jpeg', 10 * MB));
    expect(result.file.name).toBe('photo.jpg');
    expect(result.file.type).toBe('image/jpeg');
  });

  it('圧縮結果が元より大きければ元ファイルを使う', async () => {
    blobSizeFor = () => 20 * MB;
    const file = makeFile('big.jpg', 'image/jpeg', 10 * MB);
    const result = await prepareUpload(file);
    expect(result.file).toBe(file);
  });
});

describe('prepareUpload / サムネイルの仕様', () => {
  it('幅384・640・1920のWebPを3枚作る', async () => {
    const result = await prepareUpload(makeFile('a.jpg', 'image/jpeg', 1 * MB));

    expect(result.thumbnails.map((t) => t.name)).toEqual(['small', 'medium', 'large']);
    expect(result.thumbnails.map((t) => t.width)).toEqual([384, 640, 1920]);
    for (const call of convertCalls) {
      expect(call.type).toBe('image/webp');
    }
  });

  /**
   * large は拡大表示で実際に見せる 1 枚なので、一覧用の 2 枚より品質を上げる。
   * ここを 0.7 に戻すと、写真を開いたときの見え方が目に見えて落ちる。
   */
  it('一覧用は品質0.7、拡大表示用は0.82で書き出す', async () => {
    const result = await prepareUpload(makeFile('a.jpg', 'image/jpeg', 1 * MB));

    expect(result.thumbnails).toHaveLength(3);
    expect(convertCalls.map((c) => c.quality)).toEqual([0.7, 0.7, 0.82]);
  });

  it('元画像が小さいときは拡大しない', async () => {
    installCanvasMocks(200, 100);
    const result = await prepareUpload(makeFile('tiny.jpg', 'image/jpeg', 1000));
    expect(result.thumbnails.map((t) => t.width)).toEqual([200, 200, 200]);
  });

  /**
   * 実寸だけを持たせると、元画像が小さいときに medium と large が同じ
   * Storage パスに書かれて互いを上書きする。呼称の幅を別に持たせて避ける。
   */
  it('実寸が同じでも呼称の幅は別々に持つ', async () => {
    installCanvasMocks(200, 100);
    const result = await prepareUpload(makeFile('tiny.jpg', 'image/jpeg', 1000));
    expect(result.thumbnails.map((t) => t.nominalWidth)).toEqual([384, 640, 1920]);
  });

  it('アスペクト比を保つ', async () => {
    installCanvasMocks(1000, 500);
    await prepareUpload(makeFile('a.jpg', 'image/jpeg', 1 * MB));
    // 384幅なら高さ192、640幅なら高さ320
    expect(convertCalls[0]).toMatchObject({ width: 384, height: 192 });
    expect(convertCalls[1]).toMatchObject({ width: 640, height: 320 });
  });
});

describe('prepareUpload / 例外時の扱い', () => {
  it('非画像はデコードせず素通しする', async () => {
    const file = makeFile('doc.pdf', 'application/pdf', 1 * MB);
    const result = await prepareUpload(file);
    expect(result.file).toBe(file);
    expect(result.thumbnails).toEqual([]);
    expect(createImageBitmapCalls).toBe(0);
  });

  // 従来 compressImage はデコード失敗時に例外を投げていた。その挙動を保つ。
  it('4MB超でデコードに失敗したら例外を投げる', async () => {
    global.createImageBitmap = vi.fn(async () => {
      throw new Error('decode failed');
    }) as unknown as typeof createImageBitmap;

    await expect(
      prepareUpload(makeFile('big.jpg', 'image/jpeg', 10 * MB))
    ).rejects.toThrow('decode failed');
  });

  // 従来 4MB以下では compressImage が素通りし、サムネイル失敗だけが握りつぶされていた。
  it('4MB以下でデコードに失敗したら元ファイルとサムネイル空で返す', async () => {
    global.createImageBitmap = vi.fn(async () => {
      throw new Error('decode failed');
    }) as unknown as typeof createImageBitmap;

    const file = makeFile('small.jpg', 'image/jpeg', 1 * MB);
    const result = await prepareUpload(file);
    expect(result.file).toBe(file);
    expect(result.thumbnails).toEqual([]);
  });
});
