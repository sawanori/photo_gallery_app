const SIZES = [
  { name: 'small', width: 384 },
  { name: 'medium', width: 640 },
] as const;

const QUALITY = 0.7;

export interface ThumbnailResult {
  name: 'small' | 'medium';
  blob: Blob;
  width: number;
}

/**
 * Generate WebP thumbnails at predefined sizes using OffscreenCanvas.
 * Decodes the image once and reuses the bitmap for all sizes.
 * Never upscales — if original is smaller than target, uses original dimensions.
 */
export async function generateThumbnails(file: File): Promise<ThumbnailResult[]> {
  const bitmap = await createImageBitmap(file);
  const { width: origW, height: origH } = bitmap;

  const results: ThumbnailResult[] = [];

  for (const size of SIZES) {
    const targetW = Math.min(size.width, origW);
    const ratio = targetW / origW;
    const targetH = Math.round(origH * ratio);

    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY });

    results.push({ name: size.name, blob, width: targetW });
  }

  bitmap.close();
  return results;
}
