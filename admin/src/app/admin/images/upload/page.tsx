// src/app/admin/images/upload/page.tsx
'use client';
import { useState } from 'react';
import API from '../../../../lib/api';
import { Upload, Button, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';

const { Dragger } = Upload;

export default function BulkUploadPage() {
  const [loading, setLoading] = useState(false);

  return (
    <Dragger
      multiple
      action="/admin/images/bulk-upload"
      headers={{ Authorization: `Bearer ${localStorage.getItem('token')}` }}
      onChange={({ file }) => {
        if (file.status === 'uploading') setLoading(true);
        if (file.status === 'done') {
          message.success(`${file.name} アップロード完了`);
          setLoading(false);
        }
        if (file.status === 'error') {
          message.error(`${file.name} アップロード失敗`);
          setLoading(false);
        }
      }}
    >
      <p><InboxOutlined style={{ fontSize: 48 }} /></p>
      <p>ここに画像をドラッグ / 複数選択</p>
    </Dragger>
  );
}
