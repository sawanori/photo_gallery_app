import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import jaJP from 'antd/locale/ja_JP';
import { vi } from 'vitest';

// AuthContext のモック値型
interface MockAuthValue {
  user: { uid: string; email: string } | null;
  profile: { id: string; email: string; role: 'admin' | 'user' } | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  login: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logout: (...args: any[]) => any;
}

const defaultAuthValue: MockAuthValue = {
  user: { uid: 'admin-uid', email: 'admin@test.com' },
  profile: { id: 'admin-uid', email: 'admin@test.com', role: 'admin' as const },
  isLoading: false,
  isAuthenticated: true,
  isAdmin: true,
  login: vi.fn(),
  logout: vi.fn(),
};

// AuthContextをモックするためのコンテキスト
const MockAuthContext = React.createContext<MockAuthValue>(defaultAuthValue);

export const MockAuthProvider: React.FC<{
  value?: Partial<MockAuthValue>;
  children: React.ReactNode;
}> = ({ value, children }) => {
  const mergedValue = { ...defaultAuthValue, ...value };
  return <MockAuthContext.Provider value={mergedValue}>{children}</MockAuthContext.Provider>;
};

export const useMockAuth = () => React.useContext(MockAuthContext);

// 全プロバイダーでラップしてレンダリング
export function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderOptions & { authValue?: Partial<MockAuthValue> }
) {
  const { authValue, ...renderOptions } = options || {};

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ConfigProvider locale={jaJP}>
        <MockAuthProvider value={authValue}>{children}</MockAuthProvider>
      </ConfigProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export { defaultAuthValue };
