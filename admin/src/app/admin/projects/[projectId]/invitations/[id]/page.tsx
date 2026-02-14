'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  Tag,
  Empty,
  Spin,
  Button,
  Switch,
  Descriptions,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CopyOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';
import { getInvitation, updateInvitation, getGalleryUrl, Invitation } from '@/services/invitationService';
import dayjs from 'dayjs';
import 'dayjs/locale/ja';

dayjs.locale('ja');

export default function InvitationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId as string;
  const invitationId = params?.id as string;

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (invitationId) {
      loadInvitation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitationId]);

  const loadInvitation = async () => {
    try {
      setLoading(true);
      const inv = await getInvitation(invitationId);
      setInvitation(inv);
    } catch (error) {
      console.error('Failed to load invitation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (checked: boolean) => {
    if (!invitation) return;
    try {
      setToggling(true);
      await updateInvitation(invitation.id, { isActive: checked });
      setInvitation({ ...invitation, isActive: checked });
    } catch (error) {
      console.error('Failed to update invitation:', error);
      message.error('招待の更新に失敗しました');
    } finally {
      setToggling(false);
    }
  };

  const handleCopyUrl = () => {
    if (!invitation) return;
    const url = getGalleryUrl(invitation.token);
    navigator.clipboard.writeText(url);
    message.success('URLをコピーしました');
  };

  if (loading) {
    return (
      <div className="admin-spinner">
        <Spin size="large" />
      </div>
    );
  }

  if (!invitation) {
    return (
      <Empty description="招待が見つかりません">
        <Button onClick={() => router.push(`/admin/projects/${projectId}`)}>
          プロジェクトに戻る
        </Button>
      </Empty>
    );
  }

  const getStatus = () => {
    if (!invitation.isActive) return { label: '無効', color: 'default' as const };
    if (new Date(invitation.expiresAt) < new Date()) return { label: '期限切れ', color: 'error' as const };
    return { label: '有効', color: 'success' as const };
  };

  const status = getStatus();
  const galleryUrl = getGalleryUrl(invitation.token);

  return (
    <div>
      {/* Back button */}
      <div style={{ marginBottom: 16 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push(`/admin/projects/${projectId}`)}
          style={{ color: 'var(--color-ink-muted)', padding: '4px 0' }}
        >
          プロジェクトに戻る
        </Button>
      </div>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--color-ink)',
              letterSpacing: '-0.02em',
            }}
          >
            招待詳細
          </h2>
          <Tag color={status.color}>{status.label}</Tag>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>有効</span>
          <Switch
            checked={invitation.isActive}
            onChange={handleToggleActive}
            loading={toggling}
          />
        </div>
      </div>

      {/* Invitation Details */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="クライアント名">
            {invitation.clientName}
          </Descriptions.Item>
          {invitation.clientEmail && (
            <Descriptions.Item label="メール">
              {invitation.clientEmail}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="画像数">
            {invitation.imageIds.length} 枚
          </Descriptions.Item>
          <Descriptions.Item label="アクセス数">
            {invitation.accessCount} 回
          </Descriptions.Item>
          <Descriptions.Item label="有効期限">
            {dayjs(invitation.expiresAt).format('YYYY年MM月DD日')}
          </Descriptions.Item>
          <Descriptions.Item label="作成日">
            {dayjs(invitation.createdAt).format('YYYY年MM月DD日')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Gallery URL */}
      <Card
        title={
          <span>
            <LinkOutlined /> ギャラリーURL
          </span>
        }
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--color-bg-secondary, #f5f5f5)',
            padding: '8px 12px',
            borderRadius: 6,
          }}
        >
          <span
            style={{
              flex: 1,
              fontSize: 13,
              wordBreak: 'break-all',
              color: 'var(--color-ink-secondary, #595959)',
            }}
          >
            {galleryUrl}
          </span>
          <Button
            type="text"
            icon={<CopyOutlined />}
            onClick={handleCopyUrl}
            size="small"
          >
            コピー
          </Button>
        </div>
      </Card>
    </div>
  );
}
