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

/**
 * マニフェスト API 1回あたりに送る imageId の最大数。
 *
 * サーバー（web/src/services/manifestService.ts の MAX_MANIFEST_ITEMS）と同じ値にする。
 * これを超えると 400 が返るため、超える依頼はこの単位に分割して送る。
 * 「サーバーが受け付けない件数のリクエストは送らない」ことが分割の目的で、
 * 件数そのものの上限は MAX_BATCH_ITEMS が受け持つ。
 */
export const MANIFEST_CHUNK_SIZE = 500;

/**
 * 1リクエストの合計ダウンロード量の上限。
 *
 * **サーバーが実バイト数を返した項目の合計だけ**をこの上限と比較する。
 * ESTIMATED_BYTES_PER_IMAGE による推定合計をここに当てると、
 * 実際には収まる枚数（推定 5MB × 410 枚 = 2GB 超）を件数上限より手前で
 * 誤って拒否してしまうため。推定値は空き容量チェックにのみ使う。
 */
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

/** 1ファイルのサイズ上限。 */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** ダウンロードの同時実行数。保存自体は競合を避けるため直列に行う。 */
export const DOWNLOAD_CONCURRENCY = 3;

/**
 * 1件のダウンロードに許す時間。
 *
 * これが無いと、接続が確立したまま応答が止まった端末で worker が永久に塞がり、
 * 一括保存が進捗 0 のまま終わらなくなる。超過した項目は失敗として数え、残りは続行する。
 */
export const DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * キャンセル要求を拾う間隔。
 *
 * キャンセルは web からのメッセージでフラグが立つだけなので、項目の切れ目でしか
 * 見ないと「ダウンロード中の1件」を止められない。この間隔で監視して AbortSignal を発火させる。
 */
export const CANCEL_POLL_INTERVAL_MS = 200;

/** 空き容量の安全マージン（必要量にこれを足して判定する）。 */
export const STORAGE_HEADROOM_BYTES = 200 * 1024 * 1024;

/** サイズ不明の画像を見積もるときの1枚あたりの想定バイト数。 */
export const ESTIMATED_BYTES_PER_IMAGE = 5 * 1024 * 1024;

/** キャッシュ内のダウンロード先ディレクトリ名。 */
export const CACHE_SUBDIR = 'gallery-save';
