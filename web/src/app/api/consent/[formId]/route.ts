import { NextRequest, NextResponse } from 'next/server';
import { consentDeps } from '@/lib/consentServer';
import { createRateLimiter } from '@/lib/rateLimiter';
import { submitConsent } from '@/services/consentService';
import { hasErrors, normalizeConsentInput, validateConsentInput } from '@/utils/consentInput';

/**
 * 同意フォームの送信。
 *
 * 受け付けると同意を記録し、設定に応じて受け取り用の URL をメールで送る。
 * URL を画面には返さない。メールアドレスに届くことが受け取りの条件である。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'hnd1';

/**
 * 1 インスタンスあたりの減速帯。送信のたびにメールが 1 通出るので、
 * 第三者のアドレスを並べて送り付ける使い方を鈍らせる。
 * 受付に 1 台の端末を置いて参加者が順に入力する場合を考え、上限は広めに取る。
 */
const limiter = createRateLimiter({ windowMs: 10 * 60_000, max: 60 });

const MAX_FORM_ID_LENGTH = 64;

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : 'unknown';
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  const { formId } = await params;
  if (!formId || formId.length > MAX_FORM_ID_LENGTH || formId.includes('/')) {
    return json({ error: 'bad_request' }, 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const agreed = (body as { agreed?: unknown } | null)?.agreed === true;
  const input = normalizeConsentInput(body);
  const errors = validateConsentInput(input);
  if (!agreed || hasErrors(errors)) {
    return json({ error: 'invalid_input', errors, agreed }, 400);
  }

  if (limiter.check(clientKey(request), Date.now())) {
    return json({ error: 'rate_limited' }, 429);
  }

  try {
    const result = await submitConsent(consentDeps(request.nextUrl.origin), formId, input);
    if (!result.ok) return json({ error: result.code }, result.status);
    return json({ delivered: result.delivered }, 200);
  } catch (error) {
    console.error('consent submission failed:', error);
    return json({ error: 'internal_error' }, 500);
  }
}
