'use client';

import dynamic from 'next/dynamic';

export default function LoginFormLoader() {
  const LoginForm = dynamic(() => import('./LoginForm'), {
    ssr: false,
    loading: () => <p>Loading…</p>,
  });

  return <LoginForm />;
} 