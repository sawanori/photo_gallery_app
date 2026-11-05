// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { MailMessage } from '@/lib/mailer';
import { deliverForForm, responseIdFor, submitConsent, type ConsentDeps } from './consentService';

/**
 * 同意フォームのサーバー処理を、Firestore エミュレータに対して通しで確かめる。
 *
 * エミュレータが無いときは飛ばす。走らせるには:
 *   cd rules-tests && npx firebase emulators:exec --config ../firebase.json \
 *     --only firestore --project demo-photo-gallery "cd ../web && npx vitest run consentService.emulator"
 */

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'demo-photo-gallery';
const ORIGIN = 'https://gallery.example.com';
const NOW = new Date('2026-11-10T03:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const input = {
  companyName: '株式会社サンプル',
  name: '山田 太郎',
  nameKana: 'やまだ たろう',
  email: 'Taro@Example.com',
};

describe.skipIf(!EMULATOR)('consentService（エミュレータ）', () => {
  const app = initializeApp({ projectId: PROJECT }, `consent-test-${Date.now()}`);
  const db = getFirestore(app);
  let sent: MailMessage[];
  let deps: ConsentDeps;

  const seedForm = (id: string, data: Record<string, unknown>) =>
    db.collection('consentForms').doc(id).set({
      projectId: 'project-1',
      title: '秋の交流会',
      isActive: true,
      linkMode: 'perPerson',
      deliveryTiming: 'onSubmit',
      viewingDays: 14,
      createdBy: 'admin-uid',
      ...data,
    });

  const seedImages = async (count: number) => {
    for (let i = 0; i < count; i++) {
      await db.collection('images').doc(`img-${i}`).set({
        projectId: 'project-1',
        createdAt: Timestamp.fromMillis(NOW.getTime() - (i + 1) * 60_000),
      });
    }
  };

  const response = (formId: string) =>
    db.collection('consentResponses').doc(responseIdFor(formId, input.email)).get();

  beforeEach(async () => {
    await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
      method: 'DELETE',
    });
    sent = [];
    deps = {
      db,
      galleryOrigin: ORIGIN,
      now: () => NOW,
      sendMail: async (message) => {
        sent.push(message);
      },
    };
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  it('1人ずつ・即時: 同意を記録し、専用の招待を作って URL を送る', async () => {
    await seedForm('form-a', {});
    await seedImages(3);

    const result = await submitConsent(deps, 'form-a', input);
    expect(result).toEqual({ ok: true, delivered: true });

    const stored = (await response('form-a')).data()!;
    expect(stored).toMatchObject({
      formId: 'form-a',
      projectId: 'project-1',
      companyName: '株式会社サンプル',
      nameKana: 'やまだ たろう',
      deliveryStatus: 'sent',
    });
    const token = stored.invitationId as string;
    expect(token).toMatch(/^[A-Za-z0-9-]{21}$/);

    const invitation = (await db.collection('invitations').doc(token).get()).data()!;
    expect(invitation).toMatchObject({
      token,
      projectId: 'project-1',
      clientEmail: 'Taro@Example.com',
      isActive: true,
      viewingDays: 14,
      likeScope: 'shared',
      accessCount: 0,
      consentFormId: 'form-a',
    });
    // 管理画面の一覧と同じ、新しい順。
    expect(invitation.imageIds).toEqual(['img-0', 'img-1', 'img-2']);
    expect((invitation.expiresAt as Timestamp).toMillis()).toBe(NOW.getTime() + 14 * DAY_MS);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('Taro@Example.com');
    expect(sent[0].subject).toContain('同意を受け付けました');
    expect(sent[0].text).toContain(`${ORIGIN}/gallery/${token}`);
    expect(sent[0].text).toContain('企業名：株式会社サンプル');
  });

  it('同じ人が送り直しても、記録も招待も増やさない（大文字小文字の違いも同じ人）', async () => {
    await seedForm('form-a', {});
    await seedImages(1);

    await submitConsent(deps, 'form-a', input);
    const first = (await response('form-a')).data()!.invitationId;
    await submitConsent(deps, 'form-a', { ...input, email: 'taro@example.com' });

    expect((await db.collection('consentResponses').get()).size).toBe(1);
    expect((await db.collection('invitations').get()).size).toBe(1);
    expect((await response('form-a')).data()!.invitationId).toBe(first);
    expect(sent).toHaveLength(2);
    expect(sent[1].text).toContain(`/gallery/${first}`);
  });

  it('写真がまだ無ければ、受付のメールだけ送り、後でまとめて送れる', async () => {
    await seedForm('form-a', {});

    expect(await submitConsent(deps, 'form-a', input)).toEqual({ ok: true, delivered: false });
    expect((await response('form-a')).data()!.deliveryStatus).toBe('pending');
    expect((await db.collection('invitations').get()).size).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).not.toContain('/gallery/');
    expect(sent[0].text).toContain('写真の準備ができましたら');

    await seedImages(2);
    const bulk = await deliverForForm(deps, 'form-a');
    expect(bulk).toEqual({ sent: 1, notReady: 0, failed: 0 });
    expect(sent[1].subject).toContain('写真のご用意ができました');
    expect((await response('form-a')).data()!.deliveryStatus).toBe('sent');

    // 送信済みの人には、指定しない限り二度送らない。
    expect(await deliverForForm(deps, 'form-a')).toEqual({ sent: 0, notReady: 0, failed: 0 });
  });

  it('後で送る設定なら、写真があっても送信時は受付だけ知らせる', async () => {
    await seedForm('form-b', { deliveryTiming: 'later' });
    await seedImages(1);

    expect(await submitConsent(deps, 'form-b', input)).toEqual({ ok: true, delivered: false });
    expect((await db.collection('invitations').get()).size).toBe(0);
    expect(sent[0].text).not.toContain('/gallery/');
  });

  it('共通 URL: 管理画面で作った招待をそのまま送り、招待を作らない', async () => {
    await db.collection('invitations').doc('shared-token').set({
      token: 'shared-token',
      projectId: 'project-1',
      imageIds: ['img-0'],
      isActive: true,
      viewingDays: 30,
      createdAt: Timestamp.fromMillis(NOW.getTime() - DAY_MS),
      expiresAt: Timestamp.fromMillis(NOW.getTime() + 60 * DAY_MS),
    });
    await seedForm('form-c', { linkMode: 'shared', sharedInvitationId: 'shared-token' });

    expect(await submitConsent(deps, 'form-c', input)).toEqual({ ok: true, delivered: true });
    expect((await db.collection('invitations').get()).size).toBe(1);
    expect(sent[0].text).toContain(`${ORIGIN}/gallery/shared-token`);
  });

  it('共通 URL の招待が無効なら URL を送らず、まとめて送るときに理由を返す', async () => {
    await db.collection('invitations').doc('shared-token').set({
      token: 'shared-token',
      projectId: 'project-1',
      imageIds: ['img-0'],
      isActive: false,
      createdAt: Timestamp.fromMillis(NOW.getTime() - DAY_MS),
      expiresAt: Timestamp.fromMillis(NOW.getTime() + 60 * DAY_MS),
    });
    await seedForm('form-c', { linkMode: 'shared', sharedInvitationId: 'shared-token' });

    expect(await submitConsent(deps, 'form-c', input)).toEqual({ ok: true, delivered: false });
    expect(sent[0].text).not.toContain('/gallery/');
    expect(await deliverForForm(deps, 'form-c')).toEqual({
      sent: 0,
      notReady: 1,
      failed: 0,
      notReadyReason: 'shared_invitation_unusable',
    });
  });

  it('受け付けを止めたフォームには記録を残さない', async () => {
    await seedForm('form-a', { isActive: false });
    expect(await submitConsent(deps, 'form-a', input)).toEqual({
      ok: false,
      code: 'form_closed',
      status: 404,
    });
    expect((await db.collection('consentResponses').get()).size).toBe(0);
    expect(await submitConsent(deps, 'missing', input)).toMatchObject({ code: 'form_closed' });
  });

  it('メールが送れなくても同意は残し、失敗として記録する。送り直しで同じ招待を使う', async () => {
    await seedForm('form-a', {});
    await seedImages(1);
    const failing: ConsentDeps = {
      ...deps,
      sendMail: vi.fn().mockRejectedValue(new Error('SendGrid が 500 を返しました')),
    };

    expect(await submitConsent(failing, 'form-a', input)).toEqual({
      ok: false,
      code: 'mail_failed',
      status: 502,
    });
    const stored = (await response('form-a')).data()!;
    expect(stored.deliveryStatus).toBe('failed');
    expect(stored.lastError).toContain('500');
    const token = stored.invitationId;
    expect(token).toBeTruthy();

    expect(await deliverForForm(deps, 'form-a')).toEqual({ sent: 1, notReady: 0, failed: 0 });
    expect((await db.collection('invitations').get()).size).toBe(1);
    expect(sent[0].text).toContain(`/gallery/${token}`);
    expect((await response('form-a')).data()!.lastError).toBeUndefined();
  });

  it('送り直しのとき、後から足した写真も見られるよう招待の画像を今の全画像に合わせる', async () => {
    await seedForm('form-a', {});
    await seedImages(1);
    await submitConsent(deps, 'form-a', input);
    const token = (await response('form-a')).data()!.invitationId;

    await seedImages(3);
    await deliverForForm(deps, 'form-a', [responseIdFor('form-a', input.email)]);
    const invitation = (await db.collection('invitations').doc(token).get()).data()!;
    expect(invitation.imageIds).toEqual(['img-0', 'img-1', 'img-2']);
  });
});
