'use client';

import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getProject, Project } from '@/services/projectService';

interface ProjectContextType {
  project: Project | null;
  isLoading: boolean;
  /** 取り直しを予約する。完了は待たない（待つ必要のある呼び出し元が無い）。 */
  reload: () => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

/** 取得済みの結果。**どの projectId のものか**を一緒に持つ。 */
interface LoadedProject {
  projectId: string;
  project: Project | null;
}

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const params = useParams();
  const projectId = params?.projectId as string | undefined;
  const [loaded, setLoaded] = useState<LoadedProject | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!projectId) return;

    // 画面を離れた後に setState しない。projectId を切り替えたときに
    // 前の取得が後から返って古いプロジェクトを表示するのも防ぐ。
    let cancelled = false;

    void (async () => {
      try {
        const result = await getProject(projectId);
        if (!cancelled) setLoaded({ projectId, project: result });
      } catch (error) {
        console.error('Failed to load project:', error);
        if (!cancelled) setLoaded({ projectId, project: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);

  const reload = useCallback(() => {
    setLoaded(null);
    setReloadKey((key) => key + 1);
  }, []);

  // 読み込み中かどうかは**状態から導出する**。effect の中で同期的に
  // setIsLoading(true) を呼ぶと描画が余分に走る（react-hooks/set-state-in-effect）。
  const isCurrent = loaded !== null && loaded.projectId === projectId;

  return (
    <ProjectContext.Provider
      value={{
        project: isCurrent ? loaded.project : null,
        isLoading: Boolean(projectId) && !isCurrent,
        reload,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
