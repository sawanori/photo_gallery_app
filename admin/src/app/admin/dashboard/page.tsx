'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, Button, Tag, Segmented, Spin, Empty } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { getProjects, Project, ProjectStatus } from '@/services/projectService';

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
                <Tag color={STATUS_COLORS[project.status]}>
                  {STATUS_LABELS[project.status]}
                </Tag>
                <span style={{ color: '#999', fontSize: 12 }}>
                  {project.imageCount} 枚
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
