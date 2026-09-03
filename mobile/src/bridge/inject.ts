import { getRandomBytes } from 'expo-crypto';
import { Platform } from 'react-native';

import {
  BRIDGE_VERSION,
  SUPPORTED_FEATURES,
  type OutboundMessage,
} from './protocol';

/**
 * 起動ごとの nonce。web からのメッセージはこれを持っていないと無視する。
 *
 * Math.random は使わない。Android の WebView では注入したブリッジが全フレームから
 * 見えるため、nonce が唯一の防壁になる。予測可能な乱数だと第三者の iframe から
 * 保存要求を偽装される余地が残る。expo-crypto はネイティブの CSPRNG を呼ぶ。
 */
export function createNonce(): string {
  return Array.from(getRandomBytes(16), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
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
