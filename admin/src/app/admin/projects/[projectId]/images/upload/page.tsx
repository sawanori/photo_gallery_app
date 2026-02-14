'use client';

import { useState } from 'react';
import { Upload, Button, Card, message, Progress } from 'antd';
import { UploadOutlined, ArrowLeftOutlined, InboxOutlined } from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';
import { uploadImage } from '@/services/imageService';
import { useAuth } from '@/contexts/AuthContext';
import type { UploadFile } from 'antd';

const { Dragger } = Upload;

export default function ProjectImageUploadPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId as string;
  const { user } = useAuth();

  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleUpload = async () => {
    if (!user || fileList.length === 0) {
      message.warning('ファイルを選択してください');
      return;
    }

    const files = fileList
      .map((f) => f.originFileObj as File)
      .filter(Boolean);

    if (files.length === 0) {
      message.warning('ファイルを選択してください');
      return;
    }

    try {
      setUploading(true);
      setProgress({ current: 0, total: files.length });

      let successCount = 0;
      let failCount = 0;

      for (const file of files) {
        try {
          const title = file.name.replace(/\.[^/.]+$/, '');
          await uploadImage(projectId, user.uid, file, title);
          successCount++;
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          failCount++;
        }
        setProgress((prev) => ({ ...prev, current: prev.current + 1 }));
      }

      if (failCount === 0) {
        message.success(`${successCount}枚の画像をアップロードしました`);
      } else {
        message.warning(`${successCount}枚成功、${failCount}枚失敗`);
      }
      router.push(`/admin/projects/${projectId}`);
    } catch (error) {
      console.error('Upload failed:', error);
      message.error('アップロードに失敗しました');
    } finally {
      setUploading(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push(`/admin/projects/${projectId}`)}
          style={{ color: 'var(--color-ink-muted)', padding: '4px 0' }}
        >
          戻る
        </Button>
      </div>

      <Card style={{ maxWidth: 640 }}>
        <h2
          style={{
            margin: '0 0 24px 0',
            fontSize: 20,
            fontWeight: 600,
            color: 'var(--color-ink)',
          }}
        >
          画像アップロード
        </h2>

        <Dragger
          fileList={fileList}
          multiple
          beforeUpload={(file, newFileList) => {
            const newFiles: UploadFile[] = newFileList.map((f) => ({
              uid: f.uid || `${Date.now()}-${f.name}`,
              name: f.name,
              size: f.size,
              type: f.type,
              status: 'done' as const,
              originFileObj: f,
            }));
            setFileList((prev) => {
              const existingNames = new Set(prev.map((p) => p.name));
              const unique = newFiles.filter((f) => !existingNames.has(f.name));
              return [...prev, ...unique];
            });
            return false;
          }}
          onRemove={(file) => {
            setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
          }}
          accept="image/*"
          showUploadList
          style={{ marginBottom: 24 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            クリックまたはドラッグで画像を選択
          </p>
          <p className="ant-upload-hint">
            複数ファイルを一括でアップロードできます（JPG, PNG, WebP）
          </p>
        </Dragger>

        {uploading && progress.total > 0 && (
          <Progress
            percent={Math.round((progress.current / progress.total) * 100)}
            format={() => `${progress.current} / ${progress.total}`}
            style={{ marginBottom: 16 }}
          />
        )}

        <Button
          type="primary"
          onClick={handleUpload}
          loading={uploading}
          icon={<UploadOutlined />}
          disabled={fileList.length === 0}
        >
          {fileList.length > 0
            ? `${fileList.length}枚をアップロード`
            : 'アップロード'}
        </Button>
      </Card>
    </div>
  );
}
