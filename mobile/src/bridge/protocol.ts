/**
 * web ↔ native のメッセージ・プロトコル。
 *
 * web 側の web/src/lib/nativeBridge.ts と同じ形を保つこと。
 * 片方だけ変えるとバージョン skew でサイレント故障になる。
 */

export const BRIDGE_VERSION = 1;

/** native が実装している機能。web はこれを見て使える機能だけを呼ぶ。 */
export const SUPPORTED_FEATURES = [
  'saveImage',
  'saveImages',
  'cancelSave',
  'openSettings',
  'leaveGallery',
] as const;

export type Feature = (typeof SUPPORTED_FEATURES)[number];

/** native が web に注入する能力情報。 */
export interface NativeCapabilities {
  bridgeVersion: number;
  supports: Feature[];
  platform: 'ios' | 'android';
  appVersion: string;
  /** 起動ごとのランダム値。web からのメッセージはこれを持っていないと無視する。 */
  nonce: string;
}

/**
 * web から native へ渡すのは imageId だけ。URL は渡さない。
 *
 * native は招待トークンと imageId をサーバーの /api/native/manifest に送り、
 * 「その招待に属する画像か」を検証済みの URL を受け取る。
 * web に URL を指定させると、ホスト許可リストを通る任意の Storage 画像
 * （＝同じバケットにある他クライアントの写真）を保存させられる。
 */
export interface SaveRequestItem {
  imageId: string;
}

/** マニフェスト API が返す、保存してよい実体。 */
export interface SaveItem {
  imageId: string;
  url: string;
  filename: string;
  /** サーバーが把握している場合のみ。空き容量の見積もりに使う。 */
  bytes?: number;
}

export type ErrorCode =
  | 'permission_denied'
  | 'download_failed'
  | 'save_failed'
  | 'invalid_url'
  | 'insufficient_storage'
  | 'cancelled'
  | 'unauthorized'
  | 'manifest_failed'
  | 'too_many_items';

/* ---------- web → native ---------- */

interface BaseInbound {
  v: number;
  nonce: string;
}

export interface SaveImageMessage extends BaseInbound {
  type: 'saveImage';
  requestId: string;
  /** 招待トークン。マニフェスト API の認証に使う。 */
  token: string;
  imageId: string;
}

export interface SaveImagesMessage extends BaseInbound {
  type: 'saveImages';
  requestId: string;
  token: string;
  imageIds: string[];
}

export interface CancelSaveMessage extends BaseInbound {
  type: 'cancelSave';
  requestId: string;
}

export interface OpenSettingsMessage extends BaseInbound {
  type: 'openSettings';
}

/**
 * web が「この招待は確かに無効だ」と確認したときの通知。
 *
 * これが無いと、無効なトークンを一度保存したアプリは回復できない。
 * 無効な招待でも web は HTTP 200 とエラーページを返すため、
 * ネイティブ側からは正常な表示と区別がつかないからである。
 *
 * **web は通信障害では送らない。** サーバーが明示的に拒否した場合と、
 * 取得できた招待が期限切れだった場合に限る。通信障害で送ると、
 * 電波の悪い場所でアプリを開いただけで有効なトークンが消える。
 *
 * `token` は対象を特定するために必須。ネイティブは表示中の招待と
 * 保存中のトークンの両方に一致した場合だけ破棄する。
 */
export interface InvitationInvalidMessage extends BaseInbound {
  type: 'invitationInvalid';
  token: string;
}

/**
 * 利用者が自分の意思でギャラリーを離れるときの通知。
 *
 * アプリは一度トークンを覚えると、起動のたびにそのギャラリーへ直行する。
 * 出口が無いため、別の案件のリンクを持っていない状態では**入口画面に戻れない**。
 * トークンは iOS のキーチェーンにあり、アプリを削除しても残るので、
 * 利用者の手には回復手段が無かった。
 *
 * UI は web 側に置く（アプリは UI を持たない方針）。ネイティブはこの通知を受けて
 * 記憶しているトークンを捨て、入口画面へ戻すだけ。
 *
 * `token` は表示中の招待と照合するために必須。`invitationInvalid` と同じく、
 * 「いま開いている招待」以外を消せないようにしている。
 */
export interface LeaveGalleryMessage extends BaseInbound {
  type: 'leaveGallery';
  token: string;
}

export type InboundMessage =
  | SaveImageMessage
  | SaveImagesMessage
  | CancelSaveMessage
  | OpenSettingsMessage
  | InvitationInvalidMessage
  | LeaveGalleryMessage;

/* ---------- native → web ---------- */

export interface SaveProgressMessage {
  v: number;
  type: 'saveProgress';
  requestId: string;
  current: number;
  total: number;
}

export interface SaveResultMessage {
  v: number;
  type: 'saveResult';
  requestId: string;
  ok: boolean;
  savedCount: number;
  failedCount: number;
  errorCode?: ErrorCode;
  /** insufficient_storage のときに必要なバイト数を伝える。 */
  requiredBytes?: number;
}

export type OutboundMessage = SaveProgressMessage | SaveResultMessage;

/** web から届いた文字列を検証してメッセージに変換する。不正なら null。 */
export function parseInboundMessage(
  raw: string,
  expectedNonce: string
): InboundMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const msg = parsed as Record<string, unknown>;

  if (msg.v !== BRIDGE_VERSION) return null;
  if (typeof msg.nonce !== 'string' || msg.nonce !== expectedNonce) return null;
  if (typeof msg.type !== 'string') return null;

  switch (msg.type) {
    case 'saveImage':
      if (typeof msg.requestId !== 'string') return null;
      if (typeof msg.token !== 'string' || msg.token.length === 0) return null;
      if (typeof msg.imageId !== 'string' || msg.imageId.length === 0) return null;
      return msg as unknown as SaveImageMessage;

    case 'saveImages':
      if (typeof msg.requestId !== 'string') return null;
      if (typeof msg.token !== 'string' || msg.token.length === 0) return null;
      if (!Array.isArray(msg.imageIds)) return null;
      if (!msg.imageIds.every((id) => typeof id === 'string' && id.length > 0)) {
        return null;
      }
      return msg as unknown as SaveImagesMessage;

    case 'cancelSave':
      if (typeof msg.requestId !== 'string') return null;
      return msg as unknown as CancelSaveMessage;

    case 'openSettings':
      return msg as unknown as OpenSettingsMessage;

    case 'invitationInvalid':
      if (typeof msg.token !== 'string' || msg.token.length === 0) return null;
      return msg as unknown as InvitationInvalidMessage;

    case 'leaveGallery':
      if (typeof msg.token !== 'string' || msg.token.length === 0) return null;
      return msg as unknown as LeaveGalleryMessage;

    default:
      // 未知の type は黙って無視する。将来の web が新しい type を送ってきても落ちない。
      return null;
  }
}
