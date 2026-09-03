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

describe('ImageLightbox / スワイプ', () => {
  /**
   * 指を置いて動かして離す、を1回分再現する。
   * jsdom は isPrimary を既定で false にするため、明示的に真を渡す
   * （実装は2本目の指を弾くので、渡さないと全て無視される）。
   */
  function swipe(
    target: HTMLElement,
    from: { x: number; y: number },
    to: { x: number; y: number },
    pointerId = 1
  ) {
    fireEvent.pointerDown(target, { clientX: from.x, clientY: from.y, pointerId, isPrimary: true });
    fireEvent.pointerUp(target, { clientX: to.x, clientY: to.y, pointerId, isPrimary: true });
  }

  function renderAt(index: number, onNavigate = vi.fn()) {
    render(
      <ImageLightbox
        images={images}
        currentIndex={index}
        onClose={vi.fn()}
        onNavigate={onNavigate}
        totalCount={images.length}
      />
    );
    return { onNavigate, dialog: screen.getByRole('dialog') };
  }

  it('左へ払うと次の写真へ移る', () => {
    const { onNavigate, dialog } = renderAt(1);
    swipe(dialog, { x: 300, y: 400 }, { x: 200, y: 405 });
    expect(onNavigate).toHaveBeenCalledWith(2);
  });

  it('右へ払うと前の写真へ移る', () => {
    const { onNavigate, dialog } = renderAt(1);
    swipe(dialog, { x: 200, y: 400 }, { x: 300, y: 395 });
    expect(onNavigate).toHaveBeenCalledWith(0);
  });

  it('写真の上で離しても移動する（イベントは親へ上がる）', () => {
    const { onNavigate, dialog } = renderAt(1);
    const img = dialog.querySelector('img') as HTMLElement;
    fireEvent.pointerDown(img, { clientX: 300, clientY: 400, pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(img, { clientX: 200, clientY: 400, pointerId: 1, isPrimary: true });
    expect(onNavigate).toHaveBeenCalledWith(2);
  });

  it('動きが小さければタップとみなして移動しない', () => {
    const { onNavigate, dialog } = renderAt(1);
    swipe(dialog, { x: 300, y: 400 }, { x: 280, y: 400 });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('縦の動きのほうが大きければ移動しない', () => {
    const { onNavigate, dialog } = renderAt(1);
    swipe(dialog, { x: 300, y: 200 }, { x: 220, y: 400 });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  // 実際の指はボタンではなく中のアイコン（svg / path）に当たる。
  // closest でボタンまで辿れていないと、ここだけ通り抜けてしまう。
  it('ボタン内のアイコンから始まった操作でも移動しない', () => {
    const { onNavigate, dialog } = renderAt(1);
    const icon = screen.getByRole('button', { name: '閉じる' }).querySelector('svg') as unknown as HTMLElement;
    fireEvent.pointerDown(icon, { clientX: 300, clientY: 400, pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(dialog, { clientX: 200, clientY: 400, pointerId: 1, isPrimary: true });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  // ピンチで拡大しようとしただけなのに写真が送られていた。
  // 2本目の指が置かれた時点で、進行中のスワイプを捨てる。
  it('2本目の指が触れたらスワイプを取り消す（ピンチで送らない）', () => {
    const { onNavigate, dialog } = renderAt(1);
    fireEvent.pointerDown(dialog, { clientX: 300, clientY: 400, pointerId: 1, isPrimary: true });
    fireEvent.pointerDown(dialog, { clientX: 200, clientY: 400, pointerId: 2, isPrimary: false });
    fireEvent.pointerUp(dialog, { clientX: 120, clientY: 400, pointerId: 2, isPrimary: false });
    fireEvent.pointerUp(dialog, { clientX: 180, clientY: 400, pointerId: 1, isPrimary: true });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('ブラウザで拡大している間は移動しない', () => {
    const original = window.visualViewport;
    Object.defineProperty(window, 'visualViewport', {
      value: { scale: 2.5 },
      writable: true,
      configurable: true,
    });

    const { onNavigate, dialog } = renderAt(1);
    swipe(dialog, { x: 300, y: 400 }, { x: 180, y: 400 });
    expect(onNavigate).not.toHaveBeenCalled();

    Object.defineProperty(window, 'visualViewport', {
      value: original,
      writable: true,
      configurable: true,
    });
  });

  it('最初の写真で右へ払っても何も起きない', () => {
    const { onNavigate, dialog } = renderAt(0);
    swipe(dialog, { x: 200, y: 400 }, { x: 320, y: 400 });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('最後の写真で左へ払っても何も起きない', () => {
    const { onNavigate, dialog } = renderAt(images.length - 1);
    swipe(dialog, { x: 320, y: 400 }, { x: 200, y: 400 });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('別のポインタで離された場合は移動しない', () => {
    const { onNavigate, dialog } = renderAt(1);
    fireEvent.pointerDown(dialog, { clientX: 300, clientY: 400, pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(dialog, { clientX: 200, clientY: 400, pointerId: 3, isPrimary: true });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('途中で中断されたらその操作は捨てる', () => {
    const { onNavigate, dialog } = renderAt(1);
    fireEvent.pointerDown(dialog, { clientX: 300, clientY: 400, pointerId: 1, isPrimary: true });
    fireEvent.pointerCancel(dialog, { clientX: 250, clientY: 400, pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(dialog, { clientX: 200, clientY: 400, pointerId: 1, isPrimary: true });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('読み込み中の表示でも前の写真へ戻れる', () => {
    const onNavigate = vi.fn();
    render(
      <ImageLightbox
        images={images}
        currentIndex={images.length}
        onClose={vi.fn()}
        onNavigate={onNavigate}
        totalCount={images.length + 1}
      />
    );
    const dialog = screen.getByRole('dialog');
    swipe(dialog, { x: 200, y: 400 }, { x: 320, y: 400 });
    expect(onNavigate).toHaveBeenCalledWith(images.length - 1);
  });
});
