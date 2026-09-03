import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

/**
 * 無限スクロールの sentinel。
 *
 * IntersectionObserver は「交差したまま」だと再発火しない。次ページが届いても
 * observer を作り直さないと、縦長の画面では sentinel が画面内に居座ったまま
 * 2 ページ目以降が永久に来なかった（監査 F13）。
 * `images.length` を依存に入れて、ページが増えたら張り直す。
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

import MasonryGrid from './MasonryGrid';
import type { ImageWithLikeStatus } from '../hooks/useGalleryImages';

const observed: Element[] = [];
const disconnects: number[] = [];
let triggerIntersection: (() => void) | null = null;

class FakeIntersectionObserver {
  constructor(private callback: IntersectionObserverCallback) {
    triggerIntersection = () =>
      this.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
  }
  observe(element: Element) {
    observed.push(element);
  }
  disconnect() {
    disconnects.push(observed.length);
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}

function makeImages(count: number): ImageWithLikeStatus[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `img${i}`,
    url: `https://example.com/${i}.jpg`,
    storagePath: `images/uid/${i}.jpg`,
    title: `DSC_${i}`,
    userId: 'uid',
    likeCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    isLiked: false,
  }));
}

beforeEach(() => {
  observed.length = 0;
  disconnects.length = 0;
  triggerIntersection = null;
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MasonryGrid / 無限スクロール', () => {
  it('sentinel が交差したら loadMore を呼ぶ', () => {
    const loadMore = vi.fn();
    render(
      <MasonryGrid
        images={makeImages(4)}
        onImageClick={vi.fn()}
        hasMore
        loadMore={loadMore}
      />
    );

    expect(observed).toHaveLength(1);
    triggerIntersection?.();
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  // ここが F13 の本体。ページが増えたのに observer を張り直さないと次が来ない。
  it('画像が増えたら observer を張り直す', () => {
    const loadMore = vi.fn();
    const { rerender } = render(
      <MasonryGrid
        images={makeImages(4)}
        onImageClick={vi.fn()}
        hasMore
        loadMore={loadMore}
      />
    );
    expect(observed).toHaveLength(1);

    rerender(
      <MasonryGrid
        images={makeImages(8)}
        onImageClick={vi.fn()}
        hasMore
        loadMore={loadMore}
      />
    );

    expect(disconnects.length).toBeGreaterThanOrEqual(1);
    expect(observed).toHaveLength(2);

    // 張り直した observer からも loadMore に届くこと
    triggerIntersection?.();
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('hasMore が false なら sentinel を監視しない', () => {
    render(
      <MasonryGrid images={makeImages(4)} onImageClick={vi.fn()} hasMore={false} loadMore={vi.fn()} />
    );

    expect(observed).toHaveLength(0);
  });
});
