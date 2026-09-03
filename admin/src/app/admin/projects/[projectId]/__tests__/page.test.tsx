import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ConfigProvider, App } from 'antd';
import jaJP from 'antd/locale/ja_JP';

const mockGetProject = vi.fn();
const mockGetProjectExpiryInfo = vi.fn();
const mockGetImagesByProject = vi.fn();
const mockGetInvitationsByProject = vi.fn();

const mockDeleteProject = vi.fn();
const mockDeleteImage = vi.fn();

vi.mock('../../../../../services/projectService', () => ({
  getProject: (...args: unknown[]) => mockGetProject(...args),
  getProjectExpiryInfo: (...args: unknown[]) => mockGetProjectExpiryInfo(...args),
  deleteProject: (...args: unknown[]) => mockDeleteProject(...args),
}));

vi.mock('../../../../../services/imageService', () => ({
  getImagesByProject: (...args: unknown[]) => mockGetImagesByProject(...args),
  deleteImage: (...args: unknown[]) => mockDeleteImage(...args),
}));

vi.mock('../../../../../services/invitationService', () => ({
  getInvitationsByProject: (...args: unknown[]) => mockGetInvitationsByProject(...args),
  getGalleryUrl: (token: string) => `http://localhost:3002/gallery/${token}`,
}));

vi.mock('../../../../../contexts/AuthContext', () => ({
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
    thumbnails: {
      small: 'https://example.com/img1_384.webp',
      medium: 'https://example.com/img1_640.webp',
    },
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

  describe('期限警告アラート', () => {
    it('warning レベルで警告アラートを表示する', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([]);
      mockGetProjectExpiryInfo.mockReturnValue({ level: 'warning', daysRemaining: 10, daysElapsed: 10 });

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/作成から 10 日経過/)).toBeInTheDocument();
        expect(screen.getByText(/残り 10 日で期限切れ/)).toBeInTheDocument();
      });
    });

    it('danger レベルでエラーアラートを表示する', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([]);
      mockGetProjectExpiryInfo.mockReturnValue({ level: 'danger', daysRemaining: 3, daysElapsed: 17 });

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/作成から 17 日経過/)).toBeInTheDocument();
        expect(screen.getByText(/残り 3 日で期限切れ/)).toBeInTheDocument();
      });
    });

    it('expired レベルで「このプロジェクトは期限切れです」を表示する', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([]);
      mockGetProjectExpiryInfo.mockReturnValue({ level: 'expired', daysRemaining: -5, daysElapsed: 25 });

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/このプロジェクトは期限切れです/)).toBeInTheDocument();
      });
    });

    it('期限情報なし（null）の場合はアラートを表示しない', async () => {
      mockGetProject.mockResolvedValue({ ...sampleProject, status: 'archived' });
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([]);
      mockGetProjectExpiryInfo.mockReturnValue(null);

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('田中様 結婚式')).toBeInTheDocument();
      });
      expect(screen.queryByText(/期限切れ/)).not.toBeInTheDocument();
      expect(screen.queryByText(/日経過/)).not.toBeInTheDocument();
    });
  });

  /**
   * 一覧は expiresAt だけで判定していたため、閲覧期限（作成から viewingDays 日）が
   * 切れた招待が「有効」と表示され続けていた。招待詳細は effectiveDeadline を
   * 使っており、同じ招待で表示が食い違っていた。
   */
  describe('招待の期限（effectiveDeadline）', () => {
    const openInvitationsTab = async () => {
      await waitFor(() => {
        expect(screen.getAllByText(/招待/)[0]).toBeInTheDocument();
      });
      screen.getAllByText(/招待/)[0].click();
    };

    it('閲覧期限が切れていれば expiresAt が先でも「期限切れ」と出す', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([
        {
          ...sampleInvitations[0],
          // 作成から7日で閲覧期限。expiresAt はずっと先。
          createdAt: new Date('2020-01-01'),
          viewingDays: 7,
          expiresAt: new Date('2999-12-31'),
        },
      ]);

      renderWithProviders(<ProjectDetailPage />);
      await openInvitationsTab();

      await waitFor(() => {
        expect(screen.getByText('期限切れ')).toBeInTheDocument();
      });
      // 表示する日付も閲覧期限のほう（2020-01-08）
      expect(screen.getByText('2020/01/08 まで')).toBeInTheDocument();
    });

    it('閲覧期限内なら「有効」と出す', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([
        {
          ...sampleInvitations[0],
          createdAt: new Date(),
          viewingDays: 7,
          expiresAt: new Date('2999-12-31'),
        },
      ]);

      renderWithProviders(<ProjectDetailPage />);
      await openInvitationsTab();

      await waitFor(() => {
        expect(screen.getByText('有効')).toBeInTheDocument();
      });
    });

    it('expiresAt が閲覧期限より早ければ expiresAt を表示する', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([
        {
          ...sampleInvitations[0],
          createdAt: new Date('2026-01-01'),
          viewingDays: 30,
          expiresAt: new Date('2026-01-05'),
        },
      ]);

      renderWithProviders(<ProjectDetailPage />);
      await openInvitationsTab();

      await waitFor(() => {
        expect(screen.getByText('2026/01/05 まで')).toBeInTheDocument();
      });
    });
  });

  // 700枚のプロジェクトで原本（3〜4MB）を700枚引いていた。
  describe('画像グリッド', () => {
    it('サムネイル（small）があればそれを読み込む', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue(sampleImages);
      mockGetInvitationsByProject.mockResolvedValue([]);

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByAltText('写真1')).toHaveAttribute(
          'src',
          'https://example.com/img1_384.webp'
        );
      });
    });

    it('サムネイルが無い古い画像は原本にフォールバックする', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue([
        { ...sampleImages[0], thumbnails: undefined },
      ]);
      mockGetInvitationsByProject.mockResolvedValue([]);

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByAltText('写真1')).toHaveAttribute(
          'src',
          'https://example.com/img1.jpg'
        );
      });
    });
  });

  // 「プロジェクトが見つかりません」と読み込み失敗は別物。
  // 前者は削除済み、後者は再試行すれば直る。
  describe('読み込み失敗', () => {
    it('取得に失敗したら Alert と再試行ボタンを出す', async () => {
      mockGetProject.mockRejectedValue(new Error('network'));
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([]);

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('プロジェクトの読み込みに失敗しました')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /再試行/ })).toBeInTheDocument();
      expect(screen.queryByText('プロジェクトが見つかりません')).not.toBeInTheDocument();
    });

    it('再試行ボタンで取り直す', async () => {
      mockGetProject.mockRejectedValueOnce(new Error('network'));
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([]);

      renderWithProviders(<ProjectDetailPage />);

      const retry = await screen.findByRole('button', { name: /再試行/ });
      mockGetProject.mockResolvedValue(sampleProject);
      await userEvent.click(retry);

      await waitFor(() => {
        expect(screen.getByText('田中様 結婚式')).toBeInTheDocument();
      });
    });

    it('本当に見つからない場合は空状態を出す', async () => {
      mockGetProject.mockResolvedValue(null);
      mockGetImagesByProject.mockResolvedValue([]);
      mockGetInvitationsByProject.mockResolvedValue([]);

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('プロジェクトが見つかりません')).toBeInTheDocument();
      });
    });
  });

  // Storage の削除に失敗した画像はドキュメントを残している。
  // 「削除しました」で終わらせると、課金され続けるファイルに誰も気付かない。
  describe('Storage 削除の失敗', () => {
    it('画像削除で消し残しがあれば件数を知らせ、一覧から消さない', async () => {
      mockGetProject.mockResolvedValue(sampleProject);
      mockGetImagesByProject.mockResolvedValue(sampleImages);
      mockGetInvitationsByProject.mockResolvedValue([]);
      mockDeleteImage.mockResolvedValue({
        deletedCount: 0,
        failed: [{ imageId: 'image-1', paths: ['images/admin-uid/1'] }],
      });

      renderWithProviders(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('写真1')).toBeInTheDocument();
      });

      // 画像カードの削除ボタン（ヘッダの「削除」ボタンとは別物）
      await userEvent.click(screen.getByRole('button', { name: '写真1 を削除' }));
      // antd は日本語2文字のラベルに空白を挟む（「削 除」）
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(within(dialog).getByRole('button', { name: /削\s*除/ }));

      await waitFor(() => {
        expect(
          screen.getByText('Storage の削除に失敗した画像が 1 件あります。再実行してください。')
        ).toBeInTheDocument();
      });
      expect(screen.getByText('写真1')).toBeInTheDocument();
    });
  });
});
