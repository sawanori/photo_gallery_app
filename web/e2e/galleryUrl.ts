/**
 * 本番ギャラリーを直接叩く確認スクリプトが使う URL。
 *
 * **招待トークンをリポジトリに書かないこと。** このリポジトリは GitHub 上で公開されており
 * （sawanori/photo_gallery_app）、招待トークンはギャラリーを開く鍵そのものである。
 * 2026-09-02 の監査時点で、失効済みとはいえ本番トークンが 4 ファイルに平文で残っていた。
 *
 * 実行時に環境変数で渡す:
 *   E2E_GALLERY_URL=https://<host>/gallery/<token> npx playwright test e2e/<file>
 *
 * 未設定なら test.skip する。これらは CI に組み込む前提の回帰テストではなく
 * 本番を目視確認するための場当たりスクリプトなので、
 * 失敗として落とすより「走らせていない」と分かるほうがよい。
 */
export const E2E_GALLERY_URL = process.env.E2E_GALLERY_URL ?? '';

/** 未設定時に test.skip へ渡す説明。 */
export const E2E_GALLERY_URL_MISSING =
  'E2E_GALLERY_URL が未設定のためスキップ（E2E_GALLERY_URL=https://<host>/gallery/<token> を渡す）';

/**
 * ギャラリー URL のオリジン。`/api/image` を直接叩くときに使う。
 * URL 未設定のまま呼ぶと new URL が投げるため、呼び出し側は先に test.skip すること。
 */
export function galleryOrigin(): string {
  return new URL(E2E_GALLERY_URL).origin;
}
