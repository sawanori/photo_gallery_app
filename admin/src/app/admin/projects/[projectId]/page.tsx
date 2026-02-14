'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  Tag,
  Empty,
  Spin,
  Button,
  Tabs,
  Image,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  PictureOutlined,
  LinkOutlined,
  UserOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';
import { getProject, Project, ProjectStatus } from '@/services/projectService';
import { getImagesByProject, Image as ImageType } from '@/services/imageService';
import { getInvitationsByProject, Invitation } from '@/services/invitationService';
import dayjs from 'dayjs';
import 'dayjs/locale/ja';

dayjs.locale('ja');

const statusConfig: Record<ProjectStatus, { label: string; color: string }> = {
  active: { label: '進行中', color: 'processing' },
  delivered: { label: '納品済み', color: 'success' },
  archived: { label: 'アーカイブ', color: 'default' },
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [images, setImages] = useState<ImageType[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [proj, imgs, invs] = await Promise.all([
        getProject(projectId),
        getImagesByProject(projectId),
        getInvitationsByProject(projectId),
      ]);
      setProject(proj);
      setImages(imgs);
      setInvitations(invs);
    } catch (error) {
      console.error('Failed to load project data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-spinner">
        <Spin size="large" />
      </div>
    );
  }

  if (!project) {
    return (
      <Empty description="プロジェクトが見つかりません">
        <Button onClick={() => router.push('/admin/dashboard')}>
          プロジェクト一覧に戻る
        </Button>
      </Empty>
    );
  }

  const getInvitationStatus = (inv: Invitation) => {
    if (!inv.isActive) return { label: '無効', color: 'default' as const };
    if (new Date(inv.expiresAt) < new Date()) return { label: '期限切れ', color: 'error' as const };
    return { label: '有効', color: 'success' as const };
  };

  const imagesContent = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ color: 'var(--color-ink-muted)', fontSize: 13 }}>
          {images.length} 枚の画像
        </span>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => router.push(`/admin/projects/${projectId}/images/upload`)}
        >
          アップロード
        </Button>
      </div>
      {images.length === 0 ? (
        <Empty description="画像がありません">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push(`/admin/projects/${projectId}/images/upload`)}
          >
            最初の画像をアップロード
          </Button>
        </Empty>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          {images.map((img) => (
            <div key={img.id} style={{ textAlign: 'center' }}>
              <Image
                src={img.url}
                alt={img.title}
                width="100%"
                height={120}
                style={{ objectFit: 'cover', borderRadius: 8 }}
                fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
              />
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-ink-secondary)',
                  marginTop: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {img.title}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const invitationsContent = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ color: 'var(--color-ink-muted)', fontSize: 13 }}>
          {invitations.length} 件の招待
        </span>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => router.push(`/admin/projects/${projectId}/invitations/create`)}
        >
          招待作成
        </Button>
      </div>
      {invitations.length === 0 ? (
        <Empty description="招待がありません">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push(`/admin/projects/${projectId}/invitations/create`)}
          >
            最初の招待を作成
          </Button>
        </Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {invitations.map((inv) => {
            const status = getInvitationStatus(inv);
            return (
              <Card
                key={inv.id}
                size="small"
                hoverable
                onClick={() => router.push(`/admin/projects/${projectId}/invitations/${inv.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>
                      {inv.token}
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--color-ink-muted)' }}>
                      <span><PictureOutlined /> {inv.imageIds.length} 枚</span>
                      <span><EyeOutlined /> {inv.accessCount} 回</span>
                      <span>{dayjs(inv.expiresAt).format('YYYY/MM/DD')} まで</span>
                    </div>
                  </div>
                  <Tag color={status.color}>{status.label}</Tag>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* Back button */}
      <div style={{ marginBottom: 16 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push('/admin/dashboard')}
          style={{ color: 'var(--color-ink-muted)', padding: '4px 0' }}
        >
          プロジェクト一覧に戻る
        </Button>
      </div>

      {/* Project Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--color-ink)',
                letterSpacing: '-0.02em',
              }}
            >
              {project.name}
            </h2>
            <Tag color={statusConfig[project.status].color}>
              {statusConfig[project.status].label}
            </Tag>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--color-ink-muted)',
              fontSize: 14,
            }}
          >
            <UserOutlined />
            <span>{project.clientName}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        defaultActiveKey="images"
        items={[
          {
            key: 'images',
            label: (
              <span>
                <PictureOutlined /> 画像 ({images.length})
              </span>
            ),
            children: imagesContent,
          },
          {
            key: 'invitations',
            label: (
              <span>
                <LinkOutlined /> 招待 ({invitations.length})
              </span>
            ),
            children: invitationsContent,
          },
        ]}
      />
    </div>
  );
}
