import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { CONSENT_VERSION } from '@/content/consentTerms';
import type { SendMail } from '@/lib/mailer';
import { composeConsentEmail } from '@/services/consentEmail';
import type { ConsentInput } from '@/utils/consentInput';
import { effectiveDeadline, isWithinViewingWindow, normalizeViewingDays } from '@/utils/viewingWindow';

/**
 * 同意フォーム（イベント撮影の写真を受け取ることへの同意）。
 *
 * フォームは管理画面で案件ごとに作る（`consentForms/{formId}`）。設定は 2 つの軸を持つ。
 *
 * - linkMode: 同意した人に送る URL。
 *   - `perPerson`: 1 人ずつ専用の招待を発行する。人ごとに止められる。
 *   - `shared`: 管理画面で作った招待 1 つを全員に送る。
 * - deliveryTiming: いつ送るか。
 *   - `onSubmit`: 送信した瞬間に送る。写真がまだ無ければ受付だけ知らせ、後で送る。
 *   - `later`: 送信時は受付だけ知らせ、管理画面の「まとめて送る」で送る。
 *
 * 同意の記録は `consentResponses/{formId}_{メールアドレスのハッシュ}`。
 * 同じ人が送り直しても記録は 1 件のまま更新し、招待も増やさない。
 * このコレクションはルールでクライアントから一切触れないようにしてあり、
 * 読み書きはこのファイル（Admin SDK）と管理画面（管理者）だけが行う。
 */

export type LinkMode = 'perPerson' | 'shared';
export type DeliveryTiming = 'onSubmit' | 'later';
export type DeliveryStatus = 'pending' | 'sent' | 'failed';

export interface ConsentForm {
  id: string;
  projectId: string;
  title: string;
  /** 写真の受け渡しに関与しない主催者・会場の名前。同意事項に一項目足す。空なら足さない。 */
  organizerName: string;
  isActive: boolean;
  linkMode: LinkMode;
  sharedInvitationId?: string;
  deliveryTiming: DeliveryTiming;
  /** perPerson で発行する招待の閲覧日数。 */
  viewingDays: number;
  createdBy: string;
}

export interface ConsentDeps {
  db: Firestore;
  sendMail: SendMail;
  /** メールに載せるギャラリーのオリジン。例 `https://gallery.non-turn.com` */
  galleryOrigin: string;
  now?: () => Date;
}

const FORMS = 'consentForms';
const RESPONSES = 'consentResponses';
const INVITATIONS = 'invitations';
const IMAGES = 'images';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 管理画面の招待トークンと同じ文字集合（`_` を含めない。admin/src/services/invitationService.ts）。 */
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-';
const TOKEN_LENGTH = 21;

export function generateToken(): string {
  let token = '';
  while (token.length < TOKEN_LENGTH) {
    for (const byte of randomBytes(32)) {
      // 63 文字なので下位 6 ビットを使い、63 は捨てる（偏りを出さない）。
      const index = byte & 63;
      if (index < TOKEN_ALPHABET.length) token += TOKEN_ALPHABET[index];
      if (token.length === TOKEN_LENGTH) break;
    }
  }
  return token;
}

/** 同じフォームに同じメールアドレスで送られたら同じ記録になる ID。 */
export function responseIdFor(formId: string, email: string): string {
  const hash = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32);
  return `${formId}_${hash}`;
}

function toDate(value: unknown): Date | undefined {
  return value instanceof Timestamp ? value.toDate() : undefined;
}

export async function getConsentForm(db: Firestore, formId: string): Promise<ConsentForm | null> {
  const snap = await db.collection(FORMS).doc(formId).get();
  const data = snap.data();
  if (!data) return null;
  return {
    id: snap.id,
    projectId: data.projectId,
    title: data.title ?? '',
    organizerName: typeof data.organizerName === 'string' ? data.organizerName.trim() : '',
    isActive: data.isActive === true,
    linkMode: data.linkMode === 'shared' ? 'shared' : 'perPerson',
    sharedInvitationId: data.sharedInvitationId || undefined,
    deliveryTiming: data.deliveryTiming === 'later' ? 'later' : 'onSubmit',
    viewingDays: normalizeViewingDays(data.viewingDays),
    createdBy: data.createdBy ?? '',
  };
}

interface InvitationState {
  isActive: boolean;
  expiresAt?: Date;
  createdAt?: Date;
  viewingDays?: unknown;
}

/** web の validateInvitation と同じ判定。開けない招待の URL は送らない。 */
function invitationUsable(inv: InvitationState, now: Date): boolean {
  if (!inv.isActive) return false;
  if (inv.expiresAt && now > inv.expiresAt) return false;
  if (inv.createdAt && !isWithinViewingWindow(inv.createdAt, inv.viewingDays, now)) return false;
  return true;
}

async function readInvitation(db: Firestore, token: string): Promise<InvitationState | null> {
  const data = (await db.collection(INVITATIONS).doc(token).get()).data();
  if (!data) return null;
  return {
    isActive: data.isActive === true,
    expiresAt: toDate(data.expiresAt),
    createdAt: toDate(data.createdAt),
    viewingDays: data.viewingDays,
  };
}

/** 案件の画像 ID。管理画面の一覧と同じ並び（新しい順）。 */
async function projectImageIds(db: Firestore, projectId: string): Promise<string[]> {
  const snap = await db
    .collection(IMAGES)
    .where('projectId', '==', projectId)
    .orderBy('createdAt', 'desc')
    .select()
    .get();
  return snap.docs.map((d) => d.id);
}

interface StoredResponse {
  formId: string;
  companyName: string;
  name: string;
  nameKana: string;
  email: string;
  consentVersion: string;
  /** 同意した時点のフォームの organizerName。版と合わせて、同意した文面を再現する。 */
  organizerName: string;
  agreedAt: Date;
  invitationId?: string;
  deliveryStatus: DeliveryStatus;
}

function readResponse(data: DocumentData): StoredResponse {
  return {
    formId: data.formId,
    companyName: data.companyName,
    name: data.name,
    nameKana: data.nameKana,
    email: data.email,
    consentVersion: data.consentVersion,
    organizerName: data.organizerName ?? '',
    agreedAt: toDate(data.agreedAt) ?? new Date(0),
    invitationId: data.invitationId || undefined,
    deliveryStatus: data.deliveryStatus ?? 'pending',
  };
}

type Resolved =
  | { ok: true; token: string; deadline: Date | null }
  | { ok: false; reason: 'no_images' | 'shared_invitation_unusable' };

/**
 * この人に送る招待を決める。必要なら作る。
 *
 * perPerson で既に招待があり、まだ開けるなら作り直さず、画像の選定を案件の今の全画像に
 * 合わせる（後から写真を足した場合に、送り直しで新しい写真まで見えるようにするため）。
 */
async function resolveInvitation(
  deps: ConsentDeps,
  form: ConsentForm,
  responseId: string,
  response: StoredResponse,
  now: Date
): Promise<Resolved> {
  const { db } = deps;

  if (form.linkMode === 'shared') {
    const token = form.sharedInvitationId;
    const inv = token ? await readInvitation(db, token) : null;
    if (!token || !inv || !invitationUsable(inv, now)) {
      return { ok: false, reason: 'shared_invitation_unusable' };
    }
    return { ok: true, token, deadline: effectiveDeadline(inv.createdAt, inv.viewingDays, inv.expiresAt) };
  }

  const imageIds = await projectImageIds(db, form.projectId);
  if (imageIds.length === 0) return { ok: false, reason: 'no_images' };

  if (response.invitationId) {
    const inv = await readInvitation(db, response.invitationId);
    if (inv && invitationUsable(inv, now)) {
      await db.collection(INVITATIONS).doc(response.invitationId).update({
        imageIds,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        ok: true,
        token: response.invitationId,
        deadline: effectiveDeadline(inv.createdAt, inv.viewingDays, inv.expiresAt),
      };
    }
  }

  // 管理画面の createInvitation と同じ形で作る。web はこの形しか読まない。
  const token = generateToken();
  const createdAt = Timestamp.fromDate(now);
  const expiresAt = new Date(now.getTime() + form.viewingDays * DAY_MS);
  await db.collection(INVITATIONS).doc(token).create({
    token,
    projectId: form.projectId,
    clientName: `${response.companyName} ${response.name}`,
    clientEmail: response.email,
    createdBy: form.createdBy,
    imageIds,
    expiresAt: Timestamp.fromDate(expiresAt),
    viewingDays: form.viewingDays,
    likeScope: 'shared',
    isActive: true,
    accessCount: 0,
    consentFormId: form.id,
    consentResponseId: responseId,
    createdAt,
    updatedAt: createdAt,
  });
  return { ok: true, token, deadline: effectiveDeadline(now, form.viewingDays, expiresAt) };
}

export type DeliveryOutcome =
  | { status: 'sent' }
  | { status: 'not_ready'; reason: 'no_images' | 'shared_invitation_unusable' }
  | { status: 'failed'; error: string };

/**
 * 1 人に受け取り用の URL を送る。送れなかった理由は記録に残す。
 *
 * not_ready（写真が無い・共通の招待が開けない）のときは何も送らず、記録も pending のまま。
 */
export async function deliverToResponse(
  deps: ConsentDeps,
  form: ConsentForm,
  responseId: string,
  kind: 'accepted' | 'ready'
): Promise<DeliveryOutcome> {
  const now = deps.now?.() ?? new Date();
  const ref = deps.db.collection(RESPONSES).doc(responseId);
  const data = (await ref.get()).data();
  if (!data || data.formId !== form.id) return { status: 'failed', error: 'response_not_found' };
  const response = readResponse(data);

  let resolved: Resolved;
  try {
    resolved = await resolveInvitation(deps, form, responseId, response, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ref.update({ deliveryStatus: 'failed', lastError: message, updatedAt: FieldValue.serverTimestamp() });
    return { status: 'failed', error: message };
  }
  if (!resolved.ok) return { status: 'not_ready', reason: resolved.reason };

  // 招待を決めた時点で記録する。メールが失敗しても、次の送り直しで同じ招待を使える。
  if (form.linkMode === 'perPerson' && response.invitationId !== resolved.token) {
    await ref.update({ invitationId: resolved.token, updatedAt: FieldValue.serverTimestamp() });
  }

  const message = composeConsentEmail({
    kind,
    eventTitle: form.title,
    ...response,
    gallery: { url: `${deps.galleryOrigin}/gallery/${resolved.token}`, deadline: resolved.deadline },
  });

  try {
    await deps.sendMail(message);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    console.error('consent mail failed:', messageText);
    await ref.update({ deliveryStatus: 'failed', lastError: messageText, updatedAt: FieldValue.serverTimestamp() });
    return { status: 'failed', error: messageText };
  }

  await ref.update({
    deliveryStatus: 'sent',
    invitationId: resolved.token,
    sentAt: Timestamp.fromDate(now),
    lastError: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { status: 'sent' };
}

export type SubmitResult =
  | { ok: true; delivered: boolean }
  | { ok: false; code: 'form_closed' | 'mail_failed'; status: number };

/**
 * フォームの送信を受け付ける。入力は検証済みであること。
 *
 * 同意の記録を先に書く。メールが送れなくても、同意したという事実は残す。
 */
export async function submitConsent(
  deps: ConsentDeps,
  formId: string,
  input: ConsentInput
): Promise<SubmitResult> {
  const now = deps.now?.() ?? new Date();
  const form = await getConsentForm(deps.db, formId);
  if (!form || !form.isActive) return { ok: false, code: 'form_closed', status: 404 };

  const responseId = responseIdFor(formId, input.email);
  const ref = deps.db.collection(RESPONSES).doc(responseId);
  const existing = (await ref.get()).data();
  const alreadySent = existing?.deliveryStatus === 'sent';

  await ref.set(
    {
      formId,
      projectId: form.projectId,
      companyName: input.companyName,
      name: input.name,
      nameKana: input.nameKana,
      email: input.email,
      consentVersion: CONSENT_VERSION,
      organizerName: form.organizerName,
      agreedAt: Timestamp.fromDate(now),
      ...(existing ? {} : { createdAt: Timestamp.fromDate(now), deliveryStatus: 'pending' }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // 送り直し（一度 URL を受け取った人がもう一度送信した）なら、後で送る設定でも URL を返す。
  if (form.deliveryTiming === 'onSubmit' || alreadySent) {
    const outcome = await deliverToResponse(deps, form, responseId, 'accepted');
    if (outcome.status === 'sent') return { ok: true, delivered: true };
    if (outcome.status === 'failed') return { ok: false, code: 'mail_failed', status: 502 };
  }

  // URL をまだ送れない。受け付けたことだけ知らせる。
  const stored = readResponse((await ref.get()).data()!);
  try {
    await deps.sendMail(composeConsentEmail({ kind: 'accepted', eventTitle: form.title, ...stored }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('consent receipt mail failed:', message);
    return { ok: false, code: 'mail_failed', status: 502 };
  }
  return { ok: true, delivered: false };
}

export interface BulkDeliveryResult {
  sent: number;
  notReady: number;
  failed: number;
  /** not_ready のときの理由。全員同じになるので 1 つだけ返す。 */
  notReadyReason?: 'no_images' | 'shared_invitation_unusable';
}

/**
 * 管理画面の「まとめて送る」。
 *
 * responseIds を渡さなければ、まだ送れていない人（pending / failed）全員に送る。
 * 渡せば、その人たちに送り直す（送信済みでも）。
 */
export async function deliverForForm(
  deps: ConsentDeps,
  formId: string,
  responseIds?: string[]
): Promise<BulkDeliveryResult | null> {
  const form = await getConsentForm(deps.db, formId);
  if (!form) return null;

  let targets: string[];
  if (responseIds) {
    targets = responseIds;
  } else {
    const snap = await deps.db.collection(RESPONSES).where('formId', '==', formId).get();
    targets = snap.docs.filter((d) => d.data().deliveryStatus !== 'sent').map((d) => d.id);
  }

  const result: BulkDeliveryResult = { sent: 0, notReady: 0, failed: 0 };
  // SendGrid と Firestore を詰まらせない程度に並べる。
  const CONCURRENCY = 5;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const outcomes = await Promise.all(
      targets.slice(i, i + CONCURRENCY).map((id) => deliverToResponse(deps, form, id, 'ready'))
    );
    for (const outcome of outcomes) {
      if (outcome.status === 'sent') result.sent += 1;
      else if (outcome.status === 'failed') result.failed += 1;
      else {
        result.notReady += 1;
        result.notReadyReason = outcome.reason;
      }
    }
  }
  return result;
}
