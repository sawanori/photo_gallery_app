import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock device utils before importing the service
vi.mock('../utils/device', () => ({
  isIos: vi.fn(() => false),
  isAndroid: vi.fn(() => false),
}));

// ESM のエクスポートは後から差し替えられないため、モジュールごと差し替える
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

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

/**
 * ZIP の生成方法と進捗の段階。
 *
 * 納品する写真は JPEG で既に圧縮されている。既定の DEFLATE で再圧縮しても
 * ほとんど縮まないのに時間だけかかるため、無圧縮格納（STORE）にしてある。
 * ここが既定に戻ると、数百枚のときに生成が目に見えて遅くなる。
 */
describe('downloadImagesAsZip', () => {
  const images: Image[] = [
    { ...mockImage, id: 'a', title: 'a', url: 'https://example.com/a.jpg' },
    { ...mockImage, id: 'b', title: 'b', url: 'https://example.com/b.jpg' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['x'], { type: 'image/jpeg' })),
    });
  });

  it('無圧縮格納（STORE）で生成する', async () => {
    const { downloadImagesAsZip } = await import('./downloadService');
    const JSZip = (await import('jszip')).default;
    const generateAsync = vi.spyOn(JSZip.prototype, 'generateAsync');

    await downloadImagesAsZip(images, 'photos');

    expect(generateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'blob', compression: 'STORE' }),
      expect.any(Function)
    );
  });

  it('取得中と生成中を段階として通知する', async () => {
    const { downloadImagesAsZip } = await import('./downloadService');
    const phases: string[] = [];

    await downloadImagesAsZip(images, 'photos', (p) => {
      if (p.phase && phases.at(-1) !== p.phase) phases.push(p.phase);
    });

    expect(phases).toEqual(['fetching', 'zipping']);
  });

  it('生成中に中止されたらファイルを渡さない', async () => {
    const { downloadImagesAsZip } = await import('./downloadService');
    const { saveAs } = await import('file-saver');
    vi.mocked(saveAs).mockClear();
    const controller = new AbortController();

    await expect(
      downloadImagesAsZip(images, 'photos', (p) => {
        // 生成に入った時点で中止する
        if (p.phase === 'zipping') controller.abort();
      }, controller.signal)
    ).rejects.toThrow();

    expect(saveAs).not.toHaveBeenCalled();
  });
});
