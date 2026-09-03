import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebaseServer';
import { resolveManifest } from '@/services/manifestService';
import { createRateLimiter } from '@/lib/rateLimiter';

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

/**
 * 1インスタンスあたりの簡易レート制限。総当たりを鈍らせる目的。
 *
 * **キーはトークンではなく呼び出し元の IP。** キーをトークンにすると、
 * トークンを変えながら総当たりする側は毎回新しいバケットに入って一度も制限されず、
 * 逆に正規の利用者は 1 つの招待を家族全員の端末で共有するため
 * 実際の利用のほうが先に頭打ちになる。守りたいのは「未知トークンの連打」なので
 * 発信元で数える。
 *
 * 上限は実利用（1 端末が一括保存で数回叩く）に対して十分な余裕を取る。
 */
const MAX_TOKEN_LENGTH = 64;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 120;

const limiter = createRateLimiter({ windowMs: RATE_WINDOW_MS, max: RATE_MAX_REQUESTS });

/**
 * 呼び出し元の識別子。
 *
 * Vercel は `x-forwarded-for` に「クライアント, プロキシ…」の順で積むため先頭を採る。
 * 取れない場合は `unknown` にまとめる。まとめた側が厳しくなるが、
 * 数えられない相手を無制限に通すよりよい。
 */
function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : 'unknown';
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

  // 招待トークンは nanoid 21 桁。64 を超える文字列は正規の入力ではありえないので、
  // Firestore に問い合わせる前に落とす（長大な文字列でドキュメント ID 検索を
  // 走らせられないようにする）。
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return json({ error: 'bad_request' }, 400);
  }

  if (limiter.check(clientKey(request), Date.now())) {
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
