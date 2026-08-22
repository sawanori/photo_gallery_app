import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ConfigProvider, App } from 'antd';
import jaJP from 'antd/locale/ja_JP';

const mockUploadImage = vi.fn();
const mockAssertProjectExists = vi.fn();
const mockFinalizeUploadBatch = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('../../../../../../../services/imageService', () => ({
  uploadImageFile: (...args: unknown[]) => mockUploadImage(...args),
  assertProjectExists: (...args: unknown[]) => mockAssertProjectExists(...args),
  finalizeUploadBatch: (...args: unknown[]) => mockFinalizeUploadBatch(...args),
}));

// アップロード前処理は Canvas に依存するため、画面のテストではモックする
vi.mock('../../../../../../../utils/prepareUpload', () => ({
  prepareUpload: (file: File) => Promise.resolve({ file, thumbnails: [] }),
}));

vi.mock('../../../../../../../contexts/AuthContext', () => ({
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
  // 既定では「プロジェクトは存在し、集約は成功する」状態にしておく
  mockAssertProjectExists.mockResolvedValue(undefined);
  mockFinalizeUploadBatch.mockResolvedValue(undefined);
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

    // タイトル入力欄は無く、ファイル名から拡張子を除いたものがタイトルになる
    const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    const uploadBtn = await screen.findByRole('button', { name: /枚をアップロード/ });
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(mockUploadImage).toHaveBeenCalledWith(
        'project-1',
        'admin-uid',
        expect.any(File),
        [],
        'test'
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

    const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    const uploadBtn = await screen.findByRole('button', { name: /枚をアップロード/ });
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/admin/projects/project-1');
    });
  });

  // 集約がバッチで走ること。1枚ごとに走ると同じドキュメントへの書き込みが集中する。
  it('アップロード完了後に finalizeUploadBatch が画像IDをまとめて受け取る', async () => {
    mockUploadImage
      .mockResolvedValueOnce({ id: 'image-1' })
      .mockResolvedValueOnce({ id: 'image-2' });

    const user = userEvent.setup();
    renderWithProviders(<ProjectImageUploadPage />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
    ]);

    const uploadBtn = await screen.findByRole('button', { name: /枚をアップロード/ });
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(mockFinalizeUploadBatch).toHaveBeenCalledTimes(1);
    });
    expect(mockFinalizeUploadBatch).toHaveBeenCalledWith('project-1', [
      'image-1',
      'image-2',
    ]);
  });

  // プロジェクトが無いのに Storage にファイルを撒かないこと
  it('プロジェクトが存在しない場合は1枚もアップロードしない', async () => {
    mockAssertProjectExists.mockRejectedValue(new Error('Project not found'));

    const user = userEvent.setup();
    renderWithProviders(<ProjectImageUploadPage />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['a'], 'a.jpg', { type: 'image/jpeg' }));

    const uploadBtn = await screen.findByRole('button', { name: /枚をアップロード/ });
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(mockAssertProjectExists).toHaveBeenCalledWith('project-1');
    });
    expect(mockUploadImage).not.toHaveBeenCalled();
    expect(mockFinalizeUploadBatch).not.toHaveBeenCalled();
  });
});
