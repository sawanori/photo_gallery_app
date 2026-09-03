'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  Tag,
  Empty,
  Spin,
  Button,
  Tabs,
  Image,
  App,
  Alert,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  PictureOutlined,
  LinkOutlined,
  UserOutlined,
  EyeOutlined,
  DeleteOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';
import { getProject, deleteProject, getProjectExpiryInfo, Project, ProjectStatus } from '@/services/projectService';
import {
  getImagesByProject,
  deleteImage,
  type DeleteImagesResult,
  Image as ImageType,
} from '@/services/imageService';
import { getInvitationsByProject, Invitation } from '@/services/invitationService';
import { effectiveDeadline } from '@/utils/viewingWindow';
import dayjs from 'dayjs';
import 'dayjs/locale/ja';

dayjs.locale('ja');

const statusConfig: Record<ProjectStatus, { label: string; color: string }> = {
  active: { label: '進行中', color: 'processing' },
  delivered: { label: '納品済み', color: 'success' },
  archived: { label: 'アーカイブ', color: 'default' },
};

/**
 * Storage の削除に消し残しがあったときの文言。
 * 「削除しました」で終わらせると、課金され続けるファイルに誰も気付かない。
 */
const storageFailureMessage = (result: DeleteImagesResult): string =>
  `Storage の削除に失敗した画像が ${result.failed.length} 件あります。再実行してください。`;

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId as string;
  const { modal, message } = App.useApp();

  const [project, setProject] = useState<Project | null>(null);
  const [images, setImages] = useState<ImageType[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // 取り直しの合図。値そのものに意味は無く、effect を走らせるためだけに使う。
  const [reloadKey, setReloadKey] = useState(0);

  /**
   * 取り直しを予約する。`setLoading(true)` は**イベント側で**行う。
   * effect の中で同期的に呼ぶと描画が余分に走る（react-hooks/set-state-in-effect）。
   */
  const reload = useCallback(() => {
    setLoading(true);
    setLoadFailed(false);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    void (async () => {
      try {
        const [proj, imgs, invs] = await Promise.all([
          getProject(projectId),
          getImagesByProject(projectId),
          getInvitationsByProject(projectId),
        ]);
        if (cancelled) return;
        setProject(proj);
        setImages(imgs);
        setInvitations(invs);
        setLoadFailed(false);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load project data:', error);
        // 読み込み失敗を「見つかりません」と混同させない。別の表示にする。
        setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);

  if (loading) {
    return (
      <div className="admin-spinner">
        <Spin size="large" />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <Alert
        type="error"
        showIcon
        message="プロジェクトの読み込みに失敗しました"
        description="通信状況を確認して再試行してください。"
        action={
          <Button size="small" icon={<ReloadOutlined />} onClick={reload}>
            再試行
          </Button>
        }
      />
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

  const handleDeleteProject = () => {
    modal.confirm({
      title: 'プロジェクトを削除しますか？',
      content: `プロジェクト「${project.name}」を削除します。画像 ${images.length} 枚、招待リンク ${invitations.length} 件も同時に削除されます。この操作は取り消せません。`,
      okText: '削除',
      okType: 'danger',
      cancelText: 'キャンセル',
      onOk: async () => {
        const key = 'delete-project';
        try {
          message.open({ key, type: 'loading', content: '削除しています…', duration: 0 });
          const result = await deleteProject(projectId, ({ completed, total }) => {
            message.open({
              key,
              type: 'loading',
              content: `削除しています… ${completed} / ${total} 枚`,
              duration: 0,
            });
          });
          // 失敗経路でも必ず閉じる。閉じないと duration: 0 の表示が残り続ける。
          message.destroy(key);
          if (result.failed.length > 0) {
            // プロジェクトは消えていない（サービス層が残している）。
            // 一覧に飛ばさず、この画面で取り直させる。
            message.warning(storageFailureMessage(result));
            reload();
            return;
          }
          message.success('プロジェクトを削除しました');
          router.push('/admin/dashboard');
        } catch (error) {
          message.destroy(key);
          console.error('Failed to delete project:', error);
          message.error('プロジェクトの削除に失敗しました');
        }
      },
    });
  };

  /**
   * クライアントが実際に見られなくなる日。
   *
   * `expiresAt` だけで判定していたため、閲覧期限（作成から viewingDays 日）が
   * 切れた招待が一覧で「有効」と表示されていた。招待詳細は既に
   * effectiveDeadline を使っており、同じ招待で表示が食い違っていた。
   */
  const invitationDeadline = (inv: Invitation) =>
    effectiveDeadline(inv.createdAt, inv.viewingDays, inv.expiresAt);

  const getInvitationStatus = (inv: Invitation) => {
    if (!inv.isActive) return { label: '無効', color: 'default' as const };
    const deadline = invitationDeadline(inv);
    if (deadline && deadline < new Date()) {
      return { label: '期限切れ', color: 'error' as const };
    }
    return { label: '有効', color: 'success' as const };
  };

  const handleDeleteImage = (img: ImageType) => {
    modal.confirm({
      title: '画像を削除しますか？',
      content: `「${img.title}」を削除します。この操作は取り消せません。`,
      okText: '削除',
      okType: 'danger',
      cancelText: 'キャンセル',
      onOk: async () => {
        try {
          const result = await deleteImage(img.id);
          if (result.failed.length > 0) {
            // 画像ドキュメントは残っている。一覧からも消さない。
            message.warning(storageFailureMessage(result));
            return;
          }
          message.success('画像を削除しました');
          const updatedImages = images.filter((i) => i.id !== img.id);
          setImages(updatedImages);
          // サービス層で招待のimageIdsは更新済み、UIに反映
          const updatedInvitations = await getInvitationsByProject(projectId);
          setInvitations(updatedInvitations);
        } catch (error) {
          console.error('Failed to delete image:', error);
          message.error('画像の削除に失敗しました');
        }
      },
    });
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
            <div key={img.id} style={{ position: 'relative' }}>
              {/* 一覧に原本（3〜4MB）を並べない。384px の WebP サムネイルを使う。 */}
              <Image
                src={img.thumbnails?.small ?? img.url}
                alt={img.title}
                width="100%"
                height={120}
                style={{ objectFit: 'cover', borderRadius: 8 }}
                fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
              />
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                // アイコンだけのボタンには名前が要る（読み上げにも、テストにも）
                aria-label={`${img.title} を削除`}
                onClick={() => handleDeleteImage(img)}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  background: 'rgba(255,255,255,0.85)',
                  borderRadius: 6,
                  minWidth: 24,
                  height: 24,
                  padding: 0,
                }}
              />
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-ink-secondary)',
                  marginTop: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
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
            const deadline = invitationDeadline(inv);
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
                      <span>
                        {deadline ? `${dayjs(deadline).format('YYYY/MM/DD')} まで` : '—'}
                      </span>
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
        <Button
          danger
          icon={<DeleteOutlined />}
          onClick={handleDeleteProject}
        >
          削除
        </Button>
      </div>

      {/* Expiry Warning */}
      {(() => {
        const expiryInfo = getProjectExpiryInfo(project);
        if (!expiryInfo) return null;
        if (expiryInfo.level === 'expired') {
          return <Alert type="error" showIcon message="このプロジェクトは期限切れです。" style={{ marginBottom: 16 }} />;
        }
        return (
          <Alert
            type={expiryInfo.level === 'danger' ? 'error' : 'warning'}
            showIcon
            message={`作成から ${expiryInfo.daysElapsed} 日経過。残り ${expiryInfo.daysRemaining} 日で期限切れになります。`}
            style={{ marginBottom: 16 }}
          />
        );
      })()}

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
