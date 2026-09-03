// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * リサイズプロキシの入口の検証。
 *
 * `firebasestorage.googleapis.com` は**全 Firebase プロジェクト共通のホスト**なので、
 * ホスト名だけで許可すると誰の公開画像でもここに投げられる（開放プロキシ）。
 * バケットと接頭辞の検査、壊れたパラメータで 500 を返さないこと、
 * 上流が応答しないときに待ち続けないことを固定する。
 */

const calls = vi.hoisted(() => ({
  resizeWidths: [] as number[],
  jpeg: [] as { quality: number }[],
  webp: [] as { quality: number }[],
}));

vi.mock('sharp', () => {
  const makePipeline = () => {
    const pipeline = {
      resize: (width: number) => {
        calls.resizeWidths.push(width);
        return pipeline;
      },
      jpeg: (options: { quality: number }) => {
        calls.jpeg.push(options);
        return pipeline;
      },
      webp: (options: { quality: number }) => {
        calls.webp.push(options);
        return pipeline;
      },
      avif: () => pipeline,
      toBuffer: async () => Buffer.from([0xff, 0xd8, 0xff]),
    };
    return pipeline;
  };
  return { default: () => makePipeline() };
});

const BUCKET = 'photo-gallery-app-20251204.firebasestorage.app';
const ALLOWED_URL = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/images%2Fuid%2Fphoto.jpg?alt=media&token=abc`;

function requestFor(params: Record<string, string>, headers: Record<string, string> = {}) {
  const search = new URLSearchParams(params).toString();
  return new NextRequest(`https://gallery.example.com/api/image?${search}`, { headers });
}

function imageResponse(headers: Record<string, string> = {}): Response {
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'content-type': 'image/jpeg', ...headers },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  calls.resizeWidths.length = 0;
  calls.jpeg.length = 0;
  calls.webp.length = 0;
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function get(params: Record<string, string>, headers?: Record<string, string>) {
  const { GET } = await import('./route');
  return GET(requestFor(params, headers));
}

describe('GET /api/image / URL の検査', () => {
  it('自バケットの images/ 配下は通す', async () => {
    fetchMock.mockResolvedValue(imageResponse());

    const response = await get({ url: ALLOWED_URL, w: '640', q: '70' });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('自バケットの thumbnails/ 配下も通す', async () => {
    fetchMock.mockResolvedValue(imageResponse());

    const response = await get({
      url: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/thumbnails%2Fuid%2Fs.webp?alt=media`,
    });

    expect(response.status).toBe(200);
  });

  it('バケットのホスト直下の /images/ も通す', async () => {
    fetchMock.mockResolvedValue(imageResponse());

    const response = await get({ url: `https://${BUCKET}/images/uid/photo.jpg` });

    expect(response.status).toBe(200);
  });

  // ここが本項の中心。ホストは共通なのでバケット名まで見ないと開放プロキシになる。
  it('同じホストでも別バケットの URL は 400 で拒否する', async () => {
    const response = await get({
      url: 'https://firebasestorage.googleapis.com/v0/b/someone-else.appspot.com/o/images%2Fx.jpg?alt=media',
    });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('自バケットでも images/ thumbnails/ 以外のパスは 400', async () => {
    const response = await get({
      url: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/profiles%2Fuid%2Fx.jpg?alt=media`,
    });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('許可外ホストは 403', async () => {
    const response = await get({ url: 'https://evil.example.com/images/x.jpg' });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('http は 400、url 無しも 400', async () => {
    expect((await get({ url: `http://${BUCKET}/images/uid/x.jpg` })).status).toBe(400);
    expect((await get({ w: '640' })).status).toBe(400);
    expect((await get({ url: 'not a url' })).status).toBe(400);
  });
});

describe('GET /api/image / パラメータの正規化', () => {
  // 以前は parseInt('abc') の NaN をそのまま sharp に渡して 500 になっていた
  it('q=abc は既定の 75 に倒す', async () => {
    fetchMock.mockResolvedValue(imageResponse());

    const response = await get({ url: ALLOWED_URL, q: 'abc' });

    expect(response.status).toBe(200);
    expect(calls.jpeg).toEqual([{ quality: 75, mozjpeg: true }]);
  });

  it('w=abc は既定の 640 に倒す', async () => {
    fetchMock.mockResolvedValue(imageResponse());

    await get({ url: ALLOWED_URL, w: 'abc' });

    expect(calls.resizeWidths).toEqual([640]);
  });

  it('w は許可された幅に丸める', async () => {
    fetchMock.mockResolvedValue(imageResponse());

    await get({ url: ALLOWED_URL, w: '900' });

    expect(calls.resizeWidths).toEqual([828]);
  });

  it('q は 1〜100 に収める', async () => {
    fetchMock.mockResolvedValue(imageResponse());
    await get({ url: ALLOWED_URL, q: '5000' });
    expect(calls.jpeg.at(-1)).toMatchObject({ quality: 100 });

    fetchMock.mockResolvedValue(imageResponse());
    await get({ url: ALLOWED_URL, q: '-3' });
    expect(calls.jpeg.at(-1)).toMatchObject({ quality: 1 });
  });

  it('Accept に image/webp があれば webp で返す', async () => {
    fetchMock.mockResolvedValue(imageResponse());

    const response = await get({ url: ALLOWED_URL }, { accept: 'image/webp,image/*' });

    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(calls.webp).toEqual([{ quality: 75 }]);
  });
});

describe('GET /api/image / 上流の扱い', () => {
  it('タイムアウトは 504（500 と区別する）', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      })
    );

    const response = await get({ url: ALLOWED_URL });

    expect(response.status).toBe(504);
  });

  it('fetch には中断シグナルを渡す', async () => {
    fetchMock.mockResolvedValue(imageResponse());

    await get({ url: ALLOWED_URL });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('画像以外の Content-Type は 400', async () => {
    fetchMock.mockResolvedValue(
      new Response('<Error/>', { status: 200, headers: { 'content-type': 'application/xml' } })
    );

    expect((await get({ url: ALLOWED_URL })).status).toBe(400);
  });

  it('上流のエラー状態はそのまま返す', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }));

    expect((await get({ url: ALLOWED_URL })).status).toBe(404);
  });

  it('Content-Length が上限超えなら本文を読まずに 413', async () => {
    fetchMock.mockResolvedValue(
      imageResponse({ 'content-length': String(21 * 1024 * 1024) })
    );

    expect((await get({ url: ALLOWED_URL })).status).toBe(413);
  });

  // Content-Length が無いときに全部読んでから測っていた経路
  it('Content-Length が無くても上限を超えた時点で打ち切って 413', async () => {
    let pushed = 0;
    let cancelled = false;
    const chunk = new Uint8Array(1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pushed += 1;
        // 上限（20MB）を超えても読み続けるなら、この上限で強制的に閉じる
        if (pushed > 64) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    fetchMock.mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'content-type': 'image/jpeg' } })
    );

    const response = await get({ url: ALLOWED_URL });

    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    // 20MB を少し超えたところで止まっていること（64 チャンク＝64MB を読み切っていない）。
    // ストリームは先読みするため厳密に 21 にはならない。
    expect(pushed).toBeLessThan(30);
  });
});
