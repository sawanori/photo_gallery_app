import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebaseServer';
import { resolveManifest } from '@/services/manifestService';

/**
 * ネイティブアプリ向けの認可済みマニフェスト。
 *
 * ネイティブは画像 URL を web から受け取らない。招待トークンと imageId だけを送り、
 * サーバーが「その招待に属する画像か」を確認したうえで URL を返す。
 * これがないと、ホスト許可リストを通る任意の Storage URL を
 * 端末の写真アプリに書き込ませられる（同じバケットにある他クライアントの写真を含む）。
 *
 * 認証は招待トークンそのもの（bearer credential）で行う。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 1インスタンスあたりの簡易レート制限。総当たりを鈍らせる目的。 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string, now: number): boolean {
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX_REQUESTS) return true;

  // 古いエントリを掃除してメモリを無限に増やさない
  if (rateBuckets.size > 1000) {
    for (const [k, v] of rateBuckets) {
      if (now >= v.resetAt) rateBuckets.delete(k);
    }
  }
  return false;
}

/**
 * 応答を組み立てる。
 *
 * 成功・失敗のどちらにも `no-store` を付ける。
 * 招待ごとに内容が変わるだけでなく、「このトークンは 403」「このトークンは 404」という
 * 判定結果自体を中間キャッシュや CDN に残したくないため。
 */
function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  if (typeof body !== 'object' || body === null) {
    return json({ error: 'bad_request' }, 400);
  }

  const { token, imageIds } = body as { token?: unknown; imageIds?: unknown };

  if (typeof token !== 'string' || token.length === 0) {
    return json({ error: 'bad_request' }, 400);
  }

  if (rateLimited(token, Date.now())) {
    return json({ error: 'rate_limited' }, 429);
  }

  try {
    const db = await getServerDb();
    const result = await resolveManifest(db, token, imageIds);

    if (!result.ok) {
      return json({ error: result.code }, result.status);
    }

    return json({ items: result.items }, 200);
  } catch (error) {
    console.error('manifest resolution failed:', error);
    return json({ error: 'internal_error' }, 500);
  }
}
