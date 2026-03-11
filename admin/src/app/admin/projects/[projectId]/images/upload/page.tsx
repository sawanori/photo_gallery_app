'use client';

import { useState } from 'react';
import { Upload, Button, Card, message, Progress, Segmented, Typography } from 'antd';
import { UploadOutlined, ArrowLeftOutlined, InboxOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';
import { uploadImage } from '@/services/imageService';
import { useAuth } from '@/contexts/AuthContext';
import { compressImage } from '@/utils/imageCompression';
import type { UploadFile } from 'antd';

const { Dragger } = Upload;
const { Text } = Typography;
const MAX_FILES = 1000;

const SYSTEM_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '.gitkeep']);

type UploadMode = 'file' | 'folder';

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function isSystemFile(name: string): boolean {
  const basename = name.split('/').pop() || name;
  return SYSTEM_FILES.has(basename) || basename.startsWith('.');
}

/** Natural sort by webkitRelativePath (falls back to name) */
function naturalSortFiles(files: UploadFile[]): UploadFile[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return [...files].sort((a, b) => {
    const pathA = (a.originFileObj as File & { webkitRelativePath?: string })?.webkitRelativePath || a.name;
    const pathB = (b.originFileObj as File & { webkitRelativePath?: string })?.webkitRelativePath || b.name;
    return collator.compare(pathA, pathB);
  });
}

function getFolderSummary(files: UploadFile[]): { folderName: string; count: number } | null {
  if (files.length === 0) return null;
  const firstFile = files[0].originFileObj as File & { webkitRelativePath?: string };
  const relativePath = firstFile?.webkitRelativePath || '';
  const folderName = relativePath.split('/')[0] || '';
  if (!folderName) return null;
  return { folderName, count: files.length };
}

export default function ProjectImageUploadPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId as string;
  const { user } = useAuth();

  const [uploadMode, setUploadMode] = useState<UploadMode>('file');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleModeChange = (value: UploadMode) => {
    setUploadMode(value);
    setFileList([]);
  };

  const handleBeforeUpload = (_file: File, newFileList: File[]) => {
    const filtered = newFileList.filter((f) => {
      if (uploadMode === 'folder') {
        const rp = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        if (isSystemFile(rp)) return false;
      }
      return isImageFile(f);
    });

    const newFiles: UploadFile[] = filtered.map((f) => {
      const rp = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      return {
        uid: `${Date.now()}-${rp}`,
        name: uploadMode === 'folder' ? rp : f.name,
        size: f.size,
        type: f.type,
        status: 'done' as const,
        originFileObj: f as UploadFile['originFileObj'],
      };
    });

    setFileList((prev) => {
      const dedupeKey = (uf: UploadFile) => {
        if (uploadMode === 'folder') {
          const rp = (uf.originFileObj as File & { webkitRelativePath?: string })?.webkitRelativePath;
          return rp || uf.name;
        }
        return uf.name;
      };
      const existingKeys = new Set(prev.map(dedupeKey));
      const unique = newFiles.filter((f) => !existingKeys.has(dedupeKey(f)));
      const combined = naturalSortFiles([...prev, ...unique]);
      if (combined.length > MAX_FILES) {
        message.warning(`一度にアップロードできるのは最大${MAX_FILES}枚までです`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
    return false;
  };

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
          const compressed = await compressImage(file);
          const title = file.name.replace(/\.[^/.]+$/, '');
          await uploadImage(projectId, user.uid, compressed, title);
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

  const folderSummary = uploadMode === 'folder' ? getFolderSummary(fileList) : null;

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

        <Segmented
          value={uploadMode}
          onChange={(v) => handleModeChange(v as UploadMode)}
          options={[
            { label: 'ファイル選択', value: 'file' },
            { label: 'フォルダー選択', value: 'folder', icon: <FolderOpenOutlined /> },
          ]}
          style={{ marginBottom: 16 }}
        />

        {uploadMode === 'file' ? (
          <Dragger
            key="file-dragger"
            fileList={fileList}
            multiple
            maxCount={MAX_FILES}
            beforeUpload={handleBeforeUpload}
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
              複数ファイルを一括でアップロードできます（JPG, PNG, WebP・最大{MAX_FILES}枚）
            </p>
          </Dragger>
        ) : (
          <Dragger
            key="folder-dragger"
            fileList={fileList}
            directory
            maxCount={MAX_FILES}
            beforeUpload={handleBeforeUpload}
            onRemove={(file) => {
              setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
            }}
            accept="image/*"
            showUploadList
            style={{ marginBottom: 24 }}
          >
            <p className="ant-upload-drag-icon">
              <FolderOpenOutlined />
            </p>
            <p className="ant-upload-text">
              クリックしてフォルダーを選択
            </p>
            <p className="ant-upload-hint">
              フォルダー内の画像をファイル名順にアップロードします（最大{MAX_FILES}枚）
            </p>
          </Dragger>
        )}

        {folderSummary && (
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">
              📁 {folderSummary.folderName} — {folderSummary.count}枚の画像
            </Text>
          </div>
        )}

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
