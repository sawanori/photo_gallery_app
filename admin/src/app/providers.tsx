'use client';

import { ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { AntdThemeProvider } from '../components/AntdThemeProvider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AntdThemeProvider>
        {children}
      </AntdThemeProvider>
    </AuthProvider>
  );
}
