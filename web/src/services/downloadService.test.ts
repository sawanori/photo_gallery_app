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

  it('opens new tab on Android', async () => {
    vi.mocked(isIos).mockReturnValue(false);
    vi.mocked(isAndroid).mockReturnValue(true);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await downloadSingleImage(mockImage);

    expect(openSpy).toHaveBeenCalledWith(mockImage.url, '_blank');
    expect(fetch).not.toHaveBeenCalled();
    expect(mockAnchorElement.click).not.toHaveBeenCalled();
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
