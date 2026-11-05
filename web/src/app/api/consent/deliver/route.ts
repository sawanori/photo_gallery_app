import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { consentDeps } from '@/lib/consentServer';
import { deliverForForm } from '@/services/consentService';

/**
 * 管理画面の「同意した人に URL を送る」。
 *
 * 管理画面のブラウザから直接呼ばれる。管理画面は別のドメインなので CORS を返す。
 * 認可は Firebase の ID トークン（Authorization ヘッダ）で行い、`users/{uid}.role` が
 * `admin` の人だけを通す。判定は管理画面の AuthContext・Firestore ルールの isAdmin() と同じ。
 * Cookie は使わないので、他のサイトから踏ませても送信は起きない。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'hnd1';
export const maxDuration = 60;

const MAX_RESPONSE_IDS = 500;

const LOCAL_ADMIN_ORIGIN = 'http://localhost:3001';

/** 呼び出しを許す管理画面のオリジン。本番は `ADMIN_ORIGIN` で指定する。 */
function allowedOrigin(): string | null {
  const configured = process.env.ADMIN_ORIGIN?.replace(/\/+$/, '');
  if (configured) return configured;
  return process.env.NODE_ENV === 'production' ? null : LOCAL_ADMIN_ORIGIN;
}

function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin');
  const allowed = allowedOrigin();
  if (!origin || origin !== allowed) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function json(request: NextRequest, body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...corsHeaders(request) },
  });
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

async function isAdminRequest(request: NextRequest): Promise<boolean> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  try {
    const { uid } = await getAdminAuth().verifyIdToken(match[1]);
    const user = await getAdminDb().collection('users').doc(uid).get();
    return user.data()?.role === 'admin';
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return json(request, { error: 'forbidden' }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: 'bad_request' }, 400);
  }

  const { formId, responseIds } = (body ?? {}) as { formId?: unknown; responseIds?: unknown };
  if (typeof formId !== 'string' || formId.length === 0 || formId.includes('/')) {
    return json(request, { error: 'bad_request' }, 400);
  }
  if (
    responseIds !== undefined &&
    !(
      Array.isArray(responseIds) &&
      responseIds.length <= MAX_RESPONSE_IDS &&
      responseIds.every((id) => typeof id === 'string' && id.startsWith(`${formId}_`))
    )
  ) {
    return json(request, { error: 'bad_request' }, 400);
  }

  try {
    const result = await deliverForForm(
      consentDeps(request.nextUrl.origin),
      formId,
      responseIds as string[] | undefined
    );
    if (!result) return json(request, { error: 'not_found' }, 404);
    return json(request, result, 200);
  } catch (error) {
    console.error('consent delivery failed:', error);
    return json(request, { error: 'internal_error' }, 500);
  }
}
