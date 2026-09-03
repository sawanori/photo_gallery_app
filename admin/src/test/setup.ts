import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
// アプリは src/app/layout.tsx でこれを読み込んでいる。テストでも同じにしないと
// antd の静的 message / notification が React 19 で描画されず、
// 「画面に出ているはずのもの」を確かめられない。
import '@ant-design/v5-patch-for-react-19';
import React from 'react';

// --- Ant Design が jsdom で必要とするポリフィル ---
// vi.fn() ではなく通常の関数を使う（mockReset で消えないようにするため）
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  root = null;
  rootMargin = '';
  thresholds: number[] = [];
}
global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// --- next/navigation モック ---
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/dashboard',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

// --- next/link モック ---
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// --- Firebase lib モック（全テストでFirebase初期化エラーを防ぐ）---
vi.mock('@/lib/firebase', () => ({
  app: {},
  auth: { onAuthStateChanged: vi.fn() },
  db: {},
  storage: {},
}));
