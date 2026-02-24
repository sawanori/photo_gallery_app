const MAX_DIMENSION = 3840; // 4K max
const QUALITY = 0.85;
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB target (Vercel image optimization limit)

/**
 * Compress image file using Canvas API.
 * Resizes to fit within MAX_DIMENSION and compresses to JPEG/WebP.
 * Returns original file if it's already small enough.
 */
export async function compressImage(file: File): Promise<File> {
  // Skip non-image files
  if (!file.type.startsWith('image/')) return file;

  // Skip if already small enough
  if (file.size <= MAX_FILE_SIZE) return file;

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // Calculate new dimensions
  let newWidth = width;
  let newHeight = height;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    newWidth = Math.round(width * ratio);
    newHeight = Math.round(height * ratio);
  }

  const canvas = new OffscreenCanvas(newWidth, newHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
  bitmap.close();

  // Try WebP first, fallback to JPEG
  let blob: Blob;
  const outputType = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
  blob = await canvas.convertToBlob({ type: outputType, quality: QUALITY });

  // If still too large, reduce quality further
  if (blob.size > MAX_FILE_SIZE) {
    blob = await canvas.convertToBlob({ type: outputType, quality: 0.7 });
  }

  // Keep original if compression made it larger
  if (blob.size >= file.size) return file;

  const ext = outputType === 'image/webp' ? '.webp' : '.jpg';
  const newName = file.name.replace(/\.[^/.]+$/, ext);
  return new File([blob], newName, { type: outputType });
}
