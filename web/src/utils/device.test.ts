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
});
