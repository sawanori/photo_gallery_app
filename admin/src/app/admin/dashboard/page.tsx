'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, Button, Tag, Segmented, Spin, Empty, App, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { getProjects, deleteProject, getProjectExpiryInfo, Project, ProjectStatus } from '@/services/projectService';

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
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const status = statusFilter === 'all' ? undefined : statusFilter;
      const result = await getProjects(status);
      setProjects(result);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

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
        try {
          await Promise.all(expiredProjects.map((p) => deleteProject(p.id)));
          message.success('期限切れプロジェクトを削除しました');
          loadProjects();
        } catch (error) {
          console.error('Failed to bulk delete:', error);
          message.error('一括削除に失敗しました');
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
        try {
          await deleteProject(project.id);
          message.success('プロジェクトを削除しました');
          loadProjects();
        } catch (error) {
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
          onChange={(value) => setStatusFilter(value as ProjectStatus | 'all')}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({
            label,
            value,
            title: label,
          }))}
        />
      </div>

      {!loading && expiredProjects.length > 0 && (
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
      ) : projects.length === 0 ? (
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
