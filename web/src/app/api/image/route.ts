import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

const ALLOWED_WIDTHS = [256, 384, 640, 828, 1080, 1200, 1920];
const DEFAULT_WIDTH = 640;
const DEFAULT_QUALITY = 75;

const STORAGE_BUCKET = 'photo-gallery-app-20251204.firebasestorage.app';

const ALLOWED_HOSTS = ['firebasestorage.googleapis.com', STORAGE_BUCKET];

/**
 * `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/images%2F...` 形式。
 * このホストは**全 Firebase プロジェクトで共通**なので、ホスト名だけで許可すると
 * 誰の画像でもこのエンドポイントに投げられる（＝開放リサイズプロキシ）。
 * バケット名と接頭辞まで見て初めて自プロジェクトの画像に絞れる。
 */
const OBJECT_API_PATH =
  /^\/v0\/b\/photo-gallery-app-20251204\.firebasestorage\.app\/o\/(images|thumbnails)%2F/i;

/** `https://<bucket>/images/...` 形式（バケットが自身のホストになる場合）。 */
const DIRECT_PATH = /^\/(images|thumbnails)\//i;

const CACHE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const MAX_INPUT_SIZE = 20 * 1024 * 1024; // 20MB
/** 上流が応答しないまま Vercel の実行時間を食い潰さないための上限。 */
const UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * 自プロジェクトの画像かどうか。
 * 判定基準は `mobile/src/config.ts` の `STORAGE_PATH_PATTERNS` と同じにしてある。
 * **片方だけ変えないこと。** ネイティブが保存できる URL と web がリサイズする URL が
 * ずれると、アプリでは保存できるのに一覧に出ない（またはその逆）になる。
 */
function isOwnStorageUrl(parsed: URL): boolean {
  if (parsed.hostname === 'firebasestorage.googleapis.com') {
    return OBJECT_API_PATH.test(parsed.pathname);
  }
  if (parsed.hostname === STORAGE_BUCKET) {
    return DIRECT_PATH.test(parsed.pathname) || OBJECT_API_PATH.test(parsed.pathname);
  }
  return false;
}

/**
 * 数値パラメータを正規化する。
 *
 * `parseInt('abc')` は NaN を返し、それをそのまま sharp の `quality` に渡すと
 * 例外になって 500 を返していた。**利用者の指定が壊れているだけで 500 を返さない。**
 * 判定できない値は既定へ倒す。
 */
function finiteOrNull(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function normalizeWidth(raw: string | null): number {
  const value = finiteOrNull(raw) ?? DEFAULT_WIDTH;
  return ALLOWED_WIDTHS.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

function normalizeQuality(raw: string | null): number {
  const value = finiteOrNull(raw);
  if (value === null) return DEFAULT_QUALITY;
  return Math.min(Math.max(Math.round(value), 1), 100);
}

/**
 * 上限を超えたら読むのをやめる。
 *
 * Content-Length は付いていないことがあり、その場合に `arrayBuffer()` で
 * 全部読んでから大きさを見ていた。つまり上限を超えた本文も**一度は全部**
 * メモリに載せていた。ここでは読みながら測り、超えた時点で接続を切る。
 * 上限超過は null を返す。
 */
async function readLimited(response: Response, limit: number): Promise<Buffer | null> {
  const body = response.body;
  if (!body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > limit ? null : buffer;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Validate URL: protocol + host + path
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }
  if (parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only HTTPS URLs allowed' }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
  }
  if (!isOwnStorageUrl(parsed)) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 400 });
  }

  const width = normalizeWidth(searchParams.get('w'));
  const quality = normalizeQuality(searchParams.get('q'));

  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream ${response.status}` },
        { status: response.status }
      );
    }

    // Validate upstream Content-Type
    const upstreamType = response.headers.get('content-type') || '';
    if (!upstreamType.startsWith('image/')) {
      return NextResponse.json({ error: 'Not an image' }, { status: 400 });
    }

    // Check Content-Length before reading body
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_INPUT_SIZE) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }

    const buffer = await readLimited(response, MAX_INPUT_SIZE);
    if (buffer === null) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }

    // Determine output format from Accept header
    const accept = request.headers.get('accept') || '';
    const supportsWebp = accept.includes('image/webp');
    const supportsAvif = accept.includes('image/avif');

    let pipeline = sharp(buffer).resize(width, undefined, {
      withoutEnlargement: true,
      fit: 'inside',
    });

    let outputType: string;

    if (supportsAvif) {
      pipeline = pipeline.avif({ quality, effort: 0 });
      outputType = 'image/avif';
    } else if (supportsWebp) {
      pipeline = pipeline.webp({ quality });
      outputType = 'image/webp';
    } else {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      outputType = 'image/jpeg';
    }

    const optimized = await pipeline.toBuffer();

    return new Response(new Uint8Array(optimized), {
      headers: {
        'Content-Type': outputType,
        /**
         * s-maxage が無いと Vercel の CDN は一切キャッシュせず、訪問者が変わるたび、
         * ブラウザのキャッシュが切れるたびに sharp のリサイズが走る。
         *
         * 同じ URL は常に同じ画像を返す。元画像の URL には Storage が発行した
         * トークンが含まれており、写真を差し替えれば URL 自体が変わるため、
         * immutable を付けても古い画像が残り続けることはない。
         *
         * stale-while-revalidate は、期限切れ直後のリクエストに古い応答を返しつつ
         * 裏で作り直すためのもの。切り替わりの瞬間に待たされるのを避ける。
         */
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, s-maxage=31536000, stale-while-revalidate=86400, immutable`,
        // 応答は Accept ヘッダで avif / webp / jpeg に分かれる。
        // これが無いと、別の形式を受け付けるブラウザへ誤った形式が配られる。
        'Vary': 'Accept',
      },
    });
  } catch (error) {
    // 上流のタイムアウトは「こちらの不具合」ではないので 500 と区別する
    if ((error as Error)?.name === 'TimeoutError' || (error as Error)?.name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    console.error('Image optimization error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
