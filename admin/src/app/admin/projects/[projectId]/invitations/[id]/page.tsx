'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  Tag,
  Empty,
  Spin,
  Button,
  Switch,
  Descriptions,
  InputNumber,
  message,
  Row,
  Col,
  Statistic,
  Image as AntImage,
} from 'antd';
import {
  ArrowLeftOutlined,
  CopyOutlined,
  LinkOutlined,
  HeartOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';
import { getInvitation, updateInvitation, getGalleryUrl, Invitation } from '@/services/invitationService';
import { getLikedImageIdsByInvitation } from '@/services/likeService';
import { getImage, type Image } from '@/services/imageService';
import {
  effectiveDeadline,
  normalizeViewingDays,
} from '@/utils/viewingWindow';
import dayjs from 'dayjs';
import 'dayjs/locale/ja';

dayjs.locale('ja');

/**
 * 後工程に渡すファイル名。
 *
 * title はアップロード時の元ファイル名。storagePath の末尾は拡張子を持たない
 * 保存名（例 1786861045375-0ubf6g）になっていることがあるため、title を優先する。
 */
function selectionFileName(image: Image): string {
  const fromPath = image.storagePath?.split('/').pop() || '';
  return image.title || fromPath || image.id;
}

export default function InvitationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId as string;
  const invitationId = params?.id as string;

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  // 閲覧日数の編集。招待を作り直さずに延長できるようにする。
  // クライアントから「もう少し見たい」と言われる場面が実際にある。
  const [daysDraft, setDaysDraft] = useState<number | null>(null);
  const [savingDays, setSavingDays] = useState(false);

  // クライアントが選んだ写真。撮影者が後工程（レタッチ・納品）に渡すために見る。
  const [selected, setSelected] = useState<Image[] | null>(null);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [selectionFailed, setSelectionFailed] = useState(false);

  useEffect(() => {
    if (invitationId) {
      loadInvitation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitationId]);

  const loadInvitation = async () => {
    try {
      setLoading(true);
      const inv = await getInvitation(invitationId);
      setInvitation(inv);
      if (inv) setDaysDraft(normalizeViewingDays(inv.viewingDays));
      if (inv) void loadSelection(inv.id);
    } catch (error) {
      console.error('Failed to load invitation:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSelection = async (id: string) => {
    try {
      setSelectionLoading(true);
      setSelectionFailed(false);
      const imageIds = await getLikedImageIdsByInvitation(id);
      const images = (await Promise.all(imageIds.map((imageId) => getImage(imageId))))
        .filter((image): image is Image => image !== null);
      // 撮影者が見る順序は、管理画面のアップロード順（ファイル名の自然順）に揃える
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      images.sort((a, b) => collator.compare(selectionFileName(a), selectionFileName(b)));
      setSelected(images);
    } catch (error) {
      console.error('Failed to load selection:', error);
      setSelectionFailed(true);
      setSelected(null);
    } finally {
      setSelectionLoading(false);
    }
  };

  const handleCopyFileNames = async () => {
    if (!selected || selected.length === 0) return;
    try {
      await navigator.clipboard.writeText(selected.map(selectionFileName).join('\n'));
      message.success(`${selected.length}件のファイル名をコピーしました`);
    } catch {
      message.error('コピーできませんでした');
    }
  };

  const handleToggleActive = async (checked: boolean) => {
    if (!invitation) return;
    try {
      setToggling(true);
      await updateInvitation(invitation.id, { isActive: checked });
      setInvitation({ ...invitation, isActive: checked });
    } catch (error) {
      console.error('Failed to update invitation:', error);
      message.error('招待の更新に失敗しました');
    } finally {
      setToggling(false);
    }
  };

  const handleSaveViewingDays = async () => {
    if (!invitation || daysDraft === null) return;
    if (daysDraft === normalizeViewingDays(invitation.viewingDays)) return;
    try {
      setSavingDays(true);
      await updateInvitation(invitation.id, { viewingDays: daysDraft });
      setInvitation({ ...invitation, viewingDays: daysDraft });
      message.success('閲覧できる日数を変更しました');
    } catch (error) {
      console.error('Failed to update viewingDays:', error);
      message.error('変更に失敗しました');
      // 失敗したら画面の値を実際の値へ戻す。成功したように見せない。
      setDaysDraft(normalizeViewingDays(invitation.viewingDays));
    } finally {
      setSavingDays(false);
    }
  };

  const handleCopyUrl = () => {
    if (!invitation) return;
    const url = getGalleryUrl(invitation.token);
    navigator.clipboard.writeText(url);
    message.success('URLをコピーしました');
  };

  if (loading) {
    return (
      <div className="admin-spinner">
        <Spin size="large" />
      </div>
    );
  }

  if (!invitation) {
    return (
      <Empty description="招待が見つかりません">
        <Button onClick={() => router.push(`/admin/projects/${projectId}`)}>
          プロジェクトに戻る
        </Button>
      </Empty>
    );
  }

  // クライアントが実際に見られなくなる日。閲覧期限と失効日の早いほう。
  const clientDeadline = effectiveDeadline(
    invitation.createdAt,
    invitation.viewingDays,
    invitation.expiresAt
  );

  const getStatus = () => {
    if (!invitation.isActive) return { label: '無効', color: 'default' as const };
    // 判定も clientDeadline で行う。expiresAt だけを見ていたため、
    // 閲覧期限が切れた招待が「有効」と表示され続けていた。
    if (clientDeadline && clientDeadline < new Date()) {
      return { label: '期限切れ', color: 'error' as const };
    }
    return { label: '有効', color: 'success' as const };
  };

  const status = getStatus();
  const galleryUrl = getGalleryUrl(invitation.token);

  return (
    <div>
      {/* Back button */}
      <div style={{ marginBottom: 16 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push(`/admin/projects/${projectId}`)}
          style={{ color: 'var(--color-ink-muted)', padding: '4px 0' }}
        >
          プロジェクトに戻る
        </Button>
      </div>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--color-ink)',
              letterSpacing: '-0.02em',
            }}
          >
            招待詳細
          </h2>
          <Tag color={status.color}>{status.label}</Tag>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>有効</span>
          <Switch
            checked={invitation.isActive}
            onChange={handleToggleActive}
            loading={toggling}
          />
        </div>
      </div>

      {/* Invitation Details */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="クライアント名">
            {invitation.clientName}
          </Descriptions.Item>
          {invitation.clientEmail && (
            <Descriptions.Item label="メール">
              {invitation.clientEmail}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="画像数">
            {invitation.imageIds.length} 枚
          </Descriptions.Item>
          <Descriptions.Item label="アクセス数">
            {invitation.accessCount} 回
          </Descriptions.Item>
          {/*
            クライアントが実際に見られなくなる日を最初に出す。
            以前は expiresAt だけを「有効期限」として出していたが、web は
            「作成から viewingDays 日」でも閲覧を止めるため、
            「有効期限 10月31日」と表示しながら7日で見られなくなっていた。
          */}
          <Descriptions.Item label="閲覧できる期限">
            {clientDeadline ? (
              <>
                <strong>{dayjs(clientDeadline).format('YYYY年MM月DD日')}</strong>
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-ink-muted)' }}>
                  （クライアントに見えるのはこの日まで）
                </span>
              </>
            ) : (
              '—'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="閲覧日数">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <InputNumber
                value={daysDraft}
                onChange={(v) => setDaysDraft(typeof v === 'number' ? v : null)}
                min={1}
                max={365}
                precision={0}
                addonAfter="日"
                style={{ width: 140 }}
                disabled={savingDays}
              />
              <Button
                size="small"
                onClick={handleSaveViewingDays}
                loading={savingDays}
                disabled={
                  daysDraft === null ||
                  daysDraft === normalizeViewingDays(invitation.viewingDays)
                }
              >
                変更
              </Button>
              {invitation.viewingDays === undefined && (
                <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
                  未設定のため既定の {normalizeViewingDays(undefined)} 日が適用されています
                </span>
              )}
            </div>
          </Descriptions.Item>
          <Descriptions.Item label="失効日（システム上）">
            {dayjs(invitation.expiresAt).format('YYYY年MM月DD日')}
          </Descriptions.Item>
          <Descriptions.Item label="作成日">
            {dayjs(invitation.createdAt).format('YYYY年MM月DD日')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Gallery URL */}
      <Card
        title={
          <span>
            <LinkOutlined /> ギャラリーURL
          </span>
        }
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--color-bg-secondary, #f5f5f5)',
            padding: '8px 12px',
            borderRadius: 6,
          }}
        >
          <span
            style={{
              flex: 1,
              fontSize: 13,
              wordBreak: 'break-all',
              color: 'var(--color-ink-secondary, #595959)',
            }}
          >
            {galleryUrl}
          </span>
          <Button
            type="text"
            icon={<CopyOutlined />}
            onClick={handleCopyUrl}
            size="small"
          >
            コピー
          </Button>
        </div>
      </Card>

      {/* 選定結果 */}
      <Card
        style={{ marginTop: 16 }}
        title={
          <span>
            <HeartOutlined /> クライアントの選定
          </span>
        }
        extra={
          selected && selected.length > 0 ? (
            <Button size="small" icon={<CopyOutlined />} onClick={handleCopyFileNames}>
              ファイル名をコピー
            </Button>
          ) : null
        }
      >
        {selectionLoading ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Spin />
          </div>
        ) : selectionFailed ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ color: 'var(--color-ink-secondary, #595959)', marginBottom: 12 }}>
              選定結果を読み込めませんでした。
            </p>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => invitation && loadSelection(invitation.id)}
            >
              再試行
            </Button>
          </div>
        ) : !selected || selected.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="まだ選ばれていません"
          />
        ) : (
          <>
            <Statistic
              title="選ばれた枚数"
              value={selected.length}
              suffix={`/ ${invitation.imageIds.length} 枚`}
              style={{ marginBottom: 16 }}
            />
            <Row gutter={[8, 8]}>
              {selected.map((image) => (
                <Col key={image.id} xs={12} sm={8} md={6}>
                  <AntImage
                    src={image.url}
                    alt={selectionFileName(image)}
                    style={{ borderRadius: 6, objectFit: 'cover', aspectRatio: '1 / 1' }}
                    width="100%"
                  />
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--color-ink-secondary, #595959)',
                      marginTop: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={selectionFileName(image)}
                  >
                    {selectionFileName(image)}
                  </div>
                </Col>
              ))}
            </Row>
          </>
        )}
      </Card>
    </div>
  );
}
