import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

const ALLOWED_WIDTHS = [256, 384, 640, 828, 1080, 1200, 1920];
const ALLOWED_HOSTS = [
  'firebasestorage.googleapis.com',
  'photo-gallery-app-20251204.firebasestorage.app',
];
const CACHE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const MAX_INPUT_SIZE = 20 * 1024 * 1024; // 20MB

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const url = searchParams.get('url');
  const w = parseInt(searchParams.get('w') || '640', 10);
  const q = parseInt(searchParams.get('q') || '75', 10);

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Validate URL: protocol + host
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'Only HTTPS URLs allowed' }, { status: 400 });
    }
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  // Snap to nearest allowed width
  const width = ALLOWED_WIDTHS.reduce((prev, curr) =>
    Math.abs(curr - w) < Math.abs(prev - w) ? curr : prev
  );
  const quality = Math.min(Math.max(q, 1), 100);

  try {
    const response = await fetch(url, { redirect: 'error' });
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

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_INPUT_SIZE) {
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
    console.error('Image optimization error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
