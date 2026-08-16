import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BRIDGE_VERSION,
  detectNativeShell,
  postToNative,
  subscribeToNative,
  supportsFeature,
  type NativeCapabilities,
} from './nativeBridge';

const REAL_UA = navigator.userAgent;

function setUserAgent(value: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value,
    configurable: true,
  });
}

function injectCapabilities(overrides: Partial<NativeCapabilities> = {}) {
  window.__NATIVE_GALLERY__ = {
    bridgeVersion: BRIDGE_VERSION,
    supports: ['saveImage', 'saveImages', 'cancelSave', 'openSettings'],
    platform: 'ios',
    appVersion: '1.0.0',
    nonce: 'test-nonce',
    ...overrides,
  };
}

afterEach(() => {
  delete window.__NATIVE_GALLERY__;
  delete window.ReactNativeWebView;
  setUserAgent(REAL_UA);
  vi.restoreAllMocks();
});

describe('detectNativeShell', () => {
  it('通常のブラウザでは null を返す', () => {
    expect(detectNativeShell()).toBeNull();
  });

  it('注入グローバルがあればそれを返す', () => {
    injectCapabilities({ appVersion: '2.3.4' });
    expect(detectNativeShell()?.appVersion).toBe('2.3.4');
    expect(detectNativeShell()?.nonce).toBe('test-nonce');
  });

  // Android の injectedJavaScriptBeforeContentLoaded は確実に届かないため、
  // User-Agent だけでもネイティブと判定できる必要がある。
  it('注入が届かなくても User-Agent で判定できる', () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit PhotoGalleryApp/1.2.3');
    const capabilities = detectNativeShell();
    expect(capabilities).not.toBeNull();
    expect(capabilities?.platform).toBe('android');
    expect(capabilities?.appVersion).toBe('1.2.3');
    expect(capabilities?.nonce).toBeNull();
  });

  it('ReactNativeWebView の存在だけでも判定できる', () => {
    window.ReactNativeWebView = { postMessage: vi.fn() };
    expect(detectNativeShell()).not.toBeNull();
  });
});

describe('supportsFeature', () => {
  it('ブラウザでは常に false', () => {
    expect(supportsFeature('saveImage')).toBe(false);
  });

  it('supports に含まれる機能だけ true', () => {
    injectCapabilities({ supports: ['saveImage'] });
    expect(supportsFeature('saveImage')).toBe(true);
    expect(supportsFeature('saveImages')).toBe(false);
  });

  // 古いアプリに新しい web がぶつかったときにフォールバックできること
  it('bridgeVersion が違えば false', () => {
    injectCapabilities({ bridgeVersion: 99 });
    expect(supportsFeature('saveImage')).toBe(false);
  });
});

describe('postToNative', () => {
  it('ブラウザでは例外を投げず false を返す', () => {
    expect(() => postToNative({ type: 'openSettings' })).not.toThrow();
    expect(postToNative({ type: 'openSettings' })).toBe(false);
  });

  it('nonce と version を付けて送る', () => {
    const postMessage = vi.fn();
    window.ReactNativeWebView = { postMessage };
    injectCapabilities();

    expect(postToNative({ type: 'cancelSave', requestId: 'r1' })).toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(postMessage.mock.calls[0][0] as string);
    expect(payload).toMatchObject({
      type: 'cancelSave',
      requestId: 'r1',
      v: BRIDGE_VERSION,
      nonce: 'test-nonce',
    });
  });

  it('ReactNativeWebView が無ければ送らない', () => {
    injectCapabilities();
    expect(postToNative({ type: 'openSettings' })).toBe(false);
  });
});

describe('subscribeToNative', () => {
  it('native-gallery イベントを受け取り、解除できる', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToNative(handler);

    window.dispatchEvent(
      new CustomEvent('native-gallery', {
        detail: {
          v: BRIDGE_VERSION,
          type: 'saveResult',
          requestId: 'r1',
          ok: true,
          savedCount: 1,
          failedCount: 0,
        },
      })
    );
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    window.dispatchEvent(
      new CustomEvent('native-gallery', {
        detail: { v: BRIDGE_VERSION, type: 'saveResult', requestId: 'r2' },
      })
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('バージョン違いと未知の type を無視する', () => {
    const handler = vi.fn();
    subscribeToNative(handler);

    window.dispatchEvent(
      new CustomEvent('native-gallery', {
        detail: { v: 99, type: 'saveResult', requestId: 'r1' },
      })
    );
    window.dispatchEvent(
      new CustomEvent('native-gallery', {
        detail: { v: BRIDGE_VERSION, type: 'somethingNew', requestId: 'r1' },
      })
    );
    window.dispatchEvent(new CustomEvent('native-gallery', { detail: null }));

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('保存メッセージに URL を含めない（認可の前提）', () => {
  it('saveImage は imageId と token だけを送る', () => {
    const postMessage = vi.fn();
    window.ReactNativeWebView = { postMessage };
    injectCapabilities();

    postToNative({
      type: 'saveImage',
      requestId: 'r1',
      token: 'tok',
      imageId: 'img1',
    });

    const payload = JSON.parse(postMessage.mock.calls[0][0] as string);
    expect(payload).toMatchObject({ type: 'saveImage', token: 'tok', imageId: 'img1' });
    // URL を渡せる余地が残っていないこと
    expect(JSON.stringify(payload)).not.toContain('http');
  });

  it('saveImages は imageIds と token だけを送る', () => {
    const postMessage = vi.fn();
    window.ReactNativeWebView = { postMessage };
    injectCapabilities();

    postToNative({
      type: 'saveImages',
      requestId: 'r1',
      token: 'tok',
      imageIds: ['a', 'b'],
    });

    const payload = JSON.parse(postMessage.mock.calls[0][0] as string);
    expect(payload.imageIds).toEqual(['a', 'b']);
    expect(JSON.stringify(payload)).not.toContain('http');
  });
});
