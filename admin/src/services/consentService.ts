import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { customAlphabet } from 'nanoid';
import { auth, db } from '../lib/firebase';
import { normalizeViewingDays } from '../utils/viewingWindow';
import { createBatchWriter } from '../utils/batchWriter';

/**
 * 写真の受け取りへの同意フォーム。
 *
 * 管理画面はフォームを作り、同意した人の一覧を読み、URL の送信を web に頼む。
 * 参加者の送信を受けて記録を書き、招待を発行し、メールを送るのは web の
 * Route Handler（Admin SDK）で、管理画面からは `consentResponses` を書けない
 * （firestore.rules）。設定の意味は web/src/services/consentService.ts を参照。
 */

/** perPerson: 1 人ずつ専用の招待を発行する。shared: 既存の招待 1 つを全員に送る。 */
export type LinkMode = 'perPerson' | 'shared';
/** onSubmit: 送信した瞬間に URL を送る。later: 管理画面の「まとめて送る」で送る。 */
export type DeliveryTiming = 'onSubmit' | 'later';
export type DeliveryStatus = 'pending' | 'sent' | 'failed';

export interface ConsentForm {
  id: string;
  projectId: string;
  title: string;
  isActive: boolean;
  linkMode: LinkMode;
  sharedInvitationId?: string;
  deliveryTiming: DeliveryTiming;
  viewingDays: number;
  createdBy: string;
  createdAt?: Date;
}

export interface ConsentResponse {
  id: string;
  formId: string;
  companyName: string;
  name: string;
  nameKana: string;
  email: string;
  consentVersion: string;
  agreedAt?: Date;
  deliveryStatus: DeliveryStatus;
  invitationId?: string;
  sentAt?: Date;
  lastError?: string;
}

export type ConsentFormSettings = Pick<
  ConsentForm,
  'title' | 'linkMode' | 'sharedInvitationId' | 'deliveryTiming' | 'viewingDays'
>;

const FORMS_COLLECTION = 'consentForms';
const RESPONSES_COLLECTION = 'consentResponses';

/**
 * フォームの ID は推測できない値にする。フォームの URL を知っていれば、即時送信の
 * 設定ではその場で写真の URL を受け取れるため、URL が招待トークンと同じ重みを持つ。
 * 文字集合は招待トークンと同じ（`_` を含めない。invitationService.ts 参照）。
 */
const generateFormId = customAlphabet(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-',
  21
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const docToForm = (id: string, data: any): ConsentForm => ({
  id,
  projectId: data.projectId,
  title: data.title ?? '',
  isActive: data.isActive === true,
  linkMode: data.linkMode === 'shared' ? 'shared' : 'perPerson',
  sharedInvitationId: data.sharedInvitationId || undefined,
  deliveryTiming: data.deliveryTiming === 'later' ? 'later' : 'onSubmit',
  viewingDays: normalizeViewingDays(data.viewingDays),
  createdBy: data.createdBy ?? '',
  createdAt: data.createdAt?.toDate(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const docToResponse = (id: string, data: any): ConsentResponse => ({
  id,
  formId: data.formId,
  companyName: data.companyName ?? '',
  name: data.name ?? '',
  nameKana: data.nameKana ?? '',
  email: data.email ?? '',
  consentVersion: data.consentVersion ?? '',
  agreedAt: data.agreedAt?.toDate(),
  deliveryStatus: data.deliveryStatus ?? 'pending',
  invitationId: data.invitationId || undefined,
  sentAt: data.sentAt?.toDate(),
  lastError: data.lastError || undefined,
});

const byNewest = <T>(pick: (item: T) => Date | undefined) => (a: T, b: T) =>
  (pick(b)?.getTime() ?? 0) - (pick(a)?.getTime() ?? 0);

/** 並べ替えは手元で行う。orderBy を付けると複合インデックスが要る。 */
export const getConsentFormsByProject = async (projectId: string): Promise<ConsentForm[]> => {
  const snapshot = await getDocs(
    query(collection(db, FORMS_COLLECTION), where('projectId', '==', projectId))
  );
  return snapshot.docs
    .map((d) => docToForm(d.id, d.data()))
    .sort(byNewest((form) => form.createdAt));
};

export const getConsentResponses = async (formId: string): Promise<ConsentResponse[]> => {
  const snapshot = await getDocs(
    query(collection(db, RESPONSES_COLLECTION), where('formId', '==', formId))
  );
  return snapshot.docs
    .map((d) => docToResponse(d.id, d.data()))
    .sort(byNewest((response) => response.agreedAt));
};

const settingsToData = (settings: ConsentFormSettings) => ({
  title: settings.title.trim(),
  linkMode: settings.linkMode,
  // perPerson に切り替えたら共通の招待は持たない。web が誤って読まないように消しておく。
  sharedInvitationId: settings.linkMode === 'shared' ? settings.sharedInvitationId ?? '' : '',
  deliveryTiming: settings.deliveryTiming,
  viewingDays: normalizeViewingDays(settings.viewingDays),
});

export const createConsentForm = async (
  params: ConsentFormSettings & { projectId: string; createdBy: string }
): Promise<ConsentForm> => {
  if (params.linkMode === 'shared' && !params.sharedInvitationId) {
    throw new Error('sharedInvitationId is required for linkMode shared');
  }
  const id = generateFormId();
  const ref = doc(db, FORMS_COLLECTION, id);
  await setDoc(ref, {
    projectId: params.projectId,
    ...settingsToData(params),
    isActive: true,
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  return docToForm(snap.id, snap.data());
};

export const updateConsentForm = async (
  id: string,
  updates: Partial<ConsentFormSettings> & { isActive?: boolean }
): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = { updatedAt: serverTimestamp() };
  if (updates.title !== undefined) data.title = updates.title.trim();
  if (updates.linkMode !== undefined) {
    data.linkMode = updates.linkMode;
    data.sharedInvitationId =
      updates.linkMode === 'shared' ? updates.sharedInvitationId ?? '' : '';
  }
  if (updates.deliveryTiming !== undefined) data.deliveryTiming = updates.deliveryTiming;
  if (updates.viewingDays !== undefined) data.viewingDays = normalizeViewingDays(updates.viewingDays);
  if (updates.isActive !== undefined) data.isActive = updates.isActive;
  await updateDoc(doc(db, FORMS_COLLECTION, id), data);
};

/**
 * 案件のフォームと同意の記録をすべて消す（プロジェクト削除の一部）。
 *
 * 招待より先に呼ぶこと。フォームが生きていると、削除の途中に届いた送信が
 * 新しい招待を作り、消し残しになる。
 */
export const deleteConsentDataForProject = async (projectId: string): Promise<void> => {
  const forms = await getDocs(
    query(collection(db, FORMS_COLLECTION), where('projectId', '==', projectId))
  );
  const writer = createBatchWriter(db);
  for (const form of forms.docs) {
    await writer.delete(doc(db, FORMS_COLLECTION, form.id));
  }
  await writer.flush();

  const responses = await getDocs(
    query(collection(db, RESPONSES_COLLECTION), where('projectId', '==', projectId))
  );
  for (const response of responses.docs) {
    await writer.delete(doc(db, RESPONSES_COLLECTION, response.id));
  }
  await writer.flush();
};

/** 開発機だけで許すホスト。getGalleryUrl と同じ方針。 */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

export const MISSING_WEB_URL_MESSAGE =
  'NEXT_PUBLIC_WEB_URL が設定されていないため、同意フォームの URL を作れません。Vercel の環境変数に本番のギャラリー URL を設定してください。';

/** web（ギャラリー）のオリジン。未設定のまま localhost 以外で推測しない。 */
const webOrigin = (): string => {
  const configured = process.env.NEXT_PUBLIC_WEB_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  if (!LOCAL_HOSTNAMES.has(hostname)) throw new Error(MISSING_WEB_URL_MESSAGE);
  return window.location.origin.replace(':3001', ':3002');
};

/** 参加者に配るフォームの URL。 */
export const getConsentFormUrl = (formId: string): string => `${webOrigin()}/consent/${formId}`;

export interface DeliveryResult {
  sent: number;
  notReady: number;
  failed: number;
  notReadyReason?: 'no_images' | 'shared_invitation_unusable';
}

/**
 * 同意した人に写真の URL を送るよう web に頼む。
 *
 * responseIds を省くと、まだ送れていない人（未送信・失敗）全員に送る。
 * 渡すとその人たちに送り直す。
 */
export const deliverConsent = async (
  formId: string,
  responseIds?: string[]
): Promise<DeliveryResult> => {
  const user = auth.currentUser;
  if (!user) throw new Error('ログインし直してください。');
  const idToken = await user.getIdToken();
  const response = await fetch(`${webOrigin()}/api/consent/deliver`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ formId, responseIds }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(`送信に失敗しました（${response.status} ${body.error ?? ''}）`.trim());
  }
  return (await response.json()) as DeliveryResult;
};
