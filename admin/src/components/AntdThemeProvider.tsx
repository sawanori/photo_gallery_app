'use client';

import { ConfigProvider } from 'antd';
import jaJP from 'antd/locale/ja_JP';
import { ReactNode } from 'react';

export function AntdThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={jaJP}
      theme={{
        token: {
          colorPrimary: '#c9652e',
          colorBgContainer: '#ffffff',
          colorBgLayout: '#faf8f5',
          colorBorder: '#e8e4df',
          colorBorderSecondary: '#f0ece7',
          colorText: '#2d2a26',
          colorTextSecondary: '#6b6560',
          colorTextTertiary: '#a39e98',
          colorSuccess: '#5a9a6e',
          colorWarning: '#d4943a',
          colorError: '#c45454',
          colorInfo: '#5a84a9',
          borderRadius: 8,
          borderRadiusLG: 12,
          fontFamily: "'Outfit', sans-serif",
          fontSize: 14,
          controlHeight: 40,
          boxShadow: '0 1px 2px rgba(45, 42, 38, 0.04)',
          boxShadowSecondary: '0 4px 12px rgba(45, 42, 38, 0.06)',
        },
        components: {
          Card: {
            borderRadiusLG: 16,
            boxShadowTertiary: '0 1px 2px rgba(45, 42, 38, 0.04)',
          },
          Button: {
            borderRadius: 8,
            controlHeight: 40,
            fontWeight: 500,
          },
          Table: {
            borderRadiusLG: 16,
            headerBg: '#faf8f5',
            headerColor: '#6b6560',
          },
          Menu: {
            darkItemBg: 'transparent',
            darkSubMenuItemBg: 'transparent',
          },
          Input: {
            controlHeight: 44,
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
