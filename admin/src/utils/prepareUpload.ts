/**
 * アップロード前の画像処理をまとめて行う。
 *
 * 従来は `compressImage(file)` と `generateThumbnails(file)` を別々に呼んでいたため、
 * 4MB を超える画像は `createImageBitmap` が2回走っていた。
 * このモジュールはデコードを1回に統一する。
 *
 * かつては `imageCompression.ts` / `thumbnailGenerator.ts` に同じ処理があり、
 * 「出力を一致させること」という約束で二重に保守していた。どちらも呼ばれなくなった
 * ため 2026-09-02 に削除し、ここを唯一の実装にした。
 */

// --- 圧縮の定数 ---
const MAX_DIMENSION = 3840;
const COMPRESS_QUALITY = 0.85;
const COMPRESS_FALLBACK_QUALITY = 0.7;
const MAX_FILE_SIZE = 4 * 1024 * 1024;

// --- サムネイルの定数 ---
const THUMBNAIL_SIZES = [
  { name: 'small', width: 384 },
  { name: 'medium', width: 640 },
] as const;
const THUMBNAIL_QUALITY = 0.7;

/** 生成したサムネイル1枚。`imageService.uploadImageFile` がそのまま受け取る。 */
export interface ThumbnailResult {
  name: 'small' | 'medium';
  blob: Blob;
  width: number;
}

export interface PreparedUpload {
  /** Storage に置く元画像。圧縮不要なら渡されたファイルそのもの。 */
  file: File;
  /** 生成できたサムネイル。デコードに失敗した場合は空配列。 */
  thumbnails: ThumbnailResult[];
}

/**
 * 1回のデコードから、圧縮後ファイルとサムネイル2枚を作る。
 *
 * 失敗時の扱いは従来の呼び出し順（compressImage → generateThumbnails）に合わせてある。
 * - 4MB 超でデコードに失敗した場合: 例外を投げる（従来 compressImage が投げていた）
 * - 4MB 以下でデコードに失敗した場合: 元ファイルとサムネイル空で返す
 *   （従来は compressImage がデコードせず素通りし、generateThumbnails の失敗だけが
 *     呼び出し側で握りつぶされていた）
 */
export async function prepareUpload(file: File): Promise<PreparedUpload> {
  // 非画像は従来どおり素通しする
  if (!file.type.startsWith('image/')) {
    return { file, thumbnails: [] };
  }

  const needsCompression = file.size > MAX_FILE_SIZE;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    if (needsCompression) throw error;
    console.warn('Image decode failed, uploading original without thumbnails:', error);
    return { file, thumbnails: [] };
  }

  try {
    const outputFile = needsCompression
      ? await compressFromBitmap(bitmap, file)
      : file;

    // サムネイルは圧縮後ではなく元のビットマップから作る。
    // 追加のデコードが不要で、画質は圧縮後から作るより同等以上になる。
    const thumbnails = await thumbnailsFromBitmap(bitmap);

    return { file: outputFile, thumbnails };
  } finally {
    bitmap.close();
  }
}

/** 4MB を超える画像を、既存のビットマップから圧縮して作り直す。 */
async function compressFromBitmap(bitmap: ImageBitmap, original: File): Promise<File> {
  const { width, height } = bitmap;

  let newWidth = width;
  let newHeight = height;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    newWidth = Math.round(width * ratio);
    newHeight = Math.round(height * ratio);
  }

  const canvas = new OffscreenCanvas(newWidth, newHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;

  ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);

  const outputType = original.type === 'image/png' ? 'image/webp' : 'image/jpeg';
  let blob = await canvas.convertToBlob({
    type: outputType,
    quality: COMPRESS_QUALITY,
  });

  if (blob.size > MAX_FILE_SIZE) {
    blob = await canvas.convertToBlob({
      type: outputType,
      quality: COMPRESS_FALLBACK_QUALITY,
    });
  }

  // 圧縮して大きくなったら元を使う
  if (blob.size >= original.size) return original;

  const ext = outputType === 'image/webp' ? '.webp' : '.jpg';
  const newName = original.name.replace(/\.[^/.]+$/, ext);
  return new File([blob], newName, { type: outputType });
}

/** 既存のビットマップから WebP サムネイルを作る。拡大はしない。 */
async function thumbnailsFromBitmap(bitmap: ImageBitmap): Promise<ThumbnailResult[]> {
  const { width: origW, height: origH } = bitmap;
  const results: ThumbnailResult[] = [];

  for (const size of THUMBNAIL_SIZES) {
    // 拡大はしない
    const targetW = Math.min(size.width, origW);
    const ratio = targetW / origW;
    const targetH = Math.round(origH * ratio);

    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    const blob = await canvas.convertToBlob({
      type: 'image/webp',
      quality: THUMBNAIL_QUALITY,
    });

    results.push({ name: size.name, blob, width: targetW });
  }

  return results;
}
