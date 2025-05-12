// src/app/admin/images/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import API from '../../../lib/api';
import {
  Table,
  Button,
  Upload,
  message,
  Popconfirm,
  Row,
  Col,
  Card,
} from 'antd';
import {
  UploadOutlined,
  DeleteOutlined,
  InboxOutlined,
} from '@ant-design/icons';

const { Dragger } = Upload;

export default function ImagesPage() {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingSingle, setUploadingSingle] = useState(false);
  const [uploadingBulk, setUploadingBulk] = useState(false);

  // 画像一覧取得
  const fetchImages = async () => {
    setLoading(true);
    try {
      const res = await API.get('/images?page=1&limit=100');
      setImages(res.data.items);
    } catch (err) {
      console.error(err);
      message.error('画像一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  // 単一アップロード設定
  const singleUploadProps = {
    accept: 'image/*',
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }: any) => {
      setUploadingSingle(true);
      const form = new FormData();
      form.append('file', file as Blob);
      form.append('title', (file as any).name);
      form.append('description', (file as any).name);
      try {
        await API.post('/images', form);
        message.success('アップロード完了');
        fetchImages();
        onSuccess && onSuccess(null, file);
      } catch (err) {
        console.error(err);
        message.error('アップロードに失敗しました');
        onError && onError(err);
      } finally {
        setUploadingSingle(false);
      }
    },
  };

  // 一括アップロード設定
  const bulkUploadProps = {
    multiple: true,
    accept: 'image/*',
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }: any) => {
      setUploadingBulk(true);
      const form = new FormData();
      form.append('file', file as Blob);
      form.append('title', (file as any).name);
      form.append('description', (file as any).name);
      try {
        await API.post('/images', form);
        // 1ファイルずつアップしていく
        message.success(`${(file as any).name} をアップロードしました`);
        fetchImages();
        onSuccess && onSuccess(null, file);
      } catch (err) {
        console.error(err);
        message.error(`${(file as any).name} のアップロードに失敗しました`);
        onError && onError(err);
      } finally {
        setUploadingBulk(false);
      }
    },
    style: { marginBottom: 16 },
  };

  // 削除
  const deleteImage = async (id: string) => {
    try {
      await API.delete(`/images/${id}`);
      message.success('画像を削除しました');
      fetchImages();
    } catch (err) {
      console.error(err);
      message.error('削除に失敗しました');
    }
  };

  // テーブル列
  const columns = [
    {
      title: 'プレビュー',
      render: (img: any) => (
        <img src={img.url} alt={img.title} style={{ width: 80 }} />
      ),
    },
    { title: 'タイトル', dataIndex: 'title' },
    { title: 'アップロード日', dataIndex: 'createdAt' },
    {
      title: '操作',
      render: (_: any, img: any) => (
        <Popconfirm
          title="本当に削除しますか？"
          onConfirm={() => deleteImage(img.id)}
        >
          <Button danger icon={<DeleteOutlined />}>
            削除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      {/* 単一ファイルアップロード */}
      <Upload {...singleUploadProps}>
        <Button
          type="primary"
          icon={<UploadOutlined />}
          loading={uploadingSingle}
        >
          画像をアップロード
        </Button>
      </Upload>

      {/* 一括アップロード用ドラッガー */}
      <Dragger {...bulkUploadProps}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p>ここに複数の画像をドラッグ＆ドロップ</p>
      </Dragger>

      {/* 画像一覧テーブル */}
      <Table
        rowKey="id"
        dataSource={images}
        columns={columns}
        loading={loading}
        pagination={false}
      />
    </>
  );
}
