// 既定は本物の実装のまま。1件だけ戻り値を差し替えて委譲を確認する。
jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(jest.requireActual('expo-crypto').getRandomBytes),
}));

import { getRandomBytes } from 'expo-crypto';

import { BRIDGE_VERSION, SUPPORTED_FEATURES } from './protocol';
import { buildInjectedScript, createNonce, userAgentSuffix } from './inject';

const getRandomBytesMock = getRandomBytes as jest.MockedFunction<
  typeof getRandomBytes
>;

/**
 * 注入する能力情報と nonce。
 *
 * Android の WebView では注入したブリッジがページ内の全フレームから見えるため、
 * nonce が唯一の防壁になる。Math.random では予測される余地が残る。
 */

describe('createNonce', () => {
  it('16 バイト分の hex を返す', () => {
    expect(createNonce()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('呼ぶたびに異なる', () => {
    const values = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(values.size).toBe(50);
  });

  it('ネイティブの乱数（expo-crypto）を使う', () => {
    getRandomBytesMock.mockReturnValueOnce(new Uint8Array(16).fill(0xab));

    expect(createNonce()).toBe('ab'.repeat(16));
    expect(getRandomBytesMock).toHaveBeenCalledWith(16);
  });
});

describe('buildInjectedScript', () => {
  it('nonce と対応機能を web に渡す', () => {
    const script = buildInjectedScript('deadbeef', '1.2.3');

    expect(script).toContain('window.__NATIVE_GALLERY__');
    expect(script).toContain('"nonce":"deadbeef"');
    expect(script).toContain(`"bridgeVersion":${BRIDGE_VERSION}`);
    for (const feature of SUPPORTED_FEATURES) {
      expect(script).toContain(`"${feature}"`);
    }
    // react-native-webview は末尾に true; が無いと稀に無言で失敗する
    expect(script.trimEnd().endsWith('true;')).toBe(true);
  });
});

describe('userAgentSuffix', () => {
  // web/src/lib/nativeBridge.ts がこの文字列で検出する。変えると検出が壊れる。
  it('web が探す接頭辞を保つ', () => {
    expect(userAgentSuffix('1.0.0')).toBe('PhotoGalleryApp/1.0.0');
  });
});
