import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

const mockGetProject = vi.fn();

vi.mock('@/services/projectService', () => ({
  getProject: (...args: unknown[]) => mockGetProject(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/projects/project-1',
  useParams: () => ({ projectId: 'project-1' }),
  useSearchParams: () => new URLSearchParams(),
}));

let ProjectProvider: React.ComponentType<{ children: React.ReactNode }>;
let useProject: () => { project: unknown; isLoading: boolean };

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../ProjectContext');
  ProjectProvider = mod.ProjectProvider;
  useProject = mod.useProject;
});

function TestConsumer() {
  const { project, isLoading } = useProject();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <span data-testid="project-name">{(project as any)?.name || 'none'}</span>
    </div>
  );
}

describe('ProjectContext', () => {
  it('projectIdからプロジェクトデータを取得して提供する', async () => {
    mockGetProject.mockResolvedValue({
      id: 'project-1',
      name: '田中様 結婚式',
      clientName: '田中太郎',
      status: 'active',
      imageCount: 5,
    });

    const { getByTestId } = render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>
    );

    await waitFor(() => {
      expect(getByTestId('project-name').textContent).toBe('田中様 結婚式');
    });
  });

  it('ローディング中はisLoading=trueを返す', async () => {
    mockGetProject.mockReturnValue(new Promise(() => {})); // never resolves

    const { getByTestId } = render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>
    );

    expect(getByTestId('loading').textContent).toBe('true');
  });

  it('存在しないprojectIdでproject=nullを返す', async () => {
    mockGetProject.mockResolvedValue(null);

    const { getByTestId } = render(
      <ProjectProvider>
        <TestConsumer />
      </ProjectProvider>
    );

    await waitFor(() => {
      expect(getByTestId('loading').textContent).toBe('false');
      expect(getByTestId('project-name').textContent).toBe('none');
    });
  });
});
