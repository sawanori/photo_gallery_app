import type { Metadata } from 'next';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getConsentForm } from '@/services/consentService';
import ConsentFormClient from './ConsentFormClient';
import { PAGE_FONT } from './font';

/**
 * 同意フォーム。イベントの参加者がここで同意し、写真の受け取り用 URL をメールで受け取る。
 *
 * フォームの設定は Admin SDK でサーバー側から読む。`consentForms` はルールで
 * クライアントから読めない（共通の招待トークンを持っているため）。
 * 画面に渡すのはイベント名と、同意事項に載せる主催者・会場の名前だけにする。
 *
 * サイト全体の noindex（app/layout.tsx）をそのまま受け継ぐ。
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '写真の受け取りに関する同意書 | NonTurn',
};

export default async function ConsentPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;

  let form = null;
  let loadFailed = false;
  try {
    form = await getConsentForm(getAdminDb(), formId);
  } catch (error) {
    console.error('consent form load failed:', error);
    loadFailed = true;
  }

  if (!form || !form.isActive) {
    return (
      <main
        className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16"
        style={{ fontFamily: PAGE_FONT }}
      >
        <h1 className="text-xl font-medium">
          {loadFailed ? 'フォームを読み込めませんでした' : 'このフォームは受け付けを終了しました'}
        </h1>
        <p className="mt-4 text-[15px] leading-7 text-[var(--color-muted)]">
          {loadFailed
            ? '時間をおいて、もう一度開いてください。'
            : 'お心当たりがある場合は、info@non-turn.com までご連絡ください。'}
        </p>
      </main>
    );
  }

  return (
    <ConsentFormClient formId={form.id} eventTitle={form.title} organizerName={form.organizerName} />
  );
}
