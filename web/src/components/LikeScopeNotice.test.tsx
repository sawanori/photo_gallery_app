import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * perDevice の招待の案内。
 * shared の招待には出さない。全員で選択を共有するので、案内の内容が事実に反する。
 */

const { gallery, shell, device } = vi.hoisted(() => ({
  gallery: { invitation: null as { likeScope?: string } | null },
  shell: { isNative: false },
  device: { inApp: false },
}));

vi.mock('../contexts/GalleryContext', () => ({ useGallery: () => gallery }));
vi.mock('../hooks/useIsNativeShell', () => ({ useIsNativeShell: () => shell }));
vi.mock('../utils/device', () => ({ isInAppBrowser: () => device.inApp }));

import LikeScopeNotice from './LikeScopeNotice';

beforeEach(() => {
  gallery.invitation = { likeScope: 'perDevice' };
  shell.isNative = false;
  device.inApp = false;
});

describe('LikeScopeNotice', () => {
  it.each([[undefined], ['shared']])('likeScope が %s の招待では何も描かない', (likeScope) => {
    gallery.invitation = { likeScope };

    const { container } = render(<LikeScopeNotice />);

    expect(container).toBeEmptyDOMElement();
  });

  it('通常のブラウザでは 1 行の案内を出す', () => {
    render(<LikeScopeNotice />);

    expect(screen.getByText(/この画面で開いている場所にだけ/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('アプリ内ブラウザでは強調した案内とコピーボタンを出す', () => {
    device.inApp = true;

    render(<LikeScopeNotice />);

    expect(screen.getByText(/Safari や Chrome/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'リンクをコピー' })).toBeInTheDocument();
  });

  it('ネイティブアプリでは強調しない', () => {
    shell.isNative = true;
    device.inApp = true;

    render(<LikeScopeNotice />);

    expect(screen.getByText(/この画面で開いている場所にだけ/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
