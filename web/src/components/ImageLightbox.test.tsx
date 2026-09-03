import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * ライトボックスのフォーカス管理。
 *
 * `role="dialog" aria-modal="true"` を名乗りながらフォーカス移動もトラップも
 * 無かった（監査 F13）。キーボードと読み上げの利用者からは「開いたはずのものが
 * 操作できず、背後のグリッドを触り続けている」状態になる。
 */

vi.mock('../contexts/GalleryContext', () => ({
  useGallery: () => ({
    invitation: { id: 'inv1', token: 'tok' },
    toggleLikedId: vi.fn(),
    updateImageLikeCount: vi.fn(),
  }),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'uid1' } }),
}));

vi.mock('../services/downloadService', () => ({
  downloadSingleImage: vi.fn(async () => undefined),
}));

vi.mock('../services/likeService', () => ({
  toggleLike: vi.fn(async () => undefined),
}));

import ImageLightbox from './ImageLightbox';
import type { ImageWithLikeStatus } from '../hooks/useGalleryImages';

const images: ImageWithLikeStatus[] = [0, 1, 2].map((i) => ({
  id: `img${i}`,
  url: `https://firebasestorage.googleapis.com/v0/b/photo-gallery-app-20251204.firebasestorage.app/o/images%2Fuid%2F${i}.jpg?alt=media`,
  storagePath: `images/uid/${i}.jpg`,
  title: `DSC_000${i}`,
  userId: 'uid',
  likeCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  isLiked: false,
}));

function focusableIn(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('ImageLightbox / フォーカス', () => {
  it('開いたら閉じるボタンにフォーカスが移る', () => {
    render(
      <ImageLightbox images={images} currentIndex={1} onClose={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByLabelText('閉じる')).toHaveFocus();
  });

  it('閉じたら元の要素へフォーカスを戻す', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const { unmount } = render(
      <ImageLightbox images={images} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} />
    );
    expect(screen.getByLabelText('閉じる')).toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
  });

  it('Tab は最後の要素から先頭へ戻る（外へ出ない）', async () => {
    const user = userEvent.setup();
    render(
      <ImageLightbox images={images} currentIndex={1} onClose={vi.fn()} onNavigate={vi.fn()} />
    );

    const dialog = screen.getByRole('dialog');
    const focusable = focusableIn(dialog);
    expect(focusable.length).toBeGreaterThan(1);

    focusable[focusable.length - 1].focus();
    await user.tab();

    expect(focusable[0]).toHaveFocus();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('Shift+Tab は先頭の要素から末尾へ回る', async () => {
    const user = userEvent.setup();
    render(
      <ImageLightbox images={images} currentIndex={1} onClose={vi.fn()} onNavigate={vi.fn()} />
    );

    const dialog = screen.getByRole('dialog');
    const focusable = focusableIn(dialog);

    focusable[0].focus();
    await user.tab({ shift: true });

    expect(focusable[focusable.length - 1]).toHaveFocus();
  });

  it('ダイアログ外にフォーカスがある状態で Tab すると中へ引き戻す', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    const user = userEvent.setup();
    render(
      <ImageLightbox images={images} currentIndex={1} onClose={vi.fn()} onNavigate={vi.fn()} />
    );

    outside.focus();
    await user.tab();

    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('Escape で閉じる', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ImageLightbox images={images} currentIndex={0} onClose={onClose} onNavigate={vi.fn()} />
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  // まだ読み込めていない位置（無限スクロールの先）でも同じ約束を守ること
  it('画像が未読み込みの表示でもフォーカスを閉じるボタンへ移す', () => {
    render(
      <ImageLightbox
        images={images}
        currentIndex={5}
        totalCount={10}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByLabelText('閉じる')).toHaveFocus();
  });
});

/**
 * 読み込み状態は「どの URL まで終わったか」から描画時に導いている。
 * 以前は effect の中で setState して読み込み中へ戻していた。
 */
describe('ImageLightbox / 読み込み状態', () => {
  it('読み込みが終わるまでスピナーを出し、終わったら消す', () => {
    render(
      <ImageLightbox images={images} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText('読み込み中')).toBeInTheDocument();

    fireEvent.load(screen.getByAltText('DSC_0000'));

    expect(screen.queryByText('読み込み中')).not.toBeInTheDocument();
  });

  it('読み込みに失敗したらエラー表示に切り替える', () => {
    render(
      <ImageLightbox images={images} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} />
    );

    fireEvent.error(screen.getByAltText('DSC_0000'));

    expect(screen.getByText('画像を読み込めませんでした')).toBeInTheDocument();
    expect(screen.queryByText('読み込み中')).not.toBeInTheDocument();
  });

  // 次の写真へ移ったら、前の写真の「読み込み済み」を引き継がないこと
  it('別の写真へ移ったら読み込み中に戻る', () => {
    const { rerender } = render(
      <ImageLightbox images={images} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} />
    );
    fireEvent.load(screen.getByAltText('DSC_0000'));
    expect(screen.queryByText('読み込み中')).not.toBeInTheDocument();

    rerender(
      <ImageLightbox images={images} currentIndex={1} onClose={vi.fn()} onNavigate={vi.fn()} />
    );

    expect(screen.getByText('読み込み中')).toBeInTheDocument();
  });
});
