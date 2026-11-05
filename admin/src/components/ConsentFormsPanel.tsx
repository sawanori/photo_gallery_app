'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Spin,
  Table,
  Tag,
} from 'antd';
import { CopyOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '@/contexts/AuthContext';
import {
  createConsentForm,
  deliverConsent,
  getConsentFormsByProject,
  getConsentFormUrl,
  getConsentResponses,
  updateConsentForm,
  type ConsentForm,
  type ConsentFormSettings,
  type ConsentResponse,
  type DeliveryResult,
  type DeliveryStatus,
} from '@/services/consentService';
import type { Invitation } from '@/services/invitationService';
import { DEFAULT_VIEWING_DAYS, effectiveDeadline } from '@/utils/viewingWindow';

interface Props {
  projectId: string;
  projectName: string;
  invitations: Invitation[];
  imageCount: number;
}

const deliveryStatusTag: Record<DeliveryStatus, { label: string; color: string }> = {
  pending: { label: '未送信', color: 'default' },
  sent: { label: '送信済み', color: 'success' },
  failed: { label: '送信失敗', color: 'error' },
};

const linkModeLabel = {
  perPerson: '1人ずつ別の URL',
  shared: '全員に共通の URL',
} as const;

const deliveryTimingLabel = {
  onSubmit: '送信した直後に送る',
  later: '管理画面からまとめて送る',
} as const;

/** web が返す「まだ送れない」理由を、管理者が次にすることの分かる文にする。 */
const notReadyMessage = (reason: DeliveryResult['notReadyReason']): string =>
  reason === 'shared_invitation_unusable'
    ? '共通の招待が無効か期限切れです。設定で有効な招待を選んでください。'
    : '案件に画像がありません。画像をアップロードしてから送ってください。';

const summarize = (result: DeliveryResult): string => {
  const parts = [`${result.sent} 件送信しました`];
  if (result.failed > 0) parts.push(`${result.failed} 件は送信に失敗しました`);
  if (result.notReady > 0) parts.push(`${result.notReady} 件は送れませんでした（${notReadyMessage(result.notReadyReason)}）`);
  return parts.join('。');
};

export default function ConsentFormsPanel({ projectId, projectName, invitations, imageCount }: Props) {
  const { user } = useAuth();
  const { message, modal } = App.useApp();
  const [settingsForm] = Form.useForm<ConsentFormSettings>();
  const linkMode = Form.useWatch('linkMode', settingsForm);

  const [forms, setForms] = useState<ConsentForm[]>([]);
  const [responses, setResponses] = useState<Record<string, ConsentResponse[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // null: 閉じている / 'new': 作成 / ConsentForm: その設定を変更
  const [editing, setEditing] = useState<ConsentForm | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyFormId, setBusyFormId] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadFailed(false);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await getConsentFormsByProject(projectId);
        const lists = await Promise.all(loaded.map((form) => getConsentResponses(form.id)));
        if (cancelled) return;
        setForms(loaded);
        setResponses(Object.fromEntries(loaded.map((form, i) => [form.id, lists[i]])));
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load consent forms:', error);
        setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);

  /** 共通 URL に選べる招待。開けない招待を選ばせない。 */
  const usableInvitations = invitations.filter((inv) => {
    if (!inv.isActive) return false;
    const deadline = effectiveDeadline(inv.createdAt, inv.viewingDays, inv.expiresAt);
    return !deadline || deadline > new Date();
  });

  const openEditor = (target: ConsentForm | 'new') => {
    setEditing(target);
    settingsForm.setFieldsValue(
      target === 'new'
        ? {
            title: projectName,
            organizerName: '',
            linkMode: 'perPerson',
            sharedInvitationId: undefined,
            deliveryTiming: 'onSubmit',
            viewingDays: DEFAULT_VIEWING_DAYS,
          }
        : {
            title: target.title,
            organizerName: target.organizerName,
            linkMode: target.linkMode,
            sharedInvitationId: target.sharedInvitationId,
            deliveryTiming: target.deliveryTiming,
            viewingDays: target.viewingDays,
          }
    );
  };

  const handleSave = async () => {
    if (!user || editing === null) return;
    let values: ConsentFormSettings;
    try {
      values = await settingsForm.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        await createConsentForm({ ...values, projectId, createdBy: user.uid });
        message.success('同意フォームを作成しました');
      } else {
        await updateConsentForm(editing.id, values);
        message.success('設定を保存しました');
      }
      setEditing(null);
      reload();
    } catch (error) {
      console.error('Failed to save consent form:', error);
      message.error('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (form: ConsentForm) => {
    try {
      await updateConsentForm(form.id, { isActive: !form.isActive });
      message.success(form.isActive ? '受け付けを止めました' : '受け付けを再開しました');
      reload();
    } catch (error) {
      console.error('Failed to toggle consent form:', error);
      message.error('変更に失敗しました');
    }
  };

  const handleCopyUrl = async (formId: string) => {
    try {
      await navigator.clipboard.writeText(getConsentFormUrl(formId));
      message.success('URLをコピーしました');
    } catch (error) {
      console.error('Failed to copy consent form url:', error);
      message.error(error instanceof Error && error.message ? error.message : 'コピーできませんでした');
    }
  };

  const runDelivery = async (form: ConsentForm, responseIds?: string[]) => {
    setBusyFormId(form.id);
    try {
      const result = await deliverConsent(form.id, responseIds);
      if (result.failed > 0 || result.notReady > 0) message.warning(summarize(result), 8);
      else message.success(summarize(result));
    } catch (error) {
      console.error('Failed to deliver consent urls:', error);
      message.error(error instanceof Error ? error.message : '送信に失敗しました');
    } finally {
      setBusyFormId(null);
      reload();
    }
  };

  const confirmDeliverPending = (form: ConsentForm, count: number) => {
    modal.confirm({
      title: `${count} 人に写真の URL を送りますか？`,
      content: `まだ URL を受け取っていない人（未送信・送信失敗）に、メールで送ります。${
        form.linkMode === 'perPerson'
          ? `1人ずつ専用の招待を発行し、案件の画像 ${imageCount} 枚すべてを見られるようにします。`
          : ''
      }`,
      okText: '送る',
      cancelText: 'キャンセル',
      onOk: () => runDelivery(form),
    });
  };

  const confirmResend = (form: ConsentForm, response: ConsentResponse) => {
    modal.confirm({
      title: `${response.name} 様に送り直しますか？`,
      content: `${response.email} に写真の URL をもう一度送ります。`,
      okText: '送る',
      cancelText: 'キャンセル',
      onOk: () => runDelivery(form, [response.id]),
    });
  };

  if (loading) {
    return (
      <div className="admin-spinner">
        <Spin />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <Alert
        type="error"
        showIcon
        message="同意フォームの読み込みに失敗しました"
        action={
          <Button size="small" icon={<ReloadOutlined />} onClick={reload}>
            再試行
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ color: 'var(--color-ink-muted)', fontSize: 13 }}>
          {forms.length} 件のフォーム
        </span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openEditor('new')}>
          フォーム作成
        </Button>
      </div>

      {forms.length === 0 ? (
        <Empty description="同意フォームがありません。イベントの参加者に配るフォームを作ると、同意した人に写真の URL をメールで送れます。" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {forms.map((form) => {
            const list = responses[form.id] ?? [];
            const pendingCount = list.filter((r) => r.deliveryStatus !== 'sent').length;
            return (
              <Card
                key={form.id}
                size="small"
                title={
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {form.title}
                    <Tag color={form.isActive ? 'processing' : 'default'}>
                      {form.isActive ? '受付中' : '停止中'}
                    </Tag>
                  </span>
                }
                extra={
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(form)}>
                    設定
                  </Button>
                }
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: 'var(--color-ink-muted)', marginBottom: 12 }}>
                  <span>{linkModeLabel[form.linkMode]}</span>
                  <span>{deliveryTimingLabel[form.deliveryTiming]}</span>
                  {form.organizerName && <span>{form.organizerName} は関与しない旨を記載</span>}
                  {form.linkMode === 'perPerson' && <span>閲覧 {form.viewingDays} 日</span>}
                  <span>同意 {list.length} 人</span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyUrl(form.id)}>
                    フォームの URL をコピー
                  </Button>
                  <Button size="small" onClick={() => handleToggleActive(form)}>
                    {form.isActive ? '受け付けを止める' : '受け付けを再開'}
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={<SendOutlined />}
                    disabled={pendingCount === 0}
                    loading={busyFormId === form.id}
                    onClick={() => confirmDeliverPending(form, pendingCount)}
                  >
                    未送信の {pendingCount} 人に URL を送る
                  </Button>
                </div>

                <Table<ConsentResponse>
                  size="small"
                  rowKey="id"
                  dataSource={list}
                  pagination={list.length > 20 ? { pageSize: 20 } : false}
                  scroll={{ x: 760 }}
                  locale={{ emptyText: 'まだ同意した人はいません' }}
                  columns={[
                    { title: '企業名', dataIndex: 'companyName' },
                    {
                      title: '氏名',
                      key: 'name',
                      render: (_, r) => (
                        <div>
                          <div>{r.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{r.nameKana}</div>
                        </div>
                      ),
                    },
                    { title: 'メールアドレス', dataIndex: 'email' },
                    {
                      title: '同意日時',
                      key: 'agreedAt',
                      render: (_, r) => (r.agreedAt ? dayjs(r.agreedAt).format('YYYY/MM/DD HH:mm') : '—'),
                    },
                    {
                      title: '送信',
                      key: 'deliveryStatus',
                      render: (_, r) => (
                        <Tag color={deliveryStatusTag[r.deliveryStatus].color} title={r.lastError}>
                          {deliveryStatusTag[r.deliveryStatus].label}
                        </Tag>
                      ),
                    },
                    {
                      title: '',
                      key: 'actions',
                      render: (_, r) => (
                        <Button
                          size="small"
                          type="link"
                          disabled={busyFormId === form.id}
                          onClick={() => confirmResend(form, r)}
                        >
                          {r.deliveryStatus === 'sent' ? '送り直す' : '送る'}
                        </Button>
                      ),
                    },
                  ]}
                />
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        title={editing === 'new' ? '同意フォームを作成' : '同意フォームの設定'}
        open={editing !== null}
        onOk={handleSave}
        onCancel={() => setEditing(null)}
        okText={editing === 'new' ? '作成' : '保存'}
        cancelText="キャンセル"
        confirmLoading={saving}
        // 開く前に setFieldsValue するので、Form を最初から描画しておく。
        forceRender
      >
        <Form form={settingsForm} layout="vertical" requiredMark="optional">
          <Form.Item
            label="イベント名"
            name="title"
            tooltip="フォームの見出しと、参加者に届くメールの件名に入ります。"
            rules={[{ required: true, whitespace: true, message: 'イベント名を入力してください' }]}
          >
            <Input maxLength={100} />
          </Form.Item>

          <Form.Item
            label="関与しない主催者・会場"
            name="organizerName"
            tooltip="入れると、同意事項に「写真の受け取りと閲覧は当社と参加者の間のもので、この会社は関与しない」という項目が載ります。"
            extra="例: WWJ株式会社。空欄ならこの項目は載りません。参加者が同意したあとで変えても、その人の同意の記録は変わりません。"
          >
            <Input maxLength={100} placeholder="WWJ株式会社" />
          </Form.Item>

          <Form.Item label="送る URL" name="linkMode">
            <Radio.Group
              options={[
                { value: 'perPerson', label: '1人ずつ別の URL（人ごとに止められる）' },
                { value: 'shared', label: '全員に共通の URL（既存の招待を送る）' },
              ]}
            />
          </Form.Item>

          {linkMode === 'shared' ? (
            <Form.Item
              label="送る招待"
              name="sharedInvitationId"
              rules={[{ required: true, message: '送る招待を選んでください' }]}
              extra={usableInvitations.length === 0 ? '有効な招待がありません。先に「招待」タブで作成してください。' : undefined}
            >
              <Select
                placeholder="招待を選択"
                options={usableInvitations.map((inv) => ({
                  value: inv.id,
                  label: `${inv.clientName}（${inv.imageIds.length} 枚・${inv.token.slice(0, 6)}…）`,
                }))}
              />
            </Form.Item>
          ) : (
            <Form.Item
              label="閲覧できる日数"
              name="viewingDays"
              tooltip="1人ずつ発行する招待の閲覧日数です。発行した日から数えます。"
              extra="招待には、送る時点の案件の画像がすべて入ります。"
              rules={[{ required: true, message: '閲覧できる日数を入力してください' }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} max={365} precision={0} addonAfter="日" />
            </Form.Item>
          )}

          <Form.Item
            label="送るタイミング"
            name="deliveryTiming"
            extra="「送信した直後」でも、案件に画像がまだ無ければ受付のメールだけを送ります。その人には後から「未送信の人に URL を送る」で送れます。"
          >
            <Radio.Group
              options={[
                { value: 'onSubmit', label: '参加者が送信した直後に送る' },
                { value: 'later', label: '管理画面からまとめて送る' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
