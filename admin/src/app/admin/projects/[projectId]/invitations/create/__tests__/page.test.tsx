import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ConfigProvider, App } from 'antd';
import jaJP from 'antd/locale/ja_JP';

const mockGetImagesByProject = vi.fn();
const mockCreateInvitation = vi.fn();
const mockGetGalleryUrl = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('@/services/imageService', () => ({
  getImagesByProject: (...args: unknown[]) => mockGetImagesByProject(...args),
}));

vi.mock('@/services/invitationService', () => ({
  createInvitation: (...args: unknown[]) => mockCreateInvitation(...args),
  getGalleryUrl: (...args: unknown[]) => mockGetGalleryUrl(...args),
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
  usePathname: () => '/admin/projects/project-1/invitations/create',
  useParams: () => ({ projectId: 'project-1' }),
  useSearchParams: () => new URLSearchParams(),
}));

const sampleImages = [
  {
    id: 'image-1',
    projectId: 'project-1',
    url: 'https://example.com/img1.jpg',
    storagePath: 'x',
    title: '写真1',
    userId: 'admin-uid',
    likeCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

let CreateInvitationPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  mockGetImagesByProject.mockResolvedValue([]);
  mockGetGalleryUrl.mockReturnValue('http://localhost:3002/gallery/test-token');
  const mod = await import('../page');
  CreateInvitationPage = mod.default;
});

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider locale={jaJP}>
      <App>{ui}</App>
    </ConfigProvider>
  );
};

describe('CreateInvitationPage', () => {
  it('getImagesByProjectで当該プロジェクトの画像を取得する', async () => {
    renderWithProviders(<CreateInvitationPage />);

    await waitFor(() => {
      expect(mockGetImagesByProject).toHaveBeenCalledWith('project-1');
    });
  });

  it('画像選択グリッドを表示する', async () => {
    mockGetImagesByProject.mockResolvedValue(sampleImages);

    renderWithProviders(<CreateInvitationPage />);

    await waitFor(() => {
      const imgs = document.querySelectorAll('img');
      const thumbnails = Array.from(imgs).filter((img) =>
        img.src.includes('example.com/img1.jpg')
      );
      expect(thumbnails.length).toBeGreaterThan(0);
    });
  });

  it('createInvitationにprojectIdが渡される', async () => {
    mockGetImagesByProject.mockResolvedValue(sampleImages);
    mockCreateInvitation.mockResolvedValue({
      id: 'inv-1',
      token: 'test-token',
      projectId: 'project-1',
      clientName: 'テストクライアント',
      createdBy: 'admin-uid',
      imageIds: ['image-1'],
      expiresAt: new Date(),
      isActive: true,
      accessCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const user = userEvent.setup();
    renderWithProviders(<CreateInvitationPage />);

    // Wait for images to load
    await waitFor(() => {
      expect(mockGetImagesByProject).toHaveBeenCalled();
    });

    // Fill in client name
    await waitFor(() => {
      expect(screen.getByLabelText(/クライアント名/)).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/クライアント名/), 'テストクライアント');

    // Select an image
    await waitFor(() => {
      const imageCard = document.querySelector('[data-image-id="image-1"]');
      expect(imageCard).toBeTruthy();
    });
    const imageCard = document.querySelector('[data-image-id="image-1"]') as HTMLElement;
    await user.click(imageCard);

    // Submit form
    const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          clientName: 'テストクライアント',
          createdBy: 'admin-uid',
          imageIds: ['image-1'],
          expiresAt: expect.any(Date),
        })
      );
    });
  });

  it('成功後にギャラリーURLを表示する', async () => {
    mockGetImagesByProject.mockResolvedValue(sampleImages);
    mockCreateInvitation.mockResolvedValue({
      id: 'inv-1',
      token: 'test-token',
      projectId: 'project-1',
      clientName: 'テストクライアント',
      createdBy: 'admin-uid',
      imageIds: ['image-1'],
      expiresAt: new Date(),
      isActive: true,
      accessCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockGetGalleryUrl.mockReturnValue('http://localhost:3002/gallery/test-token');

    const user = userEvent.setup();
    renderWithProviders(<CreateInvitationPage />);

    // Wait for images to load
    await waitFor(() => {
      expect(mockGetImagesByProject).toHaveBeenCalled();
    });

    // Fill in client name
    await waitFor(() => {
      expect(screen.getByLabelText(/クライアント名/)).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/クライアント名/), 'テストクライアント');

    // Select an image
    await waitFor(() => {
      const imageCard = document.querySelector('[data-image-id="image-1"]');
      expect(imageCard).toBeTruthy();
    });
    const imageCard = document.querySelector('[data-image-id="image-1"]') as HTMLElement;
    await user.click(imageCard);

    // Submit form
    const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(submitBtn);

    // Verify gallery URL is displayed
    await waitFor(() => {
      expect(screen.getByDisplayValue('http://localhost:3002/gallery/test-token')).toBeInTheDocument();
    });
  });
});
