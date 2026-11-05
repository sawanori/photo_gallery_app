/**
 * メール送信。SendGrid の v3 API を fetch で直接叩く（SDK は入れない）。
 *
 * 送信元は NonTurn 本体のサイトと同じ `info@non-turn.com`（SendGrid で認証済みの送信者）。
 *
 * `MAIL_TRANSPORT=log` のときは送らずにコンソールへ出す。開発機で同意フォームを
 * 試すためのもので、**本番（NODE_ENV=production）では効かない。** 本番で鍵が無ければ
 * 送信は失敗として扱い、送れたことにはしない。
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendMail = (message: MailMessage) => Promise<void>;

const SENDGRID_ENDPOINT = 'https://api.sendgrid.com/v3/mail/send';
const DEFAULT_FROM = 'info@non-turn.com';
const DEFAULT_FROM_NAME = 'NonTurn';

export const sendMail: SendMail = async (message) => {
  if (process.env.MAIL_TRANSPORT === 'log' && process.env.NODE_ENV !== 'production') {
    console.info(`[mail:log] to=${message.to} subject=${message.subject}\n${message.text}`);
    return;
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error('SENDGRID_API_KEY が設定されていません。');

  const from = process.env.MAIL_FROM ?? DEFAULT_FROM;
  const response = await fetch(SENDGRID_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: message.to }] }],
      from: { email: from, name: process.env.MAIL_FROM_NAME ?? DEFAULT_FROM_NAME },
      reply_to: { email: from },
      subject: message.subject,
      content: [
        { type: 'text/plain', value: message.text },
        { type: 'text/html', value: message.html },
      ],
    }),
  });

  // SendGrid は受け付けると 202 を返す。本文に鍵などは含まれないので、そのまま残す。
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`SendGrid が ${response.status} を返しました: ${detail.slice(0, 300)}`);
  }
};
