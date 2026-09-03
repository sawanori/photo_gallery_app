import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ShareButton from './ShareButton';
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

/** navigator の共有系 API を差し替える。undefined を渡すと「非対応」になる。 */
function setShareSupport(options: {
  share?: unknown;
  canShare?: unknown;
}) {
  Object.defineProperty(navigator, 'share', {
    value: options.share,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(navigator, 'canShare', {
    value: options.canShare,
    writable: true,
    configurable: true,
  });
}

describe('ShareButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ファイル共有に対応していれば表示する', () => {
    setShareSupport({ share: vi.fn(), canShare: vi.fn(() => true) });

    render(<ShareButton image={mockImage} />);
    expect(screen.getByRole('button', { name: '共有' })).toBeInTheDocument();
  });

  it('canShare が無いブラウザでは表示しない', () => {
    setShareSupport({ share: vi.fn(), canShare: undefined });

    const { container } = render(<ShareButton image={mockImage} />);
    expect(container.firstChild).toBeNull();
  });

  // 以前は Android を一律で除外していた。LINE などへ画像そのものを渡せる導線は
  // この共有シートだけなので、対応している限り出す。
  it('Android でも表示する', () => {
    const ua = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      writable: true,
      configurable: true,
    });
    setShareSupport({ share: vi.fn(), canShare: vi.fn(() => true) });

    render(<ShareButton image={mockImage} />);
    expect(screen.getByRole('button', { name: '共有' })).toBeInTheDocument();

    Object.defineProperty(navigator, 'userAgent', { value: ua, writable: true, configurable: true });
  });

  it('押すと画像ファイルそのものを share() に渡す', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShareSupport({ share, canShare: vi.fn(() => true) });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['x'], { type: 'image/jpeg' }),
      })
    );

    render(<ShareButton image={mockImage} />);
    await userEvent.click(screen.getByRole('button', { name: '共有' }));

    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0] as { files: File[] };
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0].name).toBe('test-photo.jpeg');
    expect(arg.files[0].type).toBe('image/jpeg');
  });

  it('端末がファイル共有を扱えなければ share() を呼ばない', async () => {
    const share = vi.fn();
    setShareSupport({ share, canShare: vi.fn(() => false) });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['x'], { type: 'image/jpeg' }),
      })
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ShareButton image={mockImage} />);
    await userEvent.click(screen.getByRole('button', { name: '共有' }));

    expect(share).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('画像の取得に失敗したら share() を呼ばない', async () => {
    const share = vi.fn();
    setShareSupport({ share, canShare: vi.fn(() => true) });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ShareButton image={mockImage} />);
    await userEvent.click(screen.getByRole('button', { name: '共有' }));

    expect(share).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});
