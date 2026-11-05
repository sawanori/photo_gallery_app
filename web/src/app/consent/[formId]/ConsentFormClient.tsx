'use client';

import { useState, type FormEvent } from 'react';
import {
  CONSENT_CHECKBOX_LABEL,
  CONSENT_CLAUSES,
  CONSENT_CONTACT_EMAIL,
} from '@/content/consentTerms';
import {
  hasErrors,
  MAX_LENGTH,
  normalizeConsentInput,
  validateConsentInput,
  type ConsentErrors,
  type ConsentField,
  type ConsentInput,
} from '@/utils/consentInput';
import { PAGE_FONT } from './font';

interface Props {
  formId: string;
  eventTitle: string;
}

type Phase =
  | { kind: 'editing' }
  | { kind: 'submitting' }
  | { kind: 'done'; delivered: boolean; email: string };

const FIELDS: {
  field: ConsentField;
  label: string;
  type: 'text' | 'email';
  autoComplete: string;
  placeholder: string;
}[] = [
  { field: 'companyName', label: '企業名', type: 'text', autoComplete: 'organization', placeholder: '株式会社〇〇' },
  { field: 'name', label: '氏名', type: 'text', autoComplete: 'name', placeholder: '山田 太郎' },
  { field: 'nameKana', label: '読み仮名', type: 'text', autoComplete: 'off', placeholder: 'やまだ たろう' },
  { field: 'email', label: 'メールアドレス', type: 'email', autoComplete: 'email', placeholder: 'taro@example.com' },
];

/** サーバーの返すエラーコードを、参加者が次にとる行動の分かる文にする。 */
function submitErrorMessage(code: string | undefined, status: number): string {
  if (code === 'rate_limited') return '送信が続いたため、受け付けを一時的に止めています。数分おいてから、もう一度送信してください。';
  if (code === 'form_closed') return 'このフォームは受け付けを終了しました。';
  if (code === 'mail_failed') {
    return `同意は受け付けましたが、メールを送れませんでした。時間をおいてもう一度送信するか、${CONSENT_CONTACT_EMAIL} までご連絡ください。`;
  }
  if (status === 400) return '入力内容を確認してください。';
  return '送信できませんでした。時間をおいて、もう一度送信してください。';
}

export default function ConsentFormClient({ formId, eventTitle }: Props) {
  const [values, setValues] = useState<ConsentInput>({ companyName: '', name: '', nameKana: '', email: '' });
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<ConsentErrors>({});
  const [agreeError, setAgreeError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'editing' });

  const update = (field: ConsentField, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // 直した項目のエラーだけを消す。他の項目のエラーは残す。
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase.kind === 'submitting') return;

    const input = normalizeConsentInput(values);
    const found = validateConsentInput(input);
    setErrors(found);
    setAgreeError(!agreed);
    setSubmitError(null);
    if (hasErrors(found) || !agreed) return;

    setPhase({ kind: 'submitting' });
    try {
      const response = await fetch(`/api/consent/${encodeURIComponent(formId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, agreed: true }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        delivered?: boolean;
        error?: string;
        errors?: ConsentErrors;
      };
      if (response.ok) {
        setPhase({ kind: 'done', delivered: body.delivered === true, email: input.email });
        return;
      }
      if (body.errors) setErrors(body.errors);
      setSubmitError(submitErrorMessage(body.error, response.status));
    } catch {
      setSubmitError('通信できませんでした。電波の届く場所で、もう一度送信してください。');
    }
    setPhase({ kind: 'editing' });
  };

  if (phase.kind === 'done') {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-6 py-16" style={{ fontFamily: PAGE_FONT }}>
        <p className="text-sm text-[var(--color-muted)]">{eventTitle}</p>
        <h1 className="mt-3 text-2xl font-medium leading-snug">同意を受け付けました</h1>
        <div className="mt-6 space-y-4 text-[15px] leading-7">
          <p>
            <span className="font-medium">{phase.email}</span> にメールをお送りしました。
          </p>
          <p>
            {phase.delivered
              ? 'メールに写真を見るための URL を載せています。スマートフォンにアプリ「NT-photo」を入れている場合は、URL を開くとアプリで表示されます。'
              : '写真の準備ができましたら、同じメールアドレスに写真を見るための URL をお送りします。'}
          </p>
          <p className="text-[var(--color-muted)]">
            メールが届かない場合は、迷惑メールのフォルダを確認してください。それでも見つからない場合は、
            {CONSENT_CONTACT_EMAIL} までご連絡ください。
          </p>
        </div>
      </main>
    );
  }

  const submitting = phase.kind === 'submitting';

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12 sm:py-16" style={{ fontFamily: PAGE_FONT }}>
      <p className="text-sm text-[var(--color-muted)]">{eventTitle}</p>
      <h1 className="mt-3 text-2xl font-medium leading-snug">写真の受け取りに関する同意書</h1>
      <p className="mt-4 text-[15px] leading-7">
        NonTurn合同会社が撮影した写真を、オンラインでお受け取りいただくための同意書です。
        下の同意事項をお読みのうえ、ご入力ください。写真を見るための URL を、ご入力いただいたメールアドレスにお送りします。
      </p>

      <section aria-labelledby="clauses-heading" className="mt-10">
        <h2 id="clauses-heading" className="text-lg font-medium">
          同意事項
        </h2>
        <ol className="mt-4 space-y-5 rounded-lg bg-[var(--color-surface)] px-5 py-6">
          {CONSENT_CLAUSES.map((clause, index) => (
            <li key={clause.title}>
              <p className="text-[15px] font-medium">
                {index + 1}. {clause.title}
              </p>
              <p className="mt-1 text-sm leading-7">{clause.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <form onSubmit={handleSubmit} noValidate className="mt-10">
        <h2 className="text-lg font-medium">ご入力</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">すべての項目が必須です。</p>

        <div className="mt-6 space-y-6">
          {FIELDS.map(({ field, label, type, autoComplete, placeholder }) => {
            const id = `consent-${field}`;
            const error = errors[field];
            return (
              <div key={field}>
                <label htmlFor={id} className="block text-[15px] font-medium">
                  {label}
                </label>
                <input
                  id={id}
                  name={field}
                  type={type}
                  inputMode={type === 'email' ? 'email' : undefined}
                  autoComplete={autoComplete}
                  placeholder={placeholder}
                  maxLength={MAX_LENGTH[field]}
                  value={values[field]}
                  onChange={(e) => update(field, e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  disabled={submitting}
                  // 16px 未満だと iOS が入力のたびに画面を拡大する。
                  className={`mt-2 block w-full rounded-md border bg-white px-3 py-3 text-base outline-none transition-colors focus:border-[var(--color-accent)] disabled:opacity-60 ${
                    error ? 'border-red-600' : 'border-[var(--color-border)]'
                  }`}
                />
                {error && (
                  <p id={`${id}-error`} className="mt-2 text-sm text-red-700">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8">
          <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-7">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (e.target.checked) setAgreeError(false);
              }}
              disabled={submitting}
              aria-invalid={agreeError ? true : undefined}
              aria-describedby={agreeError ? 'consent-agree-error' : undefined}
              className="mt-1.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]"
            />
            <span>{CONSENT_CHECKBOX_LABEL}</span>
          </label>
          {agreeError && (
            <p id="consent-agree-error" className="mt-2 text-sm text-red-700">
              同意事項を確認し、チェックを入れてください
            </p>
          )}
        </div>

        {submitError && (
          <p role="alert" className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-8 w-full rounded-md bg-[var(--color-ink)] px-4 py-4 text-base font-medium text-white transition-opacity disabled:opacity-60"
        >
          {submitting ? '送信しています…' : '同意して送信する'}
        </button>
      </form>
    </main>
  );
}
