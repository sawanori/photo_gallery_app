/**
 * アプリ全体の定数。
 *
 * WEB_ORIGIN は環境変数で切り替える。独自ドメインが確定したら .env の
 * EXPO_PUBLIC_WEB_ORIGIN を差し替えるだけでよく、コードは変更しない。
 */

const DEFAULT_WEB_ORIGIN = 'https://gallery.non-turn.com';

/** ギャラリー web のオリジン。末尾スラッシュを含まない。 */
export const WEB_ORIGIN = (
  process.env.EXPO_PUBLIC_WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN
).replace(/\/+$/, '');

/** ネイティブ向けの認可済みマニフェスト API。 */
export const MANIFEST_ENDPOINT = `${WEB_ORIGIN}/api/native/manifest`;

/**
 * 保存を許可する画像のオリジン。完全一致で判定する（startsWith は使わない）。
 * web/src/app/api/image/route.ts の ALLOWED_HOSTS と同じ2件。
 */
export const ALLOWED_IMAGE_ORIGINS: readonly string[] = [
  'https://firebasestorage.googleapis.com',
  'https://photo-gallery-app-20251204.firebasestorage.app',
];

/**
 * Firebase Storage のオブジェクトパスに要求する接頭辞。
 * ホストが合っていても別プロジェクト・別用途のパスを弾くための第2の絞り込み。
 * `/v0/b/<bucket>/o/images%2F...` 形式と、直接ホスト配下の `/images/...` 形式の両方を想定する。
 */
export const STORAGE_PATH_PATTERNS: readonly RegExp[] = [
  /^\/v0\/b\/photo-gallery-app-20251204\.firebasestorage\.app\/o\/(images|thumbnails)%2F/i,
  /^\/(images|thumbnails)\//i,
];

/** 保存を許可する拡張子。 */
export const ALLOWED_EXTENSIONS: readonly string[] = [
  'jpg',
  'jpeg',
  'png',
  'heic',
  'heif',
  'webp',
];

/** 1リクエストで受け付ける最大件数。超過分は無言で捨てず失敗として報告する。 */
export const MAX_BATCH_ITEMS = 500;

/** 1リクエストの合計ダウンロード量の上限。 */
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

/** 1ファイルのサイズ上限。 */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** ダウンロードの同時実行数。保存自体は競合を避けるため直列に行う。 */
export const DOWNLOAD_CONCURRENCY = 3;

/** 空き容量の安全マージン（必要量にこれを足して判定する）。 */
export const STORAGE_HEADROOM_BYTES = 200 * 1024 * 1024;

/** サイズ不明の画像を見積もるときの1枚あたりの想定バイト数。 */
export const ESTIMATED_BYTES_PER_IMAGE = 5 * 1024 * 1024;

/** キャッシュ内のダウンロード先ディレクトリ名。 */
export const CACHE_SUBDIR = 'gallery-save';
