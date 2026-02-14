'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input, DatePicker, Form, Empty, Spin, App } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';
import { getImagesByProject, Image } from '@/services/imageService';
import { createInvitation, getGalleryUrl, Invitation } from '@/services/invitationService';
import { useAuth } from '@/contexts/AuthContext';
import dayjs from 'dayjs';

export default function CreateInvitationPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId as string;
  const { user } = useAuth();
  const { message } = App.useApp();

  const [form] = Form.useForm();
  const [images, setImages] = useState<Image[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [createdInvitation, setCreatedInvitation] = useState<Invitation | null>(null);
  const [galleryUrl, setGalleryUrl] = useState<string>('');

  useEffect(() => {
    if (projectId) {
      loadImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadImages = async () => {
    try {
      setLoading(true);
      const imgs = await getImagesByProject(projectId);
      setImages(imgs);
    } catch (error) {
      console.error('Failed to load images:', error);
      message.error('画像の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const toggleImageSelection = (imageId: string) => {
    setSelectedImageIds((prev) =>
      prev.includes(imageId)
        ? prev.filter((id) => id !== imageId)
        : [...prev, imageId]
    );
  };

  const handleSubmit = async (values: { clientName: string; clientEmail?: string; expiresAt?: dayjs.Dayjs }) => {
    if (!user) return;

    if (selectedImageIds.length === 0) {
      message.warning('画像を選択してください');
      return;
    }

    try {
      setSubmitting(true);
      const expiresAt = values.expiresAt
        ? values.expiresAt.toDate()
        : dayjs().add(30, 'day').toDate();

      const invitation = await createInvitation({
        projectId,
        clientName: values.clientName,
        clientEmail: values.clientEmail,
        createdBy: user.uid,
        imageIds: selectedImageIds,
        expiresAt,
      });

      const url = getGalleryUrl(invitation.token);
      setGalleryUrl(url);
      setCreatedInvitation(invitation);
      message.success('招待を作成しました');
    } catch (error) {
      console.error('Failed to create invitation:', error);
      message.error('招待の作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(galleryUrl).then(() => {
      message.success('URLをコピーしました');
    }).catch(() => {
      message.error('コピーに失敗しました');
    });
  };

  if (loading) {
    return (
      <div className="admin-spinner">
        <Spin size="large" />
      </div>
    );
  }

  // Success state: show gallery URL
  if (createdInvitation) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => router.push(`/admin/projects/${projectId}`)}
            style={{ color: 'var(--color-ink-muted)', padding: '4px 0' }}
          >
            戻る
          </Button>
        </div>

        <Card style={{ maxWidth: 640 }}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircleOutlined
              style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }}
            />
            <h2
              style={{
                margin: '0 0 8px 0',
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--color-ink)',
              }}
            >
              招待を作成しました
            </h2>
            <p style={{ color: 'var(--color-ink-muted)', marginBottom: 24 }}>
              以下のURLをクライアントに共有してください
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#f5f5f5',
                padding: '12px 16px',
                borderRadius: 8,
                marginBottom: 24,
              }}
            >
              <Input
                value={galleryUrl}
                readOnly
                style={{ flex: 1 }}
              />
              <Button
                icon={<CopyOutlined />}
                onClick={handleCopyUrl}
              >
                コピー
              </Button>
            </div>

            <Button
              type="primary"
              onClick={() => router.push(`/admin/projects/${projectId}`)}
            >
              プロジェクトに戻る
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push(`/admin/projects/${projectId}`)}
          style={{ color: 'var(--color-ink-muted)', padding: '4px 0' }}
        >
          戻る
        </Button>
      </div>

      <h2
        style={{
          margin: '0 0 24px 0',
          fontSize: 20,
          fontWeight: 600,
          color: 'var(--color-ink)',
        }}
      >
        招待作成
      </h2>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Left: Form */}
        <Card style={{ flex: 1, minWidth: 300 }}>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            requiredMark="optional"
            initialValues={{
              expiresAt: dayjs().add(30, 'day'),
            }}
          >
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
            >
              <Input type="email" placeholder="例: tanaka@example.com" />
            </Form.Item>

            <Form.Item
              label="有効期限"
              name="expiresAt"
            >
              <DatePicker
                style={{ width: '100%' }}
                placeholder="有効期限を選択"
                format="YYYY/MM/DD"
              />
            </Form.Item>

            <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--color-ink-muted)' }}>
              選択中の画像: {selectedImageIds.length} 枚
            </div>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                disabled={selectedImageIds.length === 0}
              >
                招待を作成
              </Button>
            </Form.Item>
          </Form>
        </Card>

        {/* Right: Image selection grid */}
        <Card style={{ flex: 2, minWidth: 400 }}>
          <h3
            style={{
              margin: '0 0 16px 0',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--color-ink)',
            }}
          >
            画像を選択
          </h3>

          {images.length === 0 ? (
            <Empty description="画像がありません" />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: 12,
              }}
            >
              {images.map((img) => {
                const isSelected = selectedImageIds.includes(img.id);
                return (
                  <div
                    key={img.id}
                    data-image-id={img.id}
                    onClick={() => toggleImageSelection(img.id)}
                    style={{
                      cursor: 'pointer',
                      border: isSelected ? '3px solid #1677ff' : '3px solid transparent',
                      borderRadius: 8,
                      overflow: 'hidden',
                      position: 'relative',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <img
                      src={img.url}
                      alt={img.title}
                      style={{
                        width: '100%',
                        height: 100,
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                    {isSelected && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          background: '#1677ff',
                          borderRadius: '50%',
                          width: 20,
                          height: 20,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 12,
                        }}
                      >
                        <CheckCircleOutlined />
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--color-ink-secondary)',
                        padding: '4px 4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {img.title}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
