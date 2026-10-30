import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * お気に入り画面の状態の区別と保存対象。
 *
 * 読み込み中や失敗を「まだありません」と表示すると、選択が消えたように見える。
 */

const { gallery, liked, saveMany, startDownload, retryLikes } = vi.hoisted(() => ({
  gallery: { invitation: { clientName: 'test', likeScope: 'perDevice' }, likesStatus: 'ready' },
  liked: { likedImages: [] as { id: string }[] },
  saveMany: vi.fn(),
  startDownload: vi.fn(),
  retryLikes: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('token=tok'),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/hooks/useInvitation', () => ({
  useInvitation: () => ({ isLoading: false, error: null, isValid: true, retryLikes }),
}));
vi.mock('@/hooks/useLikedImages', () => ({ useLikedImages: () => liked }));
vi.mock('@/hooks/useBulkDownload', () => ({
  useBulkDownload: () => ({
    isDownloading: false,
    progress: null,
    lastResult: null,
    startDownload,
    cancelDownload: vi.fn(),
    clearResult: vi.fn(),
  }),
}));
vi.mock('@/hooks/useNativeSave', () => ({
  useNativeSave: () => ({
    isSaving: false,
    progress: null,
    lastResult: null,
    saveMany,
    cancel: vi.fn(),
    clearResult: vi.fn(),
  }),
}));
vi.mock('@/hooks/useIsNativeShell', () => ({ useIsNativeShell: () => ({ isNative: false }) }));
vi.mock('@/contexts/GalleryContext', () => ({ useGallery: () => gallery }));
vi.mock('@/components/Header', () => ({ default: () => null }));
vi.mock('@/components/MasonryGrid', () => ({
  default: ({ images }: { images: unknown[] }) => <div>grid:{images.length}</div>,
}));
vi.mock('@/components/ExpiredLink', () => ({ default: () => null }));
vi.mock('@/components/AndroidSaveGuide', () => ({ default: () => null }));
vi.mock('@/components/LikeScopeNotice', () => ({ default: () => null }));

import LikedPage from './page';

const EMPTY_TEXT = 'お気に入りの写真はまだありません';
const SAVE_BUTTON = { name: 'ZIP' };

beforeEach(() => {
  vi.clearAllMocks();
  gallery.likesStatus = 'ready';
  liked.likedImages = [{ id: 'a' }, { id: 'b' }];
  saveMany.mockReturnValue(false);
  startDownload.mockResolvedValue(undefined);
});

describe('/liked', () => {
  it('読み込み中は「まだありません」も保存ボタンも出さない', () => {
    gallery.likesStatus = 'loading';
    liked.likedImages = [];

    render(<LikedPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_TEXT)).toBeNull();
    expect(screen.queryByRole('button', SAVE_BUTTON)).toBeNull();
  });

  it('失敗時は再試行を出し、「まだありません」は出さない', async () => {
    gallery.likesStatus = 'failed';
    liked.likedImages = [];

    render(<LikedPage />);

    expect(screen.queryByText(EMPTY_TEXT)).toBeNull();
    expect(screen.queryByRole('button', SAVE_BUTTON)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(retryLikes).toHaveBeenCalledTimes(1);
  });

  it('読み込み済みで 0 枚なら「まだありません」を出す', () => {
    liked.likedImages = [];

    render(<LikedPage />);

    expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole('button', SAVE_BUTTON)).toBeNull();
  });

  it('保存はいいねした写真だけを対象にする', async () => {
    render(<LikedPage />);

    expect(screen.getByText('grid:2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', SAVE_BUTTON));

    expect(saveMany).toHaveBeenCalledWith(liked.likedImages);
    expect(startDownload).toHaveBeenCalledWith(liked.likedImages, 'test_favorites');
  });
});
