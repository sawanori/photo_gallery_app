import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ConfigProvider, App } from 'antd';
import jaJP from 'antd/locale/ja_JP';

const mockGetProject = vi.fn();
const mockGetImagesByProject = vi.fn();
const mockGetInvitationsByProject = vi.fn();

vi.mock('@/services/projectService', () => ({
  getProject: (...args: unknown[]) => mockGetProject(...args),
}));

vi.mock('@/services/imageService', () => ({
  getImagesByProject: (...args: unknown[]) => mockGetImagesByProject(...args),
}));

vi.mock('@/services/invitationService', () => ({
  getInvitationsByProject: (...args: unknown[]) => mockGetInvitationsByProject(...args),
  getGalleryUrl: (token: string) => `http://localhost:3002/gallery/${token}`,
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/projects/project-1',
  useParams: () => ({ projectId: 'project-1' }),
  useSearchParams: () => new URLSearchParams(),
}));

const sampleProject = {
  id: 'project-1',
  name: '田中様 結婚式',
  clientName: '田中太郎',
  status: 'active',
  imageCount: 2,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  createdBy: 'admin-uid',
};

const sampleImages = [
  {
    id: 'image-1',
    projectId: 'project-1',
    url: 'https://example.com/img1.jpg',
    storagePath: 'images/admin-uid/1',
    title: '写真1',
    userId: 'admin-uid',
    likeCount: 0,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  },
];

const sampleInvitations = [
  {
    id: 'invitation-1',
    token: 'abc123',
    projectId: 'project-1',
    clientName: '田中太郎',
    createdBy: 'admin-uid',
    imageIds: ['image-1'],
    expiresAt: new Date('2025-12-31'),
    isActive: true,
    accessCount: 3,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  },
];

let ProjectDetailPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../page');
  ProjectDetailPage = mod.default;
});

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider locale={jaJP}>
      <App>{ui}</App>
    </ConfigProvider>
  );
};

describe('ProjectDetailPage', () => {
  describe('プロジェクト情報ヘッダー', () => {
    it('プロジェクト名とクライアント名を表示する', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue(sampleImages);
      mockGetInvitationsByProject.mockResolvedValue(sampleInvitations);

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('田中様 結婚式')).toBeInTheDocument();
        expect(screen.getByText('田中太郎')).toBeInTheDocument();
      });
    });

    it('ステータスバッジを表示する', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([]);

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('進行中')).toBeInTheDocument();
      });
    });
  });

  describe('画像タブ', () => {
    it('プロジェクトの画像一覧を表示する', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue(sampleImages);
      mockGetInvitationsByProject.mockResolvedValue([]);

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('写真1')).toBeInTheDocument();
      });
    });

    it('画像0件でEmptyを表示する', async () => {
      mockGetProject.mockResolvedValue({ ...sampleProject, imageCount: 0 });
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([]);

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/画像がありません/)).toBeInTheDocument();
      });
    });

    it('「アップロード」ボタンが存在する', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue(sampleImages);
      mockGetInvitationsByProject.mockResolvedValue([]);

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/アップロード/)).toBeInTheDocument();
      });
    });
  });

  describe('招待タブ', () => {
    it('プロジェクトの招待一覧を表示する', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue(sampleImages);
      mockGetInvitationsByProject.mockResolvedValue(sampleInvitations);

      renderWithProviders(<ProjectDetailPage />);

      // Click on the invitations tab
      await waitFor(() => {
        expect(screen.getByText(/招待/)).toBeInTheDocument();
      });

      const invitationsTab = screen.getAllByText(/招待/)[0];
      invitationsTab.click();

      await waitFor(() => {
        expect(screen.getByText('abc123')).toBeInTheDocument();
      });
    });

    it('「招待作成」ボタンが存在する', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([]);

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        const invitationsTab = screen.getAllByText(/招待/)[0];
        invitationsTab.click();
      });

      await waitFor(() => {
        expect(screen.getByText(/招待作成/)).toBeInTheDocument();
      });
    });
  });
});
