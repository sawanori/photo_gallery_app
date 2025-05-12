'use client';  

import 'antd/dist/reset.css';
import { ReactNode, useEffect } from 'react';
import { getUserRole } from '../../lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    if (getUserRole() !== 'admin') router.replace('/');
  }, []);
  return (
    <div style={{ padding: '20px' }}>
      <nav style={{ marginBottom: '20px' }}>
        <Link href="/admin/dashboard" style={{ marginRight: '20px' }}>ダッシュボード</Link>
        <Link href="/admin/images" style={{ marginRight: '20px' }}>画像管理</Link>
        <Link href="/admin/users">ユーザー管理</Link>
      </nav>
      {children}
    </div>
  );
}
