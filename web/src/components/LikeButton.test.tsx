import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * いいねの操作。
 *
 * 一覧が届く前に押すと、後から届く一覧で上書きされて保存対象から写真が抜ける。
 * また、画面に見えている状態と逆の操作をしないよう、目的の状態を渡す。
 */

const { gallery, setLiked } = vi.hoisted(() => ({
  gallery: {
    invitation: { id: 'inv1', token: 'tok', likeScope: 'perDevice' },
    likesStatus: 'ready',
    toggleLikedId: vi.fn(),
    updateImageLikeCount: vi.fn(),
  },
  setLiked: vi.fn(),
}));

vi.mock('../contexts/GalleryContext', () => ({ useGallery: () => gallery }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'uid1' } }) }));
vi.mock('../services/likeService', () => ({
  setLiked: (...args: unknown[]) => setLiked(...args),
}));

import LikeButton from './LikeButton';

beforeEach(() => {
  vi.clearAllMocks();
  gallery.likesStatus = 'ready';
  setLiked.mockResolvedValue(undefined);
});

describe('LikeButton', () => {
  it.each(['loading', 'failed'])('一覧が %s の間は押せない', async (status) => {
    gallery.likesStatus = status;

    render(<LikeButton imageId="img1" isLiked={false} />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('未選択を押すと、招待と UID を渡して選択状態にする', async () => {
    render(<LikeButton imageId="img1" isLiked={false} />);

    await userEvent.click(screen.getByRole('button'));

    expect(setLiked).toHaveBeenCalledWith(gallery.invitation, 'img1', 'uid1', true);
    expect(gallery.toggleLikedId).toHaveBeenCalledTimes(1);
  });

  it('選択済みを押すと、解除の状態を渡す', async () => {
    render(<LikeButton imageId="img1" isLiked />);

    await userEvent.click(screen.getByRole('button'));

    expect(setLiked).toHaveBeenCalledWith(gallery.invitation, 'img1', 'uid1', false);
  });

  it('書き込みに失敗したら画面を元に戻す', async () => {
    setLiked.mockRejectedValue(new Error('denied'));

    render(<LikeButton imageId="img1" isLiked={false} />);
    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(gallery.toggleLikedId).toHaveBeenCalledTimes(2));
  });
});
