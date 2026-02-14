'use client';

import { ProjectProvider } from '@/contexts/ProjectContext';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <ProjectProvider>{children}</ProjectProvider>;
}
