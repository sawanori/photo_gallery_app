import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ConfigProvider, App } from 'antd';
import jaJP from 'antd/locale/ja_JP';

const mockRouterReplace = vi.fn();
const authValue = {
  user: { uid: 'admin-uid', email: 'admin@test.com' },
  profile: { id: 'admin-uid', email: 'admin@test.com', role: 'admin' },
  isLoading: false,
  isAuthenticated: true,
  isAdmin: true,
  login: vi.fn(),
  logout: vi.fn(),
};

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => authValue,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockRouterReplace,
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/dashboard',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

let AdminLayout: React.ComponentType<{ children: React.ReactNode }>;

const setAuth = (overrides: Partial<typeof authValue>) => {
  Object.assign(authValue, overrides);
};

beforeEach(async () => {
  vi.clearAllMocks();
  setAuth({ isLoading: false, isAuthenticated: true, isAdmin: true });
  const mod = await import('../layout');
  AdminLayout = mod.default;
});

const renderLayout = () =>
  render(
    <ConfigProvider locale={jaJP}>
      <App>
        <AdminLayout>
          <div>本文</div>
        </AdminLayout>
      </App>
    </ConfigProvider>
  );

describe('AdminLayout', () => {
  it('管理者なら中身を表示し、遷移しない', async () => {
    renderLayout();

    expect(screen.getByText('本文')).toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  /**
   * 以前はレンダー中に router.replace を呼んでいた。Strict Mode で二重に走り、
   * React からも「レンダー中に別コンポーネントを更新した」と警告される。
   */
  it('未認証ならレンダー中ではなく副作用としてトップへ戻す', async () => {
    setAuth({ isAuthenticated: false, isAdmin: false });

    renderLayout();

    expect(screen.queryByText('本文')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/');
    });
  });

  it('管理者でなければトップへ戻す', async () => {
    setAuth({ isAuthenticated: true, isAdmin: false });

    renderLayout();

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/');
    });
  });

  it('判定中は遷移しない（読み込み表示のまま）', () => {
    setAuth({ isLoading: true });

    renderLayout();

    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(screen.queryByText('本文')).not.toBeInTheDocument();
  });
});
