/**
 * ディープリンクから WebView に読み込む URL を決める。純関数部分。
 *
 * 重要: token だけを抜き出して `/gallery/<token>` に組み立て直してはいけない。
 * `/liked?token=...` をタップしたときにお気に入り画面が開かなくなる。
 * パスとクエリはそのまま保持する。
 */

export interface ResolvedTarget {
  /** WebView に読み込む絶対 URL。 */
  url: string;
  /** 次回のアイコン起動用に保存するトークン。 */
  token: string;
}

const GALLERY_PATH = /^\/gallery\/([^/?#]+)\/?$/;

/**
 * ディープリンクを解決する。
 *
 * 対応する形式:
 * - `https://<webOrigin>/gallery/<token>`
 * - `https://<webOrigin>/liked?token=<token>`
 * - `photogallery://gallery/<token>`
 * - `photogallery://liked?token=<token>`
 *
 * トークンを取り出せない、またはオリジンが違う場合は null。
 */
export function resolveDeepLink(
  rawUrl: string,
  webOrigin: string,
  scheme: string
): ResolvedTarget | null {
  const origin = normalizeOrigin(webOrigin);

  // カスタムスキームは URL に解釈させず、文字列として http(s) に組み替える。
  //
  // React Native の URL は正規表現による簡易実装で、host / pathname / origin の
  // いずれも `https?://` にしかマッチしない（Libraries/Blob/URL.js）。
  // `photogallery://gallery/<token>` を渡すと例外は出ないまま host='' pathname='/' に
  // なり、トークンを取り出せずディープリンクが黙って失敗する。
  // Jest は Node の標準 URL で走るためテストでは再現しない。実機で発覚した。
  const customPath = stripCustomScheme(rawUrl, scheme);
  if (customPath !== null) {
    const asHttps = safeUrl(`${origin}${customPath}`);
    if (!asHttps) return null;
    const token = extractToken(asHttps);
    if (!token) return null;
    return { url: `${origin}${asHttps.pathname}${asHttps.search}`, token };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol === 'https:') {
    if (parsed.origin !== origin) return null;
    const token = extractToken(parsed);
    if (!token) return null;
    return { url: `${origin}${parsed.pathname}${parsed.search}`, token };
  }

  return null;
}

/**
 * `photogallery://gallery/<token>?x=y` から `/gallery/<token>?x=y` を取り出す。
 * スキームが一致しなければ null。
 *
 * `photogallery:/gallery/...`（スラッシュ1本）と `photogallery:gallery/...` も
 * 受け付ける。iOS と Android で `//` の有無が揃わない場合があるため。
 */
function stripCustomScheme(rawUrl: string, scheme: string): string | null {
  const prefix = `${scheme}:`;
  if (rawUrl.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) {
    return null;
  }

  const rest = rawUrl.slice(prefix.length).replace(/^\/{0,2}/, '');
  if (rest.length === 0) return null;
  return `/${rest}`;
}

/** 保存済みトークンからギャラリー URL を組み立てる。 */
export function galleryUrlForToken(token: string, webOrigin: string): string {
  return `${normalizeOrigin(webOrigin)}/gallery/${encodeURIComponent(token)}`;
}

function extractToken(parsed: URL): string | null {
  const match = parsed.pathname.match(GALLERY_PATH);
  if (match) {
    const token = decodeSafe(match[1]);
    return token.length > 0 ? token : null;
  }

  if (/^\/liked\/?$/.test(parsed.pathname)) {
    const token = parsed.searchParams.get('token');
    return token && token.length > 0 ? token : null;
  }

  return null;
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/+$/, '');
  }
}

/**
 * 招待コードの長さの範囲。
 *
 * 下限 8 は、審査用に人間が打てる短いコード（`REVIEW-DEMO-2026` は16文字）を通すため。
 * 上限 40 は、既存の nanoid 21 文字に余裕を持たせるため。
 * 広げすぎると、貼り間違えた任意の文字列がトークンとして解決され、
 * エラーページへ送られてしまう。
 */
const CODE_MIN_LENGTH = 8;
const CODE_MAX_LENGTH = 40;

/** 招待コードに使える文字。既存トークン（nanoid）は `_` と `-` を含む。 */
const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * 利用者が貼り付けた文字列を、解決できる URL に正規化する。
 *
 * 受け付ける形式:
 * - `https://<origin>/gallery/<token>` / `https://<origin>/liked?token=<token>`
 * - `photogallery://gallery/<token>`
 * - 招待コードのみ（`<origin>/gallery/<code>` に組み立てる）
 *
 * 前後の空白と改行は取り除く。メールやメッセージからのコピーで混入するため。
 * **本文ごと貼られた場合（URL の前後に文章が付く）は救わない。** 抽出を始めると
 * 何を URL とみなすかの線引きが曖昧になり、誤った解決を生む。
 *
 * **URL クラスを使わないこと。** React Native の URL は正規表現による簡易実装で
 * `https?://` にしかマッチしない。2026-08-16 に実機で判明した
 * （`docs/native-app/device-test-log.md` 第4章）。文字列処理で完結させる。
 */
export function normalizeInvitationInput(
  raw: string,
  webOrigin: string
): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // スキームが付いていればそのまま解決側へ渡す。
  // 許可するオリジンの判定は resolveDeepLink が行う。
  if (/^[A-Za-z][A-Za-z0-9+\-.]*:/.test(trimmed)) return trimmed;

  if (trimmed.length < CODE_MIN_LENGTH || trimmed.length > CODE_MAX_LENGTH) return null;
  if (!CODE_PATTERN.test(trimmed)) return null;

  return galleryUrlForToken(trimmed, webOrigin);
}
