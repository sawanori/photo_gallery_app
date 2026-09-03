/**
 * 保存リクエストの入力検証。
 *
 * このモジュールは expo のネイティブモジュールを一切 import しない純関数だけで構成する。
 * Node のテストランナーで直接実行できる状態を保つため、この制約を崩さないこと。
 */

import {
  ALLOWED_EXTENSIONS,
  ALLOWED_IMAGE_ORIGINS,
  STORAGE_PATH_PATTERNS,
} from '../config';
import type { SaveItem } from '../bridge/protocol';

export interface ValidatedItem {
  url: string;
  /** サンドボックス内に安全に書ける名前。必ず許可拡張子で終わる。 */
  safeFilename: string;
  bytes?: number;
}

export type ValidationFailure = { ok: false; reason: 'invalid_url' };
export type ValidationSuccess = { ok: true; value: ValidatedItem };
export type ValidationResult = ValidationSuccess | ValidationFailure;

const fail: ValidationFailure = { ok: false, reason: 'invalid_url' };

/** NUL・制御文字・パス区切り。ファイル名に含まれていたら拒否する。 */
const UNSAFE_NAME_CHARS = new RegExp('[\\u0000-\\u001f\\u007f/\\\\]');

/** ファイル名に許すコードポイント数。 */
const MAX_BASE_NAME_POINTS = 120;

/** URL のオリジンが許可リストに完全一致するか。 */
function isAllowedOrigin(parsed: URL): boolean {
  return ALLOWED_IMAGE_ORIGINS.includes(parsed.origin);
}

/** Firebase Storage のオブジェクトパスとして妥当か。 */
function isAllowedPath(parsed: URL): boolean {
  return STORAGE_PATH_PATTERNS.some((re) => re.test(parsed.pathname));
}

/** ファイル名の安全性を確認する。危険なら null を返す（無害化ではなく拒否）。 */
function sanitizeBaseName(raw: string): string | null {
  if (UNSAFE_NAME_CHARS.test(raw)) return null;
  // '.' / '..' / '..' 始まりはディレクトリ参照になり得る
  if (raw === '.' || raw.startsWith('..')) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // 長すぎる名前はファイルシステムで問題になるため末尾（拡張子側）を残して切る。
  // slice は UTF-16 単位で切るためサロゲートペアを割り、絵文字などが
  // 壊れた半分だけ残る。Array.from はコードポイント単位に分解する。
  const points = Array.from(trimmed);
  return points.length > MAX_BASE_NAME_POINTS
    ? points.slice(points.length - MAX_BASE_NAME_POINTS).join('')
    : trimmed;
}

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext) ? ext : null;
}

/**
 * URL のパスから拡張子を導出する。
 * Firebase Storage の `/o/images%2Fabc.jpg` のような encode 済みパスにも対応する。
 */
function extensionFromUrl(parsed: URL): string | null {
  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname);
  } catch {
    path = parsed.pathname;
  }
  const last = path.split('/').pop() ?? '';
  return extensionOf(last);
}

/**
 * 1件の保存対象を検証する。
 *
 * 通らないもの:
 * - https 以外
 * - 許可オリジン以外。`https://firebasestorage.googleapis.com.evil.tld` のような
 *   接頭辞一致で通ってしまう偽装もここで落ちる（origin の完全一致で判定するため）
 * - Firebase Storage のオブジェクトパスに見えないもの
 * - パス区切り・制御文字を含むファイル名、'..' 始まりのファイル名
 *
 * 拡張子が無い、または許可外の場合は URL から導出し、それも取れなければ jpg にする。
 */
export function validateSaveItem(item: unknown): ValidationResult {
  if (typeof item !== 'object' || item === null) return fail;
  const candidate = item as Partial<SaveItem>;

  if (typeof candidate.url !== 'string' || candidate.url.length === 0) return fail;

  let parsed: URL;
  try {
    parsed = new URL(candidate.url);
  } catch {
    return fail;
  }

  if (parsed.protocol !== 'https:') return fail;
  if (!isAllowedOrigin(parsed)) return fail;
  if (!isAllowedPath(parsed)) return fail;

  const rawName = typeof candidate.filename === 'string' ? candidate.filename : '';
  const base = rawName.length > 0 ? sanitizeBaseName(rawName) : null;
  if (rawName.length > 0 && base === null) return fail;

  const urlExt = extensionFromUrl(parsed);
  let safeFilename: string;

  if (base !== null && extensionOf(base) !== null) {
    safeFilename = base;
  } else if (base !== null) {
    safeFilename = `${base}.${urlExt ?? 'jpg'}`;
  } else {
    // ファイル名が渡されなかった場合は URL の末尾から作る
    let decoded: string;
    try {
      decoded = decodeURIComponent(parsed.pathname);
    } catch {
      decoded = parsed.pathname;
    }
    const tail = decoded.split('/').pop() ?? '';
    const fromUrl = tail.length > 0 ? sanitizeBaseName(tail) : null;
    safeFilename =
      fromUrl !== null && extensionOf(fromUrl) !== null
        ? fromUrl
        : `image.${urlExt ?? 'jpg'}`;
  }

  const bytes =
    typeof candidate.bytes === 'number' &&
    Number.isFinite(candidate.bytes) &&
    candidate.bytes > 0
      ? candidate.bytes
      : undefined;

  return { ok: true, value: { url: candidate.url, safeFilename, bytes } };
}

/** 同一バッチ内でファイル名が衝突しないよう連番を付ける。 */
export function deduplicateFilenames(items: ValidatedItem[]): ValidatedItem[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const lower = item.safeFilename.toLowerCase();
    const count = seen.get(lower) ?? 0;
    seen.set(lower, count + 1);
    if (count === 0) return item;

    const dot = item.safeFilename.lastIndexOf('.');
    const stem = item.safeFilename.slice(0, dot);
    const ext = item.safeFilename.slice(dot);
    return { ...item, safeFilename: `${stem}_${count}${ext}` };
  });
}
