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

export type InboundMessage =
  | SaveImageMessage
  | SaveImagesMessage
  | CancelSaveMessage
  | OpenSettingsMessage;

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

/** 従量課金通信での確認要求。web が続行を選んだら同じ requestId で再送する。 */
export interface MeteredConfirmMessage {
  v: number;
  type: 'meteredConfirm';
  requestId: string;
  estimatedBytes: number;
}

export type OutboundMessage =
  | SaveProgressMessage
  | SaveResultMessage
  | MeteredConfirmMessage;

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

    default:
      // 未知の type は黙って無視する。将来の web が新しい type を送ってきても落ちない。
      return null;
  }
}
