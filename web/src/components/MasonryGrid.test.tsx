import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

/**
 * 無限スクロールの発火条件。
 *
 * ここは 2 つの不具合の間で綱渡りしている。
 *
 *   F13（2026-09-02 の監査）: IntersectionObserver は「交差したまま」だと
 *     再発火しない。1 ページが画面を埋めない縦長の端末で、2 ページ目以降が
 *     永久に来なかった。
 *   暴走（2026-09-07 に本番実測）: 読み込み前のカードは高さを持たないため、
 *     写真が届くまでグリッドが伸びず sentinel が画面内に居座る。交差だけを
 *     条件にすると loadMore が数フレームで連続発火し、開いた瞬間に
 *     ギャラリー全部（160 枚・11.4MB）を取りに行っていた。
 *
 * いまの条件は「sentinel が近い」かつ「前回ページを足した時点より
 * グリッドが伸びている」。伸びた＝写真が実際に描画された、という判定である。
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

const observedBySentinel: Element[] = [];
const observedByResize: Element[] = [];
let fireIntersection: (() => void) | null = null;
let fireResize: (() => void) | null = null;

class FakeIntersectionObserver {
  constructor(private callback: IntersectionObserverCallback) {
    fireIntersection = () =>
      this.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
  }
  observe(element: Element) {
    observedBySentinel.push(element);
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

class FakeResizeObserver {
  constructor(private callback: ResizeObserverCallback) {
    fireResize = () => this.callback([], this as unknown as ResizeObserver);
  }
  observe(element: Element) {
    observedByResize.push(element);
  }
  disconnect() {}
  unobserve() {}
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

/**
 * jsdom はレイアウトしないので、グリッドの高さと sentinel の位置は自分で与える。
 * 既定は「sentinel は画面内」（getBoundingClientRect が全部 0 を返す）。
 */
function renderGrid(loadMore: () => void, count = 4) {
  const view = render(
    <MasonryGrid images={makeImages(count)} onImageClick={vi.fn()} hasMore loadMore={loadMore} />
  );
  const grid = view.container.querySelector('.grid') as HTMLElement | null;
  let height = 0;
  if (grid) {
    Object.defineProperty(grid, 'scrollHeight', {
      get: () => height,
      configurable: true,
    });
  }
  return {
    ...view,
    setGridHeight: (h: number) => {
      height = h;
    },
    sentinel: view.container.querySelector('.h-1') as HTMLElement | null,
  };
}

beforeEach(() => {
  observedBySentinel.length = 0;
  observedByResize.length = 0;
  fireIntersection = null;
  fireResize = null;
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
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
  it('sentinel とグリッドの両方を監視する', () => {
    renderGrid(vi.fn());

    expect(observedBySentinel).toHaveLength(1);
    expect(observedByResize).toHaveLength(1);
  });

  // 暴走の本体。写真がまだ 1 枚も描画されていないのに次ページを読んではいけない。
  it('グリッドが伸びていない間は loadMore を呼ばない', () => {
    const loadMore = vi.fn();
    renderGrid(loadMore);

    fireIntersection?.();
    fireIntersection?.();
    fireIntersection?.();

    expect(loadMore).not.toHaveBeenCalled();
  });

  // F13 の本体。交差したままでも、写真が届いてグリッドが伸びれば次が来る。
  it('写真が届いてグリッドが伸びたら次ページを読む', () => {
    const loadMore = vi.fn();
    const { setGridHeight } = renderGrid(loadMore);

    setGridHeight(1200);
    fireResize?.();

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('高さが変わらないまま何度発火しても 1 ページしか読まない', () => {
    const loadMore = vi.fn();
    const { setGridHeight } = renderGrid(loadMore);

    setGridHeight(1200);
    fireResize?.();
    fireResize?.();
    fireIntersection?.();
    fireResize?.();

    expect(loadMore).toHaveBeenCalledTimes(1);

    // さらに写真が届いて伸びたら、そこで初めて次の 1 ページ
    setGridHeight(2400);
    fireResize?.();
    expect(loadMore).toHaveBeenCalledTimes(2);
  });

  it('sentinel が画面から十分に遠ければ読まない', () => {
    const loadMore = vi.fn();
    const { setGridHeight, sentinel } = renderGrid(loadMore);
    sentinel!.getBoundingClientRect = () => ({ top: 99999 }) as DOMRect;

    setGridHeight(1200);
    fireResize?.();
    fireIntersection?.();

    expect(loadMore).not.toHaveBeenCalled();
  });

  it('hasMore が false なら何も監視しない', () => {
    render(
      <MasonryGrid images={makeImages(4)} onImageClick={vi.fn()} hasMore={false} loadMore={vi.fn()} />
    );

    expect(observedBySentinel).toHaveLength(0);
    expect(observedByResize).toHaveLength(0);
  });
});
