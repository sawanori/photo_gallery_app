/**
 * ネイティブシェル（mobile/）との橋渡し。
 *
 * mobile/src/bridge/protocol.ts と同じ形を保つこと。片方だけ変えると、
 * web は即時デプロイされるのにアプリの更新は遅れるため、
 * 古いアプリに未対応のメッセージを送って無反応になる。
 *
 * 通常のブラウザでは全ての関数が安全に no-op / null を返す。
 */

export const BRIDGE_VERSION = 1;

export type NativeFeature =
  | 'saveImage'
  | 'saveImages'
  | 'cancelSave'
  | 'openSettings';

export interface NativeCapabilities {
  bridgeVersion: number;
  supports: NativeFeature[];
  platform: 'ios' | 'android';
  appVersion: string;
  nonce: string | null;
}

/**
 * web が native に渡すのは imageId と招待トークンだけ。**URL は渡さない。**
 *
 * URL を渡す設計だと、このページ上で動く任意のスクリプトが、
 * ホスト許可リストを通る別の Storage 画像（＝同じバケットにある他クライアントの写真）を
 * 端末の写真アプリに書き込ませられる。実際に保存してよい URL は
 * `/api/native/manifest` が招待との所属を検証したうえで native に直接返す。
 */

export type NativeErrorCode =
  | 'permission_denied'
  | 'download_failed'
  | 'save_failed'
  | 'invalid_url'
  | 'insufficient_storage'
  | 'cancelled'
  | 'unauthorized'
  | 'manifest_failed'
  | 'too_many_items';

export interface SaveProgressEvent {
  v: number;
  type: 'saveProgress';
  requestId: string;
  current: number;
  total: number;
}

export interface SaveResultEvent {
  v: number;
  type: 'saveResult';
  requestId: string;
  ok: boolean;
  savedCount: number;
  failedCount: number;
  errorCode?: NativeErrorCode;
  requiredBytes?: number;
}

export type NativeEvent = SaveProgressEvent | SaveResultEvent;

type OutgoingMessage =
  | { type: 'saveImage'; requestId: string; token: string; imageId: string }
  | { type: 'saveImages'; requestId: string; token: string; imageIds: string[] }
  | { type: 'cancelSave'; requestId: string }
  | { type: 'openSettings' }
  | { type: 'invitationInvalid'; token: string };

interface ReactNativeWebViewBridge {
  postMessage: (message: string) => void;
}

declare global {
  interface Window {
    __NATIVE_GALLERY__?: NativeCapabilities;
    ReactNativeWebView?: ReactNativeWebViewBridge;
  }
}

const USER_AGENT_MARKER = 'PhotoGalleryApp/';

/** 注入が届かなかった場合に使う既定値。 */
const FALLBACK_FEATURES: NativeFeature[] = [
  'saveImage',
  'saveImages',
  'cancelSave',
  'openSettings',
];

/**
 * ネイティブシェル内かどうかを判定する。
 *
 * 検出は3系統に多重化してある。Android の
 * injectedJavaScriptBeforeContentLoaded は experimental で確実に届かないため、
 * 注入グローバルだけに依存すると通常のブラウザとして誤判定される。
 *
 * 1. 注入グローバル `window.__NATIVE_GALLERY__`（最も情報量が多い）
 * 2. カスタム User-Agent 接尾辞（最も確実）
 * 3. `window.ReactNativeWebView` の存在
 */
/**
 * フォールバック時の戻り値をキャッシュする。
 * useSyncExternalStore は getSnapshot が参照的に安定していることを要求するため、
 * 呼び出しごとに新しいオブジェクトを返してはいけない。
 */
let fallbackCache: NativeCapabilities | null = null;

export function detectNativeShell(): NativeCapabilities | null {
  if (typeof window === 'undefined') return null;

  const injected = window.__NATIVE_GALLERY__;
  if (injected && typeof injected.bridgeVersion === 'number') {
    return injected;
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const looksNative =
    ua.includes(USER_AGENT_MARKER) || typeof window.ReactNativeWebView !== 'undefined';

  if (!looksNative) {
    fallbackCache = null;
    return null;
  }

  if (!fallbackCache) {
    fallbackCache = {
      bridgeVersion: BRIDGE_VERSION,
      supports: FALLBACK_FEATURES,
      platform: /android/i.test(ua) ? 'android' : 'ios',
      appVersion: extractAppVersion(ua) ?? 'unknown',
      nonce: null,
    };
  }
  return fallbackCache;
}

/** ネイティブ判定の変化を購読する（注入が遅れて届いた場合に発火する）。 */
export function subscribeToShellReady(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('native-gallery-ready', onChange);
  return () => window.removeEventListener('native-gallery-ready', onChange);
}

/** ネイティブが指定の機能に対応しているか。未対応ならブラウザ挙動へフォールバックする。 */
export function supportsFeature(feature: NativeFeature): boolean {
  const capabilities = detectNativeShell();
  if (!capabilities) return false;
  if (capabilities.bridgeVersion !== BRIDGE_VERSION) return false;
  return capabilities.supports.includes(feature);
}

/**
 * ネイティブへメッセージを送る。送れた場合のみ true。
 * ブラウザでは何もせず false を返す（例外は投げない）。
 */
export function postToNative(message: OutgoingMessage): boolean {
  if (typeof window === 'undefined') return false;

  const bridge = window.ReactNativeWebView;
  if (!bridge || typeof bridge.postMessage !== 'function') return false;

  const capabilities = detectNativeShell();
  if (!capabilities) return false;

  try {
    bridge.postMessage(
      JSON.stringify({
        ...message,
        v: BRIDGE_VERSION,
        nonce: capabilities.nonce,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/** ネイティブからのイベントを購読する。戻り値を呼ぶと解除される。 */
export function subscribeToNative(
  handler: (event: NativeEvent) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== 'object') return;
    const message = detail as Partial<NativeEvent>;
    if (message.v !== BRIDGE_VERSION) return;
    if (message.type !== 'saveProgress' && message.type !== 'saveResult') return;
    handler(message as NativeEvent);
  };

  window.addEventListener('native-gallery', listener);
  return () => window.removeEventListener('native-gallery', listener);
}

/**
 * 「この招待は確かに無効だ」とネイティブへ知らせる。
 *
 * これが無いと、無効なトークンを一度保存したアプリは回復できない。
 * 無効な招待でも web は HTTP 200 とエラーページを返すため、
 * ネイティブ側からは正常な表示と区別がつかないからである。
 *
 * **通信障害では呼ばないこと。** サーバーが明示的に拒否した場合と、
 * 取得できた招待が期限切れだった場合に限る。呼び出し側（useInvitation）が判断する。
 *
 * nonce が届く前（Android の注入遅延）に送るとネイティブ側で捨てられるため、
 * nonce が無ければ注入完了のイベントを待って送る。
 * ネイティブ側の処理は冪等なので、二重に届いても害はない。
 *
 * ブラウザでは何もしない。
 */
export function notifyInvitationInvalid(token: string): void {
  if (typeof window === 'undefined') return;

  const send = () => postToNative({ type: 'invitationInvalid', token });

  // nonce があれば即送る。
  if (detectNativeShell()?.nonce) {
    send();
    return;
  }

  // 注入がまだ届いていない。イベントを待つ。
  // **一度だけ購読する。** subscribeToShellReady は addEventListener の薄い包みで、
  // 既に発火したイベントは拾えない。だから先に上の即時送信を試している。
  const unsubscribe = subscribeToShellReady(() => {
    unsubscribe();
    send();
  });
}

function extractAppVersion(ua: string): string | null {
  const index = ua.indexOf(USER_AGENT_MARKER);
  if (index === -1) return null;
  const rest = ua.slice(index + USER_AGENT_MARKER.length);
  const match = rest.match(/^[\w.+-]+/);
  return match ? match[0] : null;
}
