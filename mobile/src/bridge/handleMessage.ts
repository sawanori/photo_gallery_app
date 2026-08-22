import { Linking } from 'react-native';

import {
  BRIDGE_VERSION,
  parseInboundMessage,
  type InboundMessage,
  type OutboundMessage,
} from './protocol';
import { fetchManifest } from '../save/manifest';
import { saveMany } from '../save/saveBatch';
import { saveOne } from '../save/saveToLibrary';

export type SendToWeb = (message: OutboundMessage) => void;

/** web が「この招待は確かに無効だ」と通知してきたときに呼ばれる。 */
export type OnInvitationInvalid = (token: string) => void;

/**
 * web から届いたメッセージを捌く。
 *
 * 不正 JSON・nonce 不一致・未知の type は黙って無視する（例外を投げない）。
 * 実行中のリクエストは requestId で管理し、cancelSave でフラグを立てる。
 */
export function createMessageHandler(
  nonce: string,
  send: SendToWeb,
  onInvitationInvalid?: OnInvitationInvalid
) {
  const cancelled = new Set<string>();
  const running = new Set<string>();

  const finish = (requestId: string) => {
    running.delete(requestId);
    cancelled.delete(requestId);
  };

  const handle = async (raw: string): Promise<void> => {
    const message = parseInboundMessage(raw, nonce);
    if (!message) return;

    try {
      await dispatch(message);
    } catch (error) {
      // ここに来るのは想定外の例外だけ。web を無反応にしないため結果は必ず返す。
      console.warn('[bridge] unexpected failure', error);
      if ('requestId' in message && typeof message.requestId === 'string') {
        send({
          v: BRIDGE_VERSION,
          type: 'saveResult',
          requestId: message.requestId,
          ok: false,
          savedCount: 0,
          failedCount: 0,
          errorCode: 'save_failed',
        });
        finish(message.requestId);
      }
    }
  };

  const dispatch = async (message: InboundMessage): Promise<void> => {
    switch (message.type) {
      case 'openSettings':
        await Linking.openSettings();
        return;

      case 'cancelSave':
        if (running.has(message.requestId)) cancelled.add(message.requestId);
        return;

      case 'invitationInvalid':
        // 判断は上位（App）に委ねる。ここでは伝えるだけ。
        // どのトークンが無効かを渡し、上位が表示中・保存中のものと照合する。
        onInvitationInvalid?.(message.token);
        return;

      case 'saveImage': {
        if (running.has(message.requestId)) return;
        running.add(message.requestId);

        // web からは imageId しか受け取らない。実際に保存してよい URL は
        // サーバーのマニフェスト API が招待との所属を検証したうえで返す。
        const manifest = await fetchManifest(message.token, [message.imageId]);
        if (!manifest.ok || manifest.items.length === 0) {
          send({
            v: BRIDGE_VERSION,
            type: 'saveResult',
            requestId: message.requestId,
            ok: false,
            savedCount: 0,
            failedCount: 1,
            errorCode: manifest.ok ? 'unauthorized' : manifest.reason,
          });
          finish(message.requestId);
          return;
        }

        const outcome = await saveOne(manifest.items[0]);
        send({
          v: BRIDGE_VERSION,
          type: 'saveResult',
          requestId: message.requestId,
          ok: outcome.ok,
          savedCount: outcome.ok ? 1 : 0,
          failedCount: outcome.ok ? 0 : 1,
          errorCode: outcome.ok ? undefined : outcome.errorCode,
        });
        finish(message.requestId);
        return;
      }

      case 'saveImages': {
        if (running.has(message.requestId)) return;
        running.add(message.requestId);

        const manifest = await fetchManifest(message.token, message.imageIds);
        if (!manifest.ok) {
          send({
            v: BRIDGE_VERSION,
            type: 'saveResult',
            requestId: message.requestId,
            ok: false,
            savedCount: 0,
            failedCount: message.imageIds.length,
            errorCode: manifest.reason,
          });
          finish(message.requestId);
          return;
        }

        // 招待に属さない ID はサーバーが全体を拒否するため、ここに来た時点で
        // 件数が減っているのは「画像ドキュメントが消えている」ケースのみ。
        const missing = message.imageIds.length - manifest.items.length;

        const result = await saveMany(manifest.items, {
          onProgress: ({ current, total }) =>
            send({
              v: BRIDGE_VERSION,
              type: 'saveProgress',
              requestId: message.requestId,
              current,
              total,
            }),
          isCancelled: () => cancelled.has(message.requestId),
        });

        send({
          v: BRIDGE_VERSION,
          type: 'saveResult',
          requestId: message.requestId,
          ok: result.ok && missing === 0,
          savedCount: result.savedCount,
          failedCount: result.failedCount + missing,
          errorCode: result.errorCode,
          requiredBytes: result.requiredBytes,
        });
        finish(message.requestId);
        return;
      }
    }
  };

  return { handle };
}
