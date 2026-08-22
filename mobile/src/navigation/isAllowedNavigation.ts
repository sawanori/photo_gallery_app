/**
 * WebView 内で遷移させてよい URL かどうかの判定。純関数。
 *
 * `url.startsWith(WEB_ORIGIN)` は使わない。
 * `https://<WEB_ORIGIN のホスト>.evil.tld/` が接頭辞一致で通ってしまうため、
 * 必ず URL をパースして origin の完全一致で判定する。
 */

/**
 * WebView 内での遷移を許可するか。false なら OS の既定ブラウザへ回す。
 *
 * スキームは http / https のみ許可し、`javascript:` `data:` `blob:` `intent:` `file:`
 * などは一律で拒否する。http を許すのは、開発時に手元の web サーバー
 * （`http://192.168.x.x:3002` など）を読み込めるようにするため。
 * 本番では WEB_ORIGIN が https なので、http のページは origin 不一致で弾かれる。
 */
export function isAllowedNavigation(rawUrl: string, webOrigin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    // about:blank や相対 URL などパースできないものは WebView 内に留めない
    return false;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

  // origin の完全一致で判定する。プロトコルも origin に含まれるため、
  // 本番（https）の設定で http のページが通ることはない。
  return parsed.origin === normalizeOrigin(webOrigin);
}

export type NavigationDecision =
  /** WebView 内でそのまま読み込む。 */
  | 'allow'
  /** 読み込まない。外部ブラウザにも渡さない。 */
  | 'block'
  /** 読み込まず、OS の既定ブラウザで開く。 */
  | 'external';

/**
 * WebView からの読み込み要求をどう扱うか決める。
 *
 * **iframe を外部ブラウザへ回してはいけない。** ページが読み込む第三者の iframe だけで
 * アプリが勝手にブラウザへ切り替わってしまう。実際に Vercel のプレビュー用ツールバー
 * （`vercel.live` のフィードバック用 iframe）でこれが起き、アプリが背面に回された結果、
 * WebView の JavaScript が止まって写真一覧が最後まで読み込めなかった。
 *
 * 判定には `isTopFrame` を使う。`navigationType` は Android では常に `other` になるため
 * 「利用者がタップしたか」の判定には使えない。
 */
export function decideNavigation(
  request: { url: string; isTopFrame: boolean },
  webOrigin: string
): NavigationDecision {
  if (isAllowedNavigation(request.url, webOrigin)) return 'allow';
  if (!request.isTopFrame) return 'block';
  return isOpenableExternally(request.url) ? 'external' : 'block';
}

/** 外部ブラウザで開いてよい URL か（http/https のみ許可）。 */
export function isOpenableExternally(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/+$/, '');
  }
}
