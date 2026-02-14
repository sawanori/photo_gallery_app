import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ConfigProvider, App } from 'antd';
import jaJP from 'antd/locale/ja_JP';

const mockCreateProject = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('@/services/projectService', () => ({
  createProject: (...args: unknown[]) => mockCreateProject(...args),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'admin-uid', email: 'admin@test.com' },
    profile: { id: 'admin-uid', email: 'admin@test.com', role: 'admin' },
    isLoading: false,
    isAuthenticated: true,
    isAdmin: true,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/projects/new',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

let ProjectCreatePage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../page');
  ProjectCreatePage = mod.default;
});

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider locale={jaJP}>
      <App>{ui}</App>
    </ConfigProvider>
  );
};

describe('ProjectCreatePage', () => {
  it('フォームフィールドを表示する', async () => {
    renderWithProviders(<ProjectCreatePage />);

    expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();
    expect(screen.getByLabelText(/クライアント名/)).toBeInTheDocument();
  });

  it('送信時にcreateProjectを正しい引数で呼び出す', async () => {
    mockCreateProject.mockResolvedValue({ id: 'new-project-id' });

    const user = userEvent.setup();
    renderWithProviders(<ProjectCreatePage />);

    await user.type(screen.getByLabelText(/プロジェクト名/), '田中様 結婚式');
    await user.type(screen.getByLabelText(/クライアント名/), '田中太郎');

    const submitBtn = document.querySelector('button[type="submit"]')!;
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '田中様 結婚式',
          clientName: '田中太郎',
          createdBy: 'admin-uid',
        })
      );
    });
  });

  it('成功後にrouter.pushでプロジェクト詳細に遷移する', async () => {
    mockCreateProject.mockResolvedValue({ id: 'new-project-id' });

    const user = userEvent.setup();
    renderWithProviders(<ProjectCreatePage />);

    await user.type(screen.getByLabelText(/プロジェクト名/), 'テスト');
    await user.type(screen.getByLabelText(/クライアント名/), 'テスト');

    const submitBtn = document.querySelector('button[type="submit"]')!;
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/admin/projects/new-project-id');
    });
  });

  it('エラー時にエラーメッセージを表示する', async () => {
    mockCreateProject.mockRejectedValue(new Error('作成に失敗しました'));

    const user = userEvent.setup();
    renderWithProviders(<ProjectCreatePage />);

    await user.type(screen.getByLabelText(/プロジェクト名/), 'テスト');
    await user.type(screen.getByLabelText(/クライアント名/), 'テスト');

    const submitBtn = document.querySelector('button[type="submit"]')!;
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalled();
    });
  });

  it('送信中はボタンがloading状態になる', async () => {
    // Never resolve to keep loading
    mockCreateProject.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    renderWithProviders(<ProjectCreatePage />);

    await user.type(screen.getByLabelText(/プロジェクト名/), 'テスト');
    await user.type(screen.getByLabelText(/クライアント名/), 'テスト');

    const submitBtn = document.querySelector('button[type="submit"]')!;
    await user.click(submitBtn);

    await waitFor(() => {
      // Button should be in loading state (Ant Design adds ant-btn-loading class)
      expect(submitBtn.closest('.ant-btn-loading') || submitBtn.querySelector('.ant-btn-loading-icon')).toBeTruthy();
    });
  });
});
