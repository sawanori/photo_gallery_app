import { Platform } from 'react-native';

import {
  BRIDGE_VERSION,
  SUPPORTED_FEATURES,
  type OutboundMessage,
} from './protocol';

/** 起動ごとの nonce。web からのメッセージはこれを持っていないと無視する。 */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * web に注入する能力情報。
 *
 * Android の injectedJavaScriptBeforeContentLoaded は experimental で確実に届くとは限らない。
 * 届かなかった場合に備えて WebView 側にカスタム User-Agent 接尾辞も付けており、
 * web はそちらでもネイティブと判定できる（web/src/lib/nativeBridge.ts を参照）。
 * そのため本スクリプトは何度実行しても安全な冪等な形にしてある。
 */
export function buildInjectedScript(nonce: string, appVersion: string): string {
  const capabilities = {
    bridgeVersion: BRIDGE_VERSION,
    supports: [...SUPPORTED_FEATURES],
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    appVersion,
    nonce,
  };

  // 末尾の true; は react-native-webview の要件（無いと稀に無言で失敗する）
  return `
(function () {
  try {
    window.__NATIVE_GALLERY__ = ${JSON.stringify(capabilities)};
    window.dispatchEvent(new Event('native-gallery-ready'));
  } catch (e) {}
})();
true;
`;
}

/** native → web へイベントを1件配送するスクリプトを組み立てる。 */
export function buildDispatchScript(message: OutboundMessage): string {
  // JSON.stringify を二重に通して、文字列としてそのまま埋め込んでも壊れないようにする
  const payload = JSON.stringify(JSON.stringify(message));
  return `
(function () {
  try {
    window.dispatchEvent(new CustomEvent('native-gallery', { detail: JSON.parse(${payload}) }));
  } catch (e) {}
})();
true;
`;
}

/** WebView に設定する User-Agent 接尾辞。web 側の検出フォールバックに使う。 */
export function userAgentSuffix(appVersion: string): string {
  return `PhotoGalleryApp/${appVersion}`;
}
