'use client';

import { useEffect, useState } from 'react';
import { Table, Button, Tag, message, Popconfirm, Spin } from 'antd';
import { DeleteOutlined, UserOutlined, ReloadOutlined } from '@ant-design/icons';
import { getUsers, deleteUser as deleteUserService, User } from '@/services/userService';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ja';

dayjs.extend(relativeTime);
dayjs.locale('ja');

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await getUsers();
      setUsers(data);
    } catch (error) {
      message.error('ユーザー一覧の取得に失敗しました');
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await deleteUserService(id);
      message.success('ユーザーを削除しました');
      fetchUsers();
    } catch (error) {
      message.error('ユーザーの削除に失敗しました');
      console.error('Error deleting user:', error);
    }
  };

  const columns = [
    {
      title: 'ユーザー',
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'var(--color-bg-alt)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UserOutlined style={{ color: 'var(--color-ink-muted)', fontSize: 14 }} />
          </div>
          <span style={{ fontWeight: 500, color: 'var(--color-ink)', fontSize: 13 }}>
            {email}
          </span>
        </div>
      ),
    },
    {
      title: 'ロール',
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: (role: string) => (
        <Tag
          color={role === 'admin' ? 'orange' : 'default'}
          style={{ fontSize: 12, borderRadius: 6 }}
        >
          {role === 'admin' ? '管理者' : 'ユーザー'}
        </Tag>
      ),
    },
    {
      title: '登録日',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: Date) => (
        <span style={{ color: 'var(--color-ink-muted)', fontSize: 13 }}>
          {date ? dayjs(date).format('YYYY/MM/DD HH:mm') : '-'}
        </span>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 80,
      render: (_: unknown, record: User) => (
        record.role !== 'admin' ? (
          <Popconfirm
            title="ユーザーを削除"
            description="このユーザーを削除してもよろしいですか？"
            onConfirm={() => handleDelete(record.id)}
            okText="削除"
            cancelText="キャンセル"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
              style={{ borderRadius: 6 }}
            />
          </Popconfirm>
        ) : null
      ),
    },
  ];

  if (loading) {
    return (
      <div className="admin-spinner">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        className="animate-fade-in"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <div>
          <p style={{ color: 'var(--color-ink-muted)', fontSize: 13, marginBottom: 4 }}>
            全 {users.length} 名
          </p>
          <h2
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: 'var(--color-ink)',
              letterSpacing: '-0.02em',
            }}
          >
            登録ユーザー
          </h2>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchUsers}
          style={{ borderRadius: 8 }}
        >
          更新
        </Button>
      </div>

      {/* Table */}
      <div className="animate-fade-in stagger-2">
        <Table
          rowKey="id"
          dataSource={users}
          columns={columns}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `全 ${total} 件`,
          }}
        />
      </div>
    </div>
  );
}
