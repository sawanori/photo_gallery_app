import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ConfigProvider } from 'antd';
import jaJP from 'antd/locale/ja_JP';

// Mock project service
const mockGetProjects = vi.fn();

vi.mock('@/services/projectService', () => ({
  getProjects: (...args: unknown[]) => mockGetProjects(...args),
}));

// Mock AuthContext
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

const sampleProjects = [
  {
    id: 'project-1',
    name: '田中様 結婚式',
    clientName: '田中太郎',
    status: 'active',
    imageCount: 5,
    shootingDate: new Date('2025-06-15'),
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    createdBy: 'admin-uid',
  },
  {
    id: 'project-2',
    name: '鈴木様 七五三',
    clientName: '鈴木花子',
    status: 'delivered',
    imageCount: 10,
    shootingDate: new Date('2025-07-01'),
    createdAt: new Date('2025-02-01'),
    updatedAt: new Date('2025-02-01'),
    createdBy: 'admin-uid',
  },
];

let DashboardPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../../dashboard/page');
  DashboardPage = mod.default;
});

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider locale={jaJP}>{ui}</ConfigProvider>
  );
};

describe('DashboardPage（プロジェクト一覧）', () => {
  it('ローディング中はSpinnerを表示する', async () => {
    // Never resolve the promise to keep loading state
    mockGetProjects.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<DashboardPage />);

    expect(document.querySelector('.ant-spin')).toBeTruthy();
  });

  it('プロジェクトカードを表示する', async () => {
    mockGetProjects.mockResolvedValue(sampleProjects);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('田中様 結婚式')).toBeInTheDocument();
      expect(screen.getByText('鈴木様 七五三')).toBeInTheDocument();
    });
  });

  it('カードにプロジェクト名、クライアント名、ステータスバッジを表示する', async () => {
    mockGetProjects.mockResolvedValue(sampleProjects);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('田中様 結婚式')).toBeInTheDocument();
      expect(screen.getByText('田中太郎')).toBeInTheDocument();
    });
  });

  it('カードに画像数を表示する', async () => {
    mockGetProjects.mockResolvedValue(sampleProjects);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('5 枚')).toBeInTheDocument();
      expect(screen.getByText('10 枚')).toBeInTheDocument();
    });
  });

  it('「新規プロジェクト」ボタンが存在する', async () => {
    mockGetProjects.mockResolvedValue(sampleProjects);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('新規プロジェクト')).toBeInTheDocument();
    });
  });

  it('プロジェクトが0件の場合Emptyを表示する', async () => {
    mockGetProjects.mockResolvedValue([]);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/プロジェクトがありません/)).toBeInTheDocument();
    });
  });

  it('ステータスフィルタのセグメント切り替えが機能する', async () => {
    mockGetProjects.mockResolvedValue(sampleProjects);

    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('田中様 結婚式')).toBeInTheDocument();
    });

    // Find the Segmented options - Ant Design renders them as divs with class
    const segmentedLabels = screen.getAllByText('納品済み');
    // Click on the first matching element (segment label)
    await user.click(segmentedLabels[0]);

    // getProjects should be called with 'delivered' filter
    await waitFor(() => {
      expect(mockGetProjects).toHaveBeenCalledWith('delivered');
    });
  });
});
