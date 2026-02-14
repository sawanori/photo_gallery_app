import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ConfigProvider, App } from 'antd';
import jaJP from 'antd/locale/ja_JP';

const mockGetInvitation = vi.fn();
const mockUpdateInvitation = vi.fn();
vi.mock('@/services/invitationService', () => ({
  getInvitation: (...args: unknown[]) => mockGetInvitation(...args),
  updateInvitation: (...args: unknown[]) => mockUpdateInvitation(...args),
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
});
