import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * サムネイルカードの操作可能性と構造。
 *
 * 監査（2026-09-02）の 2 点を固定する。
 *   F4  Tailwind 4 の `hover:` は `@media (hover: hover)` に閉じるためスマホでは
 *       オーバーレイが一生表示されないのに、中のボタンは押せたままだった。
 *       サムネ右上をタップすると無言でお気に入りが反転し、新規タブが開いていた。
 *   F13 `role="button"` の div の中に `<button>` を入れ子にしていた。
 *
 * **クラス名で固定している理由**: jsdom は Tailwind の CSS を読み込まないため、
 * `getComputedStyle` で `pointer-events` を確かめても常に既定値しか返らない。
 * 生成される CSS ではなく「どの変種を付けたか」を契約として固定する。
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

import ImageCard from './ImageCard';
import type { ImageWithLikeStatus } from '../hooks/useGalleryImages';

const IMAGE: ImageWithLikeStatus = {
  id: 'img1',
  url: 'https://firebasestorage.googleapis.com/v0/b/photo-gallery-app-20251204.firebasestorage.app/o/images%2Fuid%2Fa.jpg?alt=media',
  storagePath: 'images/uid/a.jpg',
  title: 'DSC_0001',
  userId: 'uid',
  likeCount: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  isLiked: false,
};

describe('ImageCard / 操作ボタンの押せる条件', () => {
  it('既定では押せず、hover 中とタッチ端末でだけ押せる', () => {
    render(<ImageCard image={IMAGE} index={0} onImageClick={vi.fn()} />);
    const actions = screen.getByTestId('image-card-actions');

    // 見えていない間は押せない
    expect(actions).toHaveClass('pointer-events-none');
    // hover できる端末では hover 中だけ押せる
    expect(actions).toHaveClass('group-hover:pointer-events-auto');
    // タッチ端末（hover できない）では常時表示・常時操作可
    expect(actions).toHaveClass('pointer-coarse:pointer-events-auto');
    expect(actions).toHaveClass('pointer-coarse:opacity-100');
  });

  it('情報のオーバーレイは常に押せない（拡大表示を覆わない）', () => {
    const { container } = render(
      <ImageCard image={IMAGE} index={0} onImageClick={vi.fn()} />
    );
    const overlay = container.querySelector('.absolute.inset-0.bg-gradient-to-t');

    expect(overlay).not.toBeNull();
    expect(overlay).toHaveClass('pointer-events-none');
    expect(overlay?.className).not.toContain('pointer-events-auto');
  });
});

describe('ImageCard / 構造', () => {
  it('対話要素を入れ子にしない', () => {
    const { container } = render(
      <ImageCard image={IMAGE} index={0} onImageClick={vi.fn()} />
    );

    expect(container.querySelector('[role="button"]')).toBeNull();
    expect(container.querySelector('button button')).toBeNull();
  });

  it('拡大表示は本物のボタンで、クリックすると index を渡す', async () => {
    const onImageClick = vi.fn();
    const user = userEvent.setup();
    render(<ImageCard image={IMAGE} index={7} onImageClick={onImageClick} />);

    await user.click(screen.getByRole('button', { name: 'DSC_0001 を拡大表示' }));

    expect(onImageClick).toHaveBeenCalledWith(7);
  });

  it('キーボードでも開ける（button なので Enter が効く）', async () => {
    const onImageClick = vi.fn();
    const user = userEvent.setup();
    render(<ImageCard image={IMAGE} index={2} onImageClick={onImageClick} />);

    screen.getByRole('button', { name: 'DSC_0001 を拡大表示' }).focus();
    await user.keyboard('{Enter}');

    expect(onImageClick).toHaveBeenCalledWith(2);
  });
});
