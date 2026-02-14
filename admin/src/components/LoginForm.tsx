'use client';

import React from 'react';
import { Form, Input, Button, message } from 'antd';
import { useRouter } from 'next/navigation';
import { signIn } from '../services/authService';

export default function LoginForm() {
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      await signIn(values.email, values.password);
      router.push('/admin/dashboard');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'ログインに失敗しました';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '100px auto' }}>
      <Form onFinish={onFinish} layout="vertical" component="form">
        <Form.Item name="email" label="Email" rules={[{ required: true }]}>
          <Input placeholder="admin@example.com" />
        </Form.Item>
        <Form.Item name="password" label="Password" rules={[{ required: true }]}>
          <Input.Password placeholder="パスワード" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            サインイン
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
