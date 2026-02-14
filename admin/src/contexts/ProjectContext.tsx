'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getProject, Project } from '@/services/projectService';

interface ProjectContextType {
  project: Project | null;
  isLoading: boolean;
  reload: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const params = useParams();
  const projectId = params?.projectId as string | undefined;
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProject = async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const result = await getProject(projectId);
      setProject(result);
    } catch (error) {
      console.error('Failed to load project:', error);
      setProject(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <ProjectContext.Provider value={{ project, isLoading, reload: loadProject }}>
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
