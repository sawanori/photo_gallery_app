/**
 * 写真の受け取りに関する同意事項。
 *
 * フォームの画面と、受付メールの両方がここを読む。**文面を変えたら版を上げること。**
 * 同意の記録（`consentResponses.consentVersion`）にはこの版が残り、
 * 「その人が何に同意したか」を後から辿れるのは版を通してだけである。
 *
 * 2026-11-05 の版はたたき台。公開前に NonTurn が内容を確認する前提で書いている。
 * 2026-11-05-2: 「受け渡しの当事者」（主催者・会場は関与しない）を足した。
 *
 * 文面はフォームの `organizerName`（関与しない主催者・会場の名前）によって一項目変わる。
 * 同意の記録には版と一緒にその名前も残すので、版と名前から文面を再現できる。
 */
export const CONSENT_VERSION = '2026-11-05-2';

export const CONSENT_CONTACT_EMAIL = 'info@non-turn.com';

export interface ConsentClause {
  title: string;
  body: string;
}

/**
 * 写真の受け渡しの当事者。主催者や会場の運営者が受け渡しの相手だと誤解されないように書く。
 * 参加者は主催者に問い合わせがちだが、主催者はこのサービスにも個人情報にも触れない。
 */
function partiesClause(organizerName: string): ConsentClause {
  return {
    title: '写真の受け渡しの当事者',
    body: `写真の受け取りおよび閲覧は、当社とご利用者様との間で行うものです。${organizerName}は、写真の受け渡し、オンラインギャラリーの提供、および本同意でご入力いただく個人情報の取り扱いに関与しません。写真の受け取りに関するお問い合わせは、当社までご連絡ください。`,
  };
}

/** 主催者・会場の名前が無ければ「受け渡しの当事者」の項目を出さない。 */
export function consentClauses(organizerName?: string): ConsentClause[] {
  const name = organizerName?.trim();
  if (!name) return BASE_CLAUSES;
  return [BASE_CLAUSES[0], partiesClause(name), ...BASE_CLAUSES.slice(1)];
}

const BASE_CLAUSES: ConsentClause[] = [
  {
    title: '写真の受け取り',
    body:
      'NonTurn合同会社（以下「当社」）が本イベントで撮影した写真を、当社のオンラインギャラリー（ウェブサイトおよびアプリ「NT-photo」）でお受け取りいただきます。受け取り用の URL は、ご入力いただいたメールアドレスにお送りします。',
  },
  {
    title: '写真の利用',
    body:
      'お受け取りいただいた写真は、ご本人およびご所属企業の社内での利用、ならびにご所属企業の広報（ウェブサイト・SNS 等）にご利用いただけます。写真の販売、第三者への譲渡、写っている方の名誉を損なう加工はできません。',
  },
  {
    title: '他の参加者への配慮',
    body:
      '写真には、他の参加者の方が写っている場合があります。他の方が特定できる形で公開する場合は、その方の了承を得てください。',
  },
  {
    title: '閲覧期限と URL の取り扱い',
    body:
      'ギャラリーは期限を過ぎると閲覧できなくなります。必要な写真は期限内に保存してください。受け取り用の URL は第三者に転送しないでください。',
  },
  {
    title: '個人情報の取り扱い',
    body:
      'ご入力いただいた企業名・氏名・読み仮名・メールアドレスは、写真の受け渡し、本同意の記録、お問い合わせへの対応のためにのみ利用し、法令に基づく場合を除き第三者に提供しません。メールの送信には、配信事業者（Twilio SendGrid）を利用します。',
  },
  {
    title: 'お問い合わせ',
    body: `同意の取り消しや写真の削除のご依頼は、${CONSENT_CONTACT_EMAIL} までご連絡ください。`,
  },
];

/** チェックボックスの文言。 */
export const CONSENT_CHECKBOX_LABEL = '上記の同意事項を確認し、写真の受け取りに同意します';
