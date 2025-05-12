// src/app/admin/users/page.tsx
'use client';
import { useEffect, useState } from 'react';
import API from '../../lib/api';
import { Table, Button, Tag } from 'antd';

export default function UsersPage() {
  const [data, setData] = useState([]);
  async function fetch() {
    const res = await API.get('/admin/users');
    setData(res.data);
  }
  useEffect(() => { fetch() }, []);

  const deleteUser = async (id: string) => {
    await API.delete(`/admin/users/${id}`);
    fetch();
  };

  return (
    <Table
      rowKey="id"
      dataSource={data}
      columns={[
        { title: 'メール', dataIndex: 'email' },
        { title: 'ロール', dataIndex: 'role', render: (r: string) => <Tag>{r}</Tag> },
        {
          title: '操作',
          render: (u: any) => (
            <Button danger onClick={() => deleteUser(u.id)}>削除</Button>
          ),
        },
      ]}
    />
  );
}
