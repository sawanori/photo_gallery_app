import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ConfigProvider, App } from 'antd';
import jaJP from 'antd/locale/ja_JP';

const mockUploadImage = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('@/services/imageService', () => ({
  uploadImage: (...args: unknown[]) => mockUploadImage(...args),
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
  usePathname: () => '/admin/projects/project-1/images/upload',
  useParams: () => ({ projectId: 'project-1' }),
  useSearchParams: () => new URLSearchParams(),
}));

let ProjectImageUploadPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../page');
  ProjectImageUploadPage = mod.default;
});

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider locale={jaJP}>
      <App>{ui}</App>
    </ConfigProvider>
  );
};

describe('ProjectImageUploadPage', () => {
  it('アップロードエリアを表示する', async () => {
    renderWithProviders(<ProjectImageUploadPage />);

    await waitFor(() => {
      const dragger = document.querySelector('.ant-upload-drag');
      expect(dragger).toBeTruthy();
    });
  });

  it('uploadImage呼び出し時にprojectIdが渡される', async () => {
    mockUploadImage.mockResolvedValue({
      id: 'image-1',
      projectId: 'project-1',
      url: 'https://example.com/img.jpg',
      storagePath: 'images/admin-uid/1',
      title: 'テスト画像',
      userId: 'admin-uid',
      likeCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const user = userEvent.setup();
    renderWithProviders(<ProjectImageUploadPage />);

    // Enter title
    await waitFor(() => {
      expect(screen.getByLabelText(/タイトル/)).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/タイトル/), 'テスト画像');

    // Create a test file and upload
    const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    // Click upload button
    const uploadBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(mockUploadImage).toHaveBeenCalledWith(
        'project-1',
        'admin-uid',
        expect.any(File),
        'テスト画像'
      );
    });
  });

  it('成功後にプロジェクト詳細に戻る', async () => {
    mockUploadImage.mockResolvedValue({
      id: 'image-1',
      projectId: 'project-1',
      url: 'https://example.com/img.jpg',
      storagePath: 'images/admin-uid/1',
      title: 'テスト画像',
      userId: 'admin-uid',
      likeCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const user = userEvent.setup();
    renderWithProviders(<ProjectImageUploadPage />);

    // Enter title
    await waitFor(() => {
      expect(screen.getByLabelText(/タイトル/)).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/タイトル/), 'テスト画像');

    // Create a test file and upload
    const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    // Click upload button
    const uploadBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/admin/projects/project-1');
    });
  });
});
