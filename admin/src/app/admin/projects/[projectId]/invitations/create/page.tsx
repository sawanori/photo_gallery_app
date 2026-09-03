'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Card, Input, InputNumber, DatePicker, Form, Empty, Spin, App } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';
import { getImagesByProject, Image } from '@/services/imageService';
import { createInvitation, getGalleryUrl, Invitation } from '@/services/invitationService';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_VIEWING_DAYS } from '@/utils/viewingWindow';
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
  // NEXT_PUBLIC_WEB_URL が未設定で URL を作れなかったときの文言。
  const [galleryUrlError, setGalleryUrlError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    void (async () => {
      try {
        const imgs = await getImagesByProject(projectId);
        if (!cancelled) setImages(imgs);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load images:', error);
        message.error('画像の取得に失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, message]);

  const toggleImageSelection = (imageId: string) => {
    setSelectedImageIds((prev) =>
      prev.includes(imageId)
        ? prev.filter((id) => id !== imageId)
        : [...prev, imageId]
    );
  };

  const handleSubmit = async (values: {
    clientName: string;
    clientEmail?: string;
    expiresAt?: dayjs.Dayjs;
    viewingDays?: number;
  }) => {
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
        viewingDays: values.viewingDays,
      });

      // 招待は既に作られている。URL を組み立てられなくても「作成失敗」にはしない。
      setCreatedInvitation(invitation);
      message.success('招待を作成しました');

      try {
        setGalleryUrl(getGalleryUrl(invitation.token));
        setGalleryUrlError(null);
      } catch (error) {
        console.error('Failed to build gallery url:', error);
        setGalleryUrl('');
        setGalleryUrlError(
          error instanceof Error ? error.message : 'ギャラリーの URL を作れません。'
        );
      }
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

            {galleryUrlError ? (
              <Alert
                type="error"
                showIcon
                message="ギャラリーのURLを作れませんでした"
                description={galleryUrlError}
                style={{ marginBottom: 24, textAlign: 'left' }}
              />
            ) : (
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
            )}

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
              // 既定は web 側の DEFAULT_VIEWING_DAYS に合わせる。
              // ここを変えるなら web/src/utils/viewingWindow.ts も見ること。
              viewingDays: DEFAULT_VIEWING_DAYS,
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

            {/*
              閲覧日数は expiresAt とは別物で、**クライアントが実際に見られなくなるのは
              こちら**（web の validateInvitation が「作成から N 日」で判定する）。
              以前は管理画面から設定できず、常に既定の7日が適用されていたため、
              「有効期限 10月31日」と表示しながら7日で見られなくなっていた。
            */}
            <Form.Item
              label="閲覧できる日数"
              name="viewingDays"
              tooltip="クライアントがギャラリーを開ける日数です。作成日から数えます。"
              rules={[{ required: true, message: '閲覧できる日数を入力してください' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                max={365}
                precision={0}
                addonAfter="日"
              />
            </Form.Item>

            <Form.Item
              label="失効日（システム上）"
              name="expiresAt"
              tooltip="この日を過ぎると Firestore 側でも拒否されます。通常は閲覧できる日数より後ろに置きます。"
            >
              <DatePicker
                style={{ width: '100%' }}
                placeholder="失効日を選択"
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--color-ink)',
              }}
            >
              画像を選択
            </h3>
            {images.length > 0 && (
              <Button
                size="small"
                onClick={() =>
                  setSelectedImageIds(
                    selectedImageIds.length === images.length
                      ? []
                      : images.map((img) => img.id)
                  )
                }
              >
                {selectedImageIds.length === images.length ? '全解除' : '全選択'}
              </Button>
            )}
          </div>

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
                    {/* 一覧に原本（3〜4MB）を並べない。384px の WebP サムネイルを使う。 */}
                    <img
                      src={img.thumbnails?.small ?? img.url}
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
