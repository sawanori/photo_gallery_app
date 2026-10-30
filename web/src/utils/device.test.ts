import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('device utils', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockUserAgent(ua: string, platform = '', maxTouchPoints = 0) {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: ua,
        platform,
        maxTouchPoints,
      },
      writable: true,
      configurable: true,
    });
  }

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  describe('isIos', () => {
    it('returns true for iPhone user agent', async () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)');
      const { isIos } = await import('./device');
      expect(isIos()).toBe(true);
    });

    it('returns true for iPad user agent', async () => {
      mockUserAgent('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)');
      const { isIos } = await import('./device');
      expect(isIos()).toBe(true);
    });

    it('returns true for iPad pretending to be Mac (iPadOS 13+)', async () => {
      mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 5);
      const { isIos } = await import('./device');
      expect(isIos()).toBe(true);
    });

    it('returns false for Android', async () => {
      mockUserAgent('Mozilla/5.0 (Linux; Android 13)');
      const { isIos } = await import('./device');
      expect(isIos()).toBe(false);
    });

    it('returns false for desktop', async () => {
      mockUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0);
      const { isIos } = await import('./device');
      expect(isIos()).toBe(false);
    });
  });

  describe('isAndroid', () => {
    it('returns true for Android user agent', async () => {
      mockUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7)');
      const { isAndroid } = await import('./device');
      expect(isAndroid()).toBe(true);
    });

    it('returns false for iPhone', async () => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)');
      const { isAndroid } = await import('./device');
      expect(isAndroid()).toBe(false);
    });

    it('returns false for desktop', async () => {
      mockUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
      const { isAndroid } = await import('./device');
      expect(isAndroid()).toBe(false);
    });
  });

  describe('isInAppBrowser', () => {
    it.each([
      ['LINE（iOS）', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari Line/13.0.0'],
      ['LINE（Android）', 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 Line/13.0.0'],
      ['Instagram', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Instagram 300.0'],
      ['Facebook', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/400.0]'],
    ])('%s を判定する', async (_name, ua) => {
      mockUserAgent(ua);
      const { isInAppBrowser } = await import('./device');
      expect(isInAppBrowser()).toBe(true);
    });

    it.each([
      ['Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'],
      ['Chrome', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'],
      ['Line を語の一部に含むもの', 'Mozilla/5.0 Online/1.0'],
    ])('%s は判定しない', async (_name, ua) => {
      mockUserAgent(ua);
      const { isInAppBrowser } = await import('./device');
      expect(isInAppBrowser()).toBe(false);
    });
  });
});
