import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

const ALLOWED_WIDTHS = [256, 384, 640, 828, 1080, 1200, 1920];
const ALLOWED_HOSTS = [
  'firebasestorage.googleapis.com',
  'photo-gallery-app-20251204.firebasestorage.app',
];
const CACHE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const url = searchParams.get('url');
  const w = parseInt(searchParams.get('w') || '640', 10);
  const q = parseInt(searchParams.get('q') || '75', 10);

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Validate host
  try {
    const parsed = new URL(url);
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
    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream ${response.status}` },
        { status: response.status }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Check if input supports WebP output
    const accept = request.headers.get('accept') || '';
    const supportsWebp = accept.includes('image/webp');
    const supportsAvif = accept.includes('image/avif');

    let pipeline = sharp(buffer).resize(width, undefined, {
      withoutEnlargement: true,
      fit: 'inside',
    });

    let contentType: string;

    if (supportsAvif) {
      pipeline = pipeline.avif({ quality });
      contentType = 'image/avif';
    } else if (supportsWebp) {
      pipeline = pipeline.webp({ quality });
      contentType = 'image/webp';
    } else {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      contentType = 'image/jpeg';
    }

    const optimized = await pipeline.toBuffer();

    return new Response(optimized as unknown as BodyInit, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, immutable`,
        'Vary': 'Accept',
      },
    });
  } catch (error) {
    console.error('Image optimization error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
