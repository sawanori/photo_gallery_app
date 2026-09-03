// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * マニフェスト API の入口の検証。
 *
 * 認可そのものは `manifestService.test.ts` が見ている。ここで固定するのは
 * Route Handler だけが持つ責務、すなわち
 *   - レート制限のキーが**トークンではなく発信元 IP** であること
 *     （トークンをキーにすると総当たり側は一度も制限されない）
 *   - 異常に長いトークンを Firestore へ渡さないこと
 * の 2 点。
 */

const resolveManifest = vi.fn();

vi.mock('../../../../lib/firebaseServer', () => ({
  getServerDb: vi.fn(async () => ({})),
}));

vi.mock('../../../../services/manifestService', () => ({
  resolveManifest: (...args: unknown[]) => resolveManifest(...args),
}));

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('https://gallery.example.com/api/native/manifest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function freshRoute() {
  // レート制限のバケットはモジュールスコープに持つので、
  // ケースごとにモジュールを読み直して状態を分ける。
  vi.resetModules();
  return import('./route');
}

beforeEach(() => {
  resolveManifest.mockReset();
  resolveManifest.mockResolvedValue({ ok: true, items: [] });
});

describe('POST /api/native/manifest / 入力検証', () => {
  it('JSON でない本文は 400', async () => {
    const { POST } = await freshRoute();
    const request = new NextRequest('https://gallery.example.com/api/native/manifest', {
      method: 'POST',
      body: 'not json',
    });

    expect((await POST(request)).status).toBe(400);
    expect(resolveManifest).not.toHaveBeenCalled();
  });

  it('token が無い・空なら 400', async () => {
    const { POST } = await freshRoute();

    expect((await POST(post({ imageIds: ['a'] }))).status).toBe(400);
    expect((await POST(post({ token: '', imageIds: ['a'] }))).status).toBe(400);
    expect(resolveManifest).not.toHaveBeenCalled();
  });

  // 招待トークンは nanoid 21 桁。長大な文字列を Firestore まで通さない。
  it('token が 64 文字を超えたら Firestore へ行く前に 400', async () => {
    const { POST } = await freshRoute();

    const ok = await POST(post({ token: 'a'.repeat(64), imageIds: ['x'] }));
    expect(ok.status).toBe(200);

    const tooLong = await POST(post({ token: 'a'.repeat(65), imageIds: ['x'] }));
    expect(tooLong.status).toBe(400);
    expect(resolveManifest).toHaveBeenCalledTimes(1);
  });

  it('失敗応答は manifestService の status と code をそのまま返す', async () => {
    const { POST } = await freshRoute();
    resolveManifest.mockResolvedValue({ ok: false, status: 403, code: 'forbidden' });

    const response = await POST(post({ token: 'tok', imageIds: ['x'] }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('POST /api/native/manifest / レート制限', () => {
  const body = { token: 'tok', imageIds: ['x'] };

  it('同じ IP からの 121 回目で 429', async () => {
    const { POST } = await freshRoute();
    const headers = { 'x-forwarded-for': '203.0.113.9' };

    for (let i = 0; i < 120; i += 1) {
      expect((await POST(post(body, headers))).status).toBe(200);
    }
    expect((await POST(post(body, headers))).status).toBe(429);
  });

  // 以前はキーがトークンだったため、トークンを変えるだけで無制限に叩けた
  it('トークンを変えても同じ IP なら数える', async () => {
    const { POST } = await freshRoute();
    const headers = { 'x-forwarded-for': '203.0.113.9' };

    for (let i = 0; i < 120; i += 1) {
      await POST(post({ token: `tok-${i}`, imageIds: ['x'] }, headers));
    }
    const response = await POST(post({ token: 'tok-last', imageIds: ['x'] }, headers));

    expect(response.status).toBe(429);
  });

  it('別の IP は影響を受けない', async () => {
    const { POST } = await freshRoute();

    for (let i = 0; i < 121; i += 1) {
      await POST(post(body, { 'x-forwarded-for': '203.0.113.9' }));
    }

    const other = await POST(post(body, { 'x-forwarded-for': '198.51.100.7' }));
    expect(other.status).toBe(200);
  });

  it('x-forwarded-for の先頭 IP をキーにする（プロキシ側は見ない）', async () => {
    const { POST } = await freshRoute();

    for (let i = 0; i < 121; i += 1) {
      await POST(post(body, { 'x-forwarded-for': '203.0.113.9, 70.41.3.18' }));
    }

    // 先頭が同じなら同じバケット
    const same = await POST(post(body, { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }));
    expect(same.status).toBe(429);

    // 先頭が違えば別バケット
    const different = await POST(post(body, { 'x-forwarded-for': '198.51.100.7, 70.41.3.18' }));
    expect(different.status).toBe(200);
  });

  it('x-forwarded-for が無い場合は unknown にまとめる', async () => {
    const { POST } = await freshRoute();

    for (let i = 0; i < 120; i += 1) {
      expect((await POST(post(body))).status).toBe(200);
    }
    expect((await POST(post(body))).status).toBe(429);
  });
});
