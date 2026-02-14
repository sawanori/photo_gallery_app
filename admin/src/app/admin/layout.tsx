'use client';

import 'antd/dist/reset.css';
import { ReactNode, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { Layout, Menu, Button, Avatar, Tooltip } from 'antd';
import {
  AppstoreOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CameraOutlined,
} from '@ant-design/icons';

const { Sider, Content } = Layout;

const menuItems = [
  {
    key: '/admin/dashboard',
    icon: <AppstoreOutlined />,
    label: 'プロジェクト',
  },
  {
    key: '/admin/users',
    icon: <UserOutlined />,
    label: 'ユーザー',
  },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isAdmin, isLoading, user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--color-bg)',
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: '3px solid var(--color-border)',
          borderTopColor: 'var(--color-accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    router.replace('/');
    return null;
  }

  const selectedKey = menuItems.find((item) =>
    pathname === item.key || (item.key !== '/admin/dashboard' && pathname?.startsWith(item.key))
  )?.key || (pathname?.startsWith('/admin/projects') ? '/admin/dashboard' : '/admin/dashboard');

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/');
    } catch {
      // ignore
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={240}
        collapsedWidth={72}
        collapsed={collapsed}
        style={{
          background: 'var(--sidebar-bg)',
          borderRight: 'none',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Logo */}
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: collapsed ? '0 20px' : '0 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            cursor: 'pointer',
            transition: 'all 0.3s var(--ease-spring)',
          }}
          onClick={() => router.push('/admin/dashboard')}
        >
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #c9652e 0%, #e8a67a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <CameraOutlined style={{ color: '#fff', fontSize: 16 }} />
          </div>
          {!collapsed && (
            <span style={{
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
            }}>
              Photo Gallery
            </span>
          )}
        </div>

        {/* Menu */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => router.push(key)}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '12px 8px',
            flex: 1,
          }}
        />

        {/* Footer: user + collapse */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '12px',
        }}>
          {/* User */}
          <Tooltip title={collapsed ? (user?.email || '') : ''} placement="right">
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px',
              borderRadius: 8,
              marginBottom: 4,
            }}>
              <Avatar
                size={32}
                style={{
                  background: 'rgba(201, 101, 46, 0.2)',
                  color: 'var(--sidebar-active-ink)',
                  flexShrink: 0,
                }}
              >
                {user?.email?.[0]?.toUpperCase() || 'A'}
              </Avatar>
              {!collapsed && (
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <div style={{
                    color: 'var(--sidebar-ink)',
                    fontSize: 13,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {user?.email || 'Admin'}
                  </div>
                  <div style={{
                    color: 'var(--sidebar-ink-muted)',
                    fontSize: 11,
                  }}>
                    管理者
                  </div>
                </div>
              )}
              {!collapsed && (
                <Button
                  type="text"
                  size="small"
                  icon={<LogoutOutlined />}
                  onClick={handleLogout}
                  style={{
                    color: 'var(--sidebar-ink-muted)',
                    flexShrink: 0,
                  }}
                />
              )}
            </div>
          </Tooltip>

          {/* Collapse toggle */}
          <Button
            type="text"
            onClick={() => setCollapsed(!collapsed)}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            style={{
              width: '100%',
              color: 'var(--sidebar-ink-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
          >
            {!collapsed && <span style={{ fontSize: 12 }}>メニューを折りたたむ</span>}
          </Button>
        </div>
      </Sider>

      {/* Main Content */}
      <Layout style={{
        marginLeft: collapsed ? 72 : 240,
        transition: 'margin-left 0.3s var(--ease-spring)',
        background: 'var(--color-bg)',
        minHeight: '100vh',
      }}>
        <Content style={{
          padding: '32px 40px',
          maxWidth: 1200,
        }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
