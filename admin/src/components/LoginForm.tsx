'use client';

import React from 'react';
import { Form, Input, Button, message } from 'antd';
import { useRouter } from 'next/navigation';
import API from '../lib/api';
import { saveToken, getUserRole } from '../lib/auth';

export default function LoginForm() {
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const res = await API.post('/auth/login', values);
      console.log('🔑 login response:', res);
      console.log('▶︎ accessToken:', res.data.accessToken);
      console.log('▶︎ refreshToken:', res.data.refreshToken);
      saveToken(res.data.accessToken);

      const role = getUserRole();
      console.log('▶︎ ユーザーロール:', role);
      if (role !== 'admin') {
        message.error('管理者権限が必要です');
        return;
      }

      router.push('/admin/dashboard');
    } catch (err: any) {
      console.error('ログイン失敗:', err);
      message.error(err.response?.data?.message || 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '100px auto' }}>
      <Form onFinish={onFinish} layout="vertical" component="form">
        <Form.Item name="email" label="Email" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="password" label="Password" rules={[{ required: true }]}>
          <Input.Password />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            ログイン
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}