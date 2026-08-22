import { Directory, File, Paths } from 'expo-file-system';
import { requestPermissionsAsync } from 'expo-media-library';
// Expo SDK 57 では saveToLibraryAsync を主エントリ 'expo-media-library' から import すると
// 実行時に throw する（node_modules/expo-media-library/build/legacyWarnings.js が明示的に
// Error を投げる）。正しい import 元は 'expo-media-library/legacy'。
//
// モダン API の Asset.create() を使わない理由:
// Asset.create() は生成した Asset を読み戻して返すため、iOS の「追加のみ（write-only）」認可
// では成立しない見込みがある。本アプリはフォトライブラリの読み取り権限を要求しない方針なので、
// 書き込み専用で完結する saveToLibraryAsync を採る。
// アルバム分けにはフル権限が要るため別タスク（計画の task_019）扱い。
import { saveToLibraryAsync } from 'expo-media-library/legacy';

import { CACHE_SUBDIR, MAX_FILE_BYTES } from '../config';
import type { ErrorCode } from '../bridge/protocol';
import { validateSaveItem, type ValidatedItem } from './validate';

export type SaveOutcome = { ok: true } | { ok: false; errorCode: ErrorCode };

let permissionGranted = false;

/**
 * 書き込み専用のフォトライブラリ権限を確保する。
 *
 * iOS は Info.plist に NSPhotoLibraryAddUsageDescription があれば、
 * 読み取り権限なしで「写真の追加のみ」の認可を取れる。
 */
export async function ensureWritePermission(): Promise<boolean> {
  if (permissionGranted) return true;
  const response = await requestPermissionsAsync(true);
  permissionGranted = response.granted;
  return permissionGranted;
}

/** 権限変更後やテストで内部キャッシュを捨てる。 */
export function resetPermissionCache(): void {
  permissionGranted = false;
}

function cacheDirectory(): Directory {
  const dir = new Directory(Paths.cache, CACHE_SUBDIR);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** 一時ファイルを消す。失敗しても呼び出し元の結果には影響させない。 */
export function discardCached(file: File | null): void {
  if (!file) return;
  try {
    if (file.exists) file.delete();
  } catch {
    // 後始末の失敗は無視する
  }
}

/**
 * 画像をキャッシュへダウンロードする。フォトライブラリへは書き込まない。
 * 呼び出し元は結果の File を必ず discardCached で片付けること。
 */
export async function downloadToCache(item: ValidatedItem): Promise<File> {
  const destination = new File(cacheDirectory(), item.safeFilename);

  // idempotent を付けないと、同名ファイルが残っていたときに
  // DestinationAlreadyExists で reject される。
  const downloaded = await File.downloadFileAsync(item.url, destination, {
    idempotent: true,
  });

  if (!downloaded.exists) {
    throw new DownloadError('downloaded file is missing');
  }
  if (downloaded.size > MAX_FILE_BYTES) {
    discardCached(downloaded);
    throw new SaveError('downloaded file exceeds the size limit');
  }
  return downloaded;
}

/**
 * キャッシュ上のファイルをフォトライブラリへ保存する。
 *
 * saveToLibraryAsync は拡張子付きの URI を要求し、Android では file:/// である必要がある。
 * expo-file-system の File.uri は file:// を返すためそのまま渡せる。
 */
export async function saveCachedFile(file: File): Promise<void> {
  await saveToLibraryAsync(file.uri);
}

/** 検証済み1件をダウンロードして保存する（一時ファイルの後始末まで行う）。 */
export async function saveValidatedItem(
  item: ValidatedItem
): Promise<SaveOutcome> {
  let downloaded: File | null = null;
  try {
    downloaded = await downloadToCache(item);
    await saveCachedFile(downloaded);
    return { ok: true };
  } catch (error) {
    // ネイティブの例外メッセージは web に渡さない。コード化してローカルにだけ残す。
    console.warn('[save] failed', error);
    return { ok: false, errorCode: classifyError(error) };
  } finally {
    discardCached(downloaded);
  }
}

/** 未検証の入力を受け取って保存する（単体保存の入口）。 */
export async function saveOne(rawItem: unknown): Promise<SaveOutcome> {
  const validated = validateSaveItem(rawItem);
  if (!validated.ok) return { ok: false, errorCode: 'invalid_url' };

  const granted = await ensureWritePermission();
  if (!granted) return { ok: false, errorCode: 'permission_denied' };

  return saveValidatedItem(validated.value);
}

export class DownloadError extends Error {}
export class SaveError extends Error {}

export function classifyError(error: unknown): ErrorCode {
  if (error instanceof DownloadError) return 'download_failed';
  if (error instanceof SaveError) return 'save_failed';

  const message = error instanceof Error ? error.message : String(error);
  if (/no space|insufficient|disk full/i.test(message)) return 'insufficient_storage';
  if (/permission|denied|authoriz/i.test(message)) return 'permission_denied';
  if (/network|timeout|download|unable to download|host/i.test(message)) {
    return 'download_failed';
  }
  return 'save_failed';
}
