'use client';

import { useState } from 'react';
import {
  Form,
  Input,
  Button,
  DatePicker,
  message,
  Card,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { createProject } from '@/services/projectService';
import { useAuth } from '@/contexts/AuthContext';

const { TextArea } = Input;

interface ProjectFormValues {
  name: string;
  clientName: string;
  clientEmail?: string;
  shootingDate?: Date;
  shootingLocation?: string;
  description?: string;
}

export default function ProjectCreatePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: ProjectFormValues) => {
    if (!user) return;

    try {
      setLoading(true);
      const project = await createProject({
        name: values.name,
        clientName: values.clientName,
        clientEmail: values.clientEmail,
        shootingDate: values.shootingDate ? new Date(values.shootingDate) : undefined,
        shootingLocation: values.shootingLocation,
        description: values.description,
        createdBy: user.uid,
      });
      message.success('プロジェクトを作成しました');
      router.push(`/admin/projects/${project.id}`);
    } catch (error) {
      console.error('Failed to create project:', error);
      message.error('プロジェクトの作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push('/admin/dashboard')}
          style={{ color: 'var(--color-ink-muted)', padding: '4px 0' }}
        >
          プロジェクト一覧に戻る
        </Button>
      </div>

      <Card style={{ maxWidth: 640 }}>
        <h2
          style={{
            margin: '0 0 24px 0',
            fontSize: 20,
            fontWeight: 600,
            color: 'var(--color-ink)',
          }}
        >
          新規プロジェクト作成
        </h2>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark="optional"
        >
          <Form.Item
            label="プロジェクト名"
            name="name"
            rules={[{ required: true, message: 'プロジェクト名を入力してください' }]}
          >
            <Input placeholder="例: 田中様 結婚式" />
          </Form.Item>

          <Form.Item
            label="クライアント名"
            name="clientName"
            rules={[{ required: true, message: 'クライアント名を入力してください' }]}
          >
            <Input placeholder="例: 田中太郎" />
          </Form.Item>

          <Form.Item
            label="メールアドレス"
            name="clientEmail"
            rules={[{ type: 'email', message: '正しいメールアドレスを入力してください' }]}
          >
            <Input placeholder="例: tanaka@example.com" />
          </Form.Item>

          <Form.Item label="撮影日" name="shootingDate">
            <DatePicker style={{ width: '100%' }} placeholder="撮影日を選択" />
          </Form.Item>

          <Form.Item label="撮影場所" name="shootingLocation">
            <Input placeholder="例: 東京" />
          </Form.Item>

          <Form.Item label="説明" name="description">
            <TextArea rows={3} placeholder="プロジェクトの説明" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading}>
              作成
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
