'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, Button, Tag, Segmented, Spin, Empty, App, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { getProjects, deleteProject, getProjectExpiryInfo, Project, ProjectStatus } from '@/services/projectService';
import type { DeleteImagesResult } from '@/services/imageService';

/**
 * Storage の削除に消し残しがあったときの文言。
 * 「削除しました」で終わらせると、課金され続けるファイルに誰も気付かない。
 */
const storageFailureMessage = (result: DeleteImagesResult): string =>
  `Storage の削除に失敗した画像が ${result.failed.length} 件あります。再実行してください。`;

const STATUS_LABELS: Record<ProjectStatus | 'all', string> = {
  all: 'すべて',
  active: '進行中',
  delivered: '納品済み',
  archived: 'アーカイブ',
};

const STATUS_COLORS: Record<ProjectStatus, string> = {
  active: 'blue',
  delivered: 'green',
  archived: 'default',
};

export default function DashboardPage() {
  const router = useRouter();
  const { modal, message } = App.useApp();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
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
    let cancelled = false;

    void (async () => {
      try {
        const status = statusFilter === 'all' ? undefined : statusFilter;
        const result = await getProjects(status);
        if (cancelled) return;
        setProjects(result);
        setLoadFailed(false);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load projects:', error);
        // 読み込み失敗を「0件」と混同させない。空状態は Alert とは別に出す。
        setProjects([]);
        setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [statusFilter, reloadKey]);

  const expiredProjects = useMemo(
    () => projects.filter((p) => getProjectExpiryInfo(p)?.level === 'expired'),
    [projects]
  );

  const handleBulkDelete = () => {
    modal.confirm({
      title: '期限切れプロジェクトを削除しますか？',
      content: `${expiredProjects.length} 件の期限切れプロジェクトとその関連データをすべて削除します。この操作は取り消せません。`,
      okText: '削除',
      okType: 'danger',
      cancelText: 'キャンセル',
      onOk: async () => {
        const key = 'bulk-delete';
        try {
          let failedImages = 0;
          // Promise.all で並べない。deleteProject の内部が既に並列で動くため、
          // ここで重ねるとプロジェクト数の分だけ同時実行数が膨らむ。
          for (let i = 0; i < expiredProjects.length; i += 1) {
            message.open({
              key,
              type: 'loading',
              content: `削除しています… ${i + 1} / ${expiredProjects.length} 件目`,
              duration: 0,
            });
            const result = await deleteProject(expiredProjects[i].id);
            failedImages += result.failed.length;
          }
          message.destroy(key);
          if (failedImages > 0) {
            message.warning(
              `Storage の削除に失敗した画像が ${failedImages} 件あります。再実行してください。`
            );
          } else {
            message.success('期限切れプロジェクトを削除しました');
          }
          reload();
        } catch (error) {
          message.destroy(key);
          console.error('Failed to bulk delete:', error);
          message.error('一括削除に失敗しました');
          // 途中まで消えているので一覧を取り直す
          reload();
        }
      },
    });
  };

  const handleDeleteProject = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    modal.confirm({
      title: 'プロジェクトを削除しますか？',
      content: `プロジェクト「${project.name}」を削除します。画像 ${project.imageCount} 枚と関連データも同時に削除されます。この操作は取り消せません。`,
      okText: '削除',
      okType: 'danger',
      cancelText: 'キャンセル',
      onOk: async () => {
        const key = `delete-${project.id}`;
        try {
          message.open({ key, type: 'loading', content: '削除しています…', duration: 0 });
          const result = await deleteProject(project.id, ({ completed, total }) => {
            message.open({
              key,
              type: 'loading',
              content: `削除しています… ${completed} / ${total} 枚`,
              duration: 0,
            });
          });
          message.destroy(key);
          if (result.failed.length > 0) {
            message.warning(storageFailureMessage(result));
          } else {
            message.success('プロジェクトを削除しました');
          }
          reload();
        } catch (error) {
          message.destroy(key);
          console.error('Failed to delete project:', error);
          message.error('プロジェクトの削除に失敗しました');
        }
      },
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>プロジェクト一覧</h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => router.push('/admin/projects/new')}
        >
          新規プロジェクト
        </Button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Segmented
          value={statusFilter}
          onChange={(value) => {
            // 絞り込みを変えたら取り直す。読み込み表示もここで立てる。
            setStatusFilter(value as ProjectStatus | 'all');
            setLoading(true);
            setLoadFailed(false);
          }}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({
            label,
            value,
            title: label,
          }))}
        />
      </div>

      {!loading && loadFailed && (
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
          style={{ marginBottom: 16 }}
        />
      )}

      {!loading && !loadFailed && expiredProjects.length > 0 && (
        <Alert
          type="error"
          showIcon
          message={`期限切れのプロジェクトが ${expiredProjects.length} 件あります`}
          action={
            <Button danger size="small" onClick={handleBulkDelete}>
              一括削除
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : loadFailed ? null : projects.length === 0 ? (
        <Empty description="プロジェクトがありません" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {projects.map((project) => (
            <Card
              key={project.id}
              hoverable
              onClick={() => router.push(`/admin/projects/${project.id}`)}
            >
              <Card.Meta
                title={project.name}
                description={project.clientName}
              />
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <Tag color={STATUS_COLORS[project.status]}>
                    {STATUS_LABELS[project.status]}
                  </Tag>
                  {(() => {
                    const expiryInfo = getProjectExpiryInfo(project);
                    if (!expiryInfo) return null;
                    if (expiryInfo.level === 'expired') {
                      return <Tag color="red">期限切れ</Tag>;
                    }
                    return (
                      <Tag color={expiryInfo.level === 'danger' ? 'red' : 'orange'}>
                        削除まで {expiryInfo.daysRemaining} 日
                      </Tag>
                    );
                  })()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#999', fontSize: 12 }}>
                    {project.imageCount} 枚
                  </span>
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={(e) => handleDeleteProject(e, project)}
                    style={{ borderRadius: 6 }}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
