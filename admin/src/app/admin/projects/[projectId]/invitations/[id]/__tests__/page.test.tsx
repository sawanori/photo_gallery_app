import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ConfigProvider, App } from 'antd';
import jaJP from 'antd/locale/ja_JP';

const mockGetInvitation = vi.fn();
const mockUpdateInvitation = vi.fn();
const mockGetGalleryUrl = vi.fn();
vi.mock('../../../../../../../services/invitationService', () => ({
  getInvitation: (...args: unknown[]) => mockGetInvitation(...args),
  updateInvitation: (...args: unknown[]) => mockUpdateInvitation(...args),
  getGalleryUrl: (...args: unknown[]) => mockGetGalleryUrl(...args),
}));

// 選定結果の表示で使うサービス。モックしないと本物の Firebase を初期化して落ちる。
const mockGetLikedImageIdsByInvitation = vi.fn();
const mockGetImage = vi.fn();
vi.mock('../../../../../../../services/likeService', () => ({
  getLikedImageIdsByInvitation: (...args: unknown[]) =>
    mockGetLikedImageIdsByInvitation(...args),
}));
vi.mock('../../../../../../../services/imageService', () => ({
  getImage: (...args: unknown[]) => mockGetImage(...args),
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/projects/project-1/invitations/invitation-1',
  useParams: () => ({ projectId: 'project-1', id: 'invitation-1' }),
  useSearchParams: () => new URLSearchParams(),
}));

const sampleInvitation = {
  id: 'invitation-1',
  token: 'abc123def456',
  projectId: 'project-1',
  clientName: '田中太郎',
  clientEmail: 'tanaka@example.com',
  createdBy: 'admin-uid',
  imageIds: ['image-1', 'image-2', 'image-3'],
  expiresAt: new Date('2025-12-31'),
  isActive: true,
  accessCount: 5,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

let InvitationDetailPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  // 既定は「まだ選ばれていない」。選定を伴う検証は各テストで上書きする。
  mockGetLikedImageIdsByInvitation.mockResolvedValue([]);
  mockGetImage.mockResolvedValue(null);
  mockGetGalleryUrl.mockImplementation(
    (token: string) => `http://localhost:3002/gallery/${token}`
  );
  const mod = await import('../page');
  InvitationDetailPage = mod.default;
});

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider locale={jaJP}>
      <App>{ui}</App>
    </ConfigProvider>
  );
};

describe('InvitationDetailPage', () => {
  it('招待情報（クライアント名、ステータス、アクセス数）を表示する', async () => {
    mockGetInvitation.mockResolvedValue(sampleInvitation);

    renderWithProviders(<InvitationDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('田中太郎')).toBeInTheDocument();
    });
    // Status tag "有効" - use getAllByText since label also says "有効"
    expect(screen.getAllByText('有効').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/5 回/)).toBeInTheDocument();
  });

  it('ギャラリーURLを表示する', async () => {
    mockGetInvitation.mockResolvedValue(sampleInvitation);

    renderWithProviders(<InvitationDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/localhost:3002\/gallery\/abc123def456/)).toBeInTheDocument();
    });
  });

  it('有効/無効トグルが機能する', async () => {
    mockGetInvitation.mockResolvedValue(sampleInvitation);
    mockUpdateInvitation.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderWithProviders(<InvitationDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('有効')).toBeInTheDocument();
    });

    // Find the switch and click it
    const switchEl = screen.getByRole('switch');
    await user.click(switchEl);

    await waitFor(() => {
      expect(mockUpdateInvitation).toHaveBeenCalledWith('invitation-1', { isActive: false });
    });
  });

  it('画像枚数を表示する', async () => {
    mockGetInvitation.mockResolvedValue(sampleInvitation);

    renderWithProviders(<InvitationDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/3 枚/)).toBeInTheDocument();
    });
  });

  it('選定が0件のときは空状態を出す', async () => {
    mockGetInvitation.mockResolvedValue(sampleInvitation);
    mockGetLikedImageIdsByInvitation.mockResolvedValue([]);

    renderWithProviders(<InvitationDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('まだ選ばれていません')).toBeInTheDocument();
    });
  });

  it('選定された写真の枚数とファイル名を表示する', async () => {
    mockGetInvitation.mockResolvedValue(sampleInvitation);
    mockGetLikedImageIdsByInvitation.mockResolvedValue(['image-2', 'image-1']);
    mockGetImage.mockImplementation(async (id: string) =>
      id === 'image-1'
        ? { id: 'image-1', url: 'https://example.com/1.jpg', storagePath: 'images/u/1', title: 'DSC_2' }
        : { id: 'image-2', url: 'https://example.com/2.jpg', storagePath: 'images/u/2', title: 'DSC_10' }
    );

    renderWithProviders(<InvitationDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('選ばれた枚数')).toBeInTheDocument();
    });
    expect(screen.getByText('DSC_2')).toBeInTheDocument();
    expect(screen.getByText('DSC_10')).toBeInTheDocument();
    // 取得順（image-2, image-1）ではなく、ファイル名の自然順に並ぶ
    const names = screen.getAllByTitle(/^DSC_/).map((el) => el.textContent);
    expect(names).toEqual(['DSC_2', 'DSC_10']);
  });

  it('選定の取得に失敗したら再試行できる', async () => {
    mockGetInvitation.mockResolvedValue(sampleInvitation);
    mockGetLikedImageIdsByInvitation.mockRejectedValue(new Error('firestore down'));

    renderWithProviders(<InvitationDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('選定結果を読み込めませんでした。')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /再試行/ })).toBeInTheDocument();
  });

  // 700枚のプロジェクトで原本（3〜4MB）を並べていた。
  it('選定の一覧はサムネイル（small）を読み込み、無ければ原本に落ちる', async () => {
    mockGetInvitation.mockResolvedValue(sampleInvitation);
    mockGetLikedImageIdsByInvitation.mockResolvedValue(['image-1', 'image-2']);
    mockGetImage.mockImplementation(async (id: string) =>
      id === 'image-1'
        ? {
            id: 'image-1',
            url: 'https://example.com/1.jpg',
            storagePath: 'images/u/1',
            title: 'DSC_1',
            thumbnails: {
              small: 'https://example.com/1_384.webp',
              medium: 'https://example.com/1_640.webp',
            },
          }
        : {
            id: 'image-2',
            url: 'https://example.com/2.jpg',
            storagePath: 'images/u/2',
            title: 'DSC_2',
          }
    );

    renderWithProviders(<InvitationDetailPage />);

    await waitFor(() => {
      expect(screen.getByAltText('DSC_1')).toHaveAttribute(
        'src',
        'https://example.com/1_384.webp'
      );
    });
    expect(screen.getByAltText('DSC_2')).toHaveAttribute(
      'src',
      'https://example.com/2.jpg'
    );
  });

  /**
   * NEXT_PUBLIC_WEB_URL が未設定のとき、以前は管理画面のドメインを指す
   * 404 のリンクを黙って出していた。
   */
  it('ギャラリーURLを作れない場合はエラーを表示し、リンクを出さない', async () => {
    mockGetInvitation.mockResolvedValue(sampleInvitation);
    mockGetGalleryUrl.mockImplementation(() => {
      throw new Error('NEXT_PUBLIC_WEB_URL が設定されていないため…');
    });

    renderWithProviders(<InvitationDetailPage />);

    await waitFor(() => {
      expect(
        screen.getByText('NEXT_PUBLIC_WEB_URL が設定されていないため…')
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/gallery\/abc123def456/)).not.toBeInTheDocument();
  });

  // 「招待が見つかりません」は削除済みを意味する。読み込み失敗とは別物。
  describe('読み込み失敗', () => {
    it('取得に失敗したら Alert と再試行ボタンを出す', async () => {
      mockGetInvitation.mockRejectedValue(new Error('network'));

      renderWithProviders(<InvitationDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('招待の読み込みに失敗しました')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /再試行/ })).toBeInTheDocument();
      expect(screen.queryByText('招待が見つかりません')).not.toBeInTheDocument();
    });

    it('再試行ボタンで取り直す', async () => {
      mockGetInvitation.mockRejectedValueOnce(new Error('network'));

      const user = userEvent.setup();
      renderWithProviders(<InvitationDetailPage />);

      const retry = await screen.findByRole('button', { name: /再試行/ });
      mockGetInvitation.mockResolvedValue(sampleInvitation);
      await user.click(retry);

      await waitFor(() => {
        expect(screen.getByText('田中太郎')).toBeInTheDocument();
      });
    });

    it('本当に見つからない場合は空状態を出す', async () => {
      mockGetInvitation.mockResolvedValue(null);

      renderWithProviders(<InvitationDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('招待が見つかりません')).toBeInTheDocument();
      });
    });
  });

  // 以前は await も catch も無く、権限が無くても「コピーしました」と出していた。
  describe('URL のコピー', () => {
    // userEvent.setup() は navigator.clipboard を自前のスタブで置き換えるため、
    // **setup のあとに**差し替える。先に置くと上書きされて失敗経路を作れない。
    const setClipboard = (writeText: () => Promise<void>) => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });
    };

    it('成功したら成功を伝える', async () => {
      mockGetInvitation.mockResolvedValue(sampleInvitation);

      const user = userEvent.setup();
      setClipboard(() => Promise.resolve());
      renderWithProviders(<InvitationDetailPage />);

      await user.click(await screen.findByRole('button', { name: /コピー/ }));

      expect(await screen.findByText('URLをコピーしました')).toBeInTheDocument();
    });

    it('失敗したら失敗を伝える', async () => {
      mockGetInvitation.mockResolvedValue(sampleInvitation);

      const user = userEvent.setup();
      setClipboard(() => Promise.reject(new Error('denied')));
      renderWithProviders(<InvitationDetailPage />);

      await user.click(await screen.findByRole('button', { name: /コピー/ }));

      expect(await screen.findByText('コピーできませんでした')).toBeInTheDocument();
    });
  });
});
