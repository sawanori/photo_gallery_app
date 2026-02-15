import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock device utils before importing the service
vi.mock('../utils/device', () => ({
  isIos: vi.fn(() => false),
  isAndroid: vi.fn(() => false),
}));

import { downloadSingleImage } from './downloadService';
import { isIos, isAndroid } from '../utils/device';
import type { Image } from '@/types';

const mockImage: Image = {
  id: 'test-id',
  url: 'https://example.com/photo.jpg',
  storagePath: '/images/test/photo.jpg',
  title: 'test-photo',
  description: '',
  userId: 'user-1',
  likeCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('downloadSingleImage', () => {
  let mockAnchorElement: { href: string; download: string; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['fake-image-data'], { type: 'image/jpeg' })),
    });

    // Mock URL.createObjectURL / revokeObjectURL
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    globalThis.URL.revokeObjectURL = vi.fn();

    // Mock anchor element
    mockAnchorElement = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchorElement as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens new tab on iOS', async () => {
    vi.mocked(isIos).mockReturnValue(true);
    vi.mocked(isAndroid).mockReturnValue(false);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await downloadSingleImage(mockImage);

    expect(openSpy).toHaveBeenCalledWith(mockImage.url, '_blank');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses navigator.share on Android when canShare is supported', async () => {
    vi.mocked(isIos).mockReturnValue(false);
    vi.mocked(isAndroid).mockReturnValue(true);

    const shareMock = vi.fn().mockResolvedValue(undefined);
    const canShareMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'share', { value: shareMock, writable: true, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: canShareMock, writable: true, configurable: true });

    await downloadSingleImage(mockImage);

    expect(fetch).toHaveBeenCalledWith(mockImage.url);
    expect(canShareMock).toHaveBeenCalled();
    expect(shareMock).toHaveBeenCalledWith({
      files: [expect.any(File)],
    });
    // Should NOT fall through to anchor download
    expect(mockAnchorElement.click).not.toHaveBeenCalled();
  });

  it('silently handles AbortError (user cancel) on Android share', async () => {
    vi.mocked(isIos).mockReturnValue(false);
    vi.mocked(isAndroid).mockReturnValue(true);

    const abortError = new DOMException('Share canceled', 'AbortError');
    const shareMock = vi.fn().mockRejectedValue(abortError);
    const canShareMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'share', { value: shareMock, writable: true, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: canShareMock, writable: true, configurable: true });

    await downloadSingleImage(mockImage);

    expect(shareMock).toHaveBeenCalled();
    // Should NOT fall through to anchor download
    expect(mockAnchorElement.click).not.toHaveBeenCalled();
  });

  it('falls back to anchor download on Android when canShare is not supported', async () => {
    vi.mocked(isIos).mockReturnValue(false);
    vi.mocked(isAndroid).mockReturnValue(true);

    Object.defineProperty(navigator, 'canShare', { value: undefined, writable: true, configurable: true });

    await downloadSingleImage(mockImage);

    expect(mockAnchorElement.click).toHaveBeenCalled();
    expect(mockAnchorElement.download).toBe('test-photo.jpeg');
  });

  it('falls back to anchor download on Android when share throws non-AbortError', async () => {
    vi.mocked(isIos).mockReturnValue(false);
    vi.mocked(isAndroid).mockReturnValue(true);

    const shareMock = vi.fn().mockRejectedValue(new Error('NetworkError'));
    const canShareMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'share', { value: shareMock, writable: true, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: canShareMock, writable: true, configurable: true });

    await downloadSingleImage(mockImage);

    // Should fall through to anchor download
    expect(mockAnchorElement.click).toHaveBeenCalled();
  });

  it('uses anchor download on desktop', async () => {
    vi.mocked(isIos).mockReturnValue(false);
    vi.mocked(isAndroid).mockReturnValue(false);

    await downloadSingleImage(mockImage);

    expect(mockAnchorElement.click).toHaveBeenCalled();
    expect(mockAnchorElement.download).toBe('test-photo.jpeg');
    expect(mockAnchorElement.href).toBe('blob:fake-url');
  });
});
