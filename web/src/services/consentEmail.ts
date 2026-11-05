import { CONSENT_CLAUSES, CONSENT_CONTACT_EMAIL } from '@/content/consentTerms';
import type { MailMessage } from '@/lib/mailer';

/**
 * 同意フォームのメール。3 通りある。
 *
 * - `accepted` + URL あり: 送信直後。同意を受け付けたことと、受け取り用の URL。
 * - `accepted` + URL なし: 送信直後だが、写真がまだ無いか、後でまとめて送る設定。
 * - `ready`: 後から管理画面で送るとき。写真の用意ができたことと URL。
 *
 * どれにも「受け付けた内容」と同意日時を載せる。参加者の手元に同意の控えが残る。
 */

export interface ConsentEmailInput {
  kind: 'accepted' | 'ready';
  eventTitle: string;
  companyName: string;
  name: string;
  nameKana: string;
  email: string;
  agreedAt: Date;
  consentVersion: string;
  gallery?: { url: string; deadline: Date | null };
}

const SITE_URL = 'https://non-turn.com/';

const dateTimeFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** サーバーは UTC で動くので、必ず日本時間で書く。 */
export function formatJst(date: Date): string {
  return dateTimeFormat.format(date);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 段落の並び。text と html を同じ並びから作り、両者の内容がずれないようにする。 */
type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'heading'; text: string }
  | { type: 'link'; url: string };

function toText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'heading') return `■ ${block.text}`;
      if (block.type === 'link') return block.url;
      return block.lines.join('\n');
    })
    .join('\n\n');
}

function toHtml(blocks: Block[]): string {
  const body = blocks
    .map((block) => {
      if (block.type === 'heading') {
        return `<p style="margin:28px 0 8px;font-weight:bold;">${escapeHtml(block.text)}</p>`;
      }
      if (block.type === 'link') {
        const url = escapeHtml(block.url);
        return `<p style="margin:0 0 16px;"><a href="${url}" style="color:#1a56db;">${url}</a></p>`;
      }
      return `<p style="margin:0 0 16px;">${block.lines.map(escapeHtml).join('<br>')}</p>`;
    })
    .join('\n');
  return `<!doctype html><html lang="ja"><body style="margin:0;padding:24px;font-family:sans-serif;font-size:15px;line-height:1.8;color:#222;">\n${body}\n</body></html>`;
}

export function composeConsentEmail(input: ConsentEmailInput): MailMessage {
  const { gallery } = input;
  const blocks: Block[] = [
    { type: 'p', lines: [input.companyName, `${input.name} 様`] },
  ];

  if (input.kind === 'ready') {
    blocks.push({
      type: 'p',
      lines: ['NonTurn合同会社です。', `「${input.eventTitle}」の写真のご用意ができました。`],
    });
  } else {
    blocks.push({
      type: 'p',
      lines: [
        'NonTurn合同会社です。',
        `「${input.eventTitle}」の写真の受け取りについて、同意書へのチェックを受け付けました。`,
      ],
    });
  }

  blocks.push({ type: 'heading', text: '写真の受け取り' });
  if (gallery) {
    blocks.push({ type: 'p', lines: ['下記の URL から写真をご覧いただけます。'] });
    blocks.push({ type: 'link', url: gallery.url });
    const lines: string[] = [];
    if (gallery.deadline) lines.push(`閲覧期限：${formatJst(gallery.deadline)} まで`);
    lines.push(
      'スマートフォンにアプリ「NT-photo」を入れている場合は、URL を開くとアプリで表示されます。入れていない場合はブラウザで表示されます。',
      'この URL は第三者に転送しないでください。'
    );
    blocks.push({ type: 'p', lines });
  } else {
    blocks.push({
      type: 'p',
      lines: ['写真の準備ができましたら、このメールアドレスに受け取り用の URL をお送りします。'],
    });
  }

  blocks.push({ type: 'heading', text: '受け付けた内容' });
  blocks.push({
    type: 'p',
    lines: [
      `企業名：${input.companyName}`,
      `氏名：${input.name}`,
      `読み仮名：${input.nameKana}`,
      `メールアドレス：${input.email}`,
      `同意日時：${formatJst(input.agreedAt)}`,
      `同意事項：${input.consentVersion} 版`,
    ],
  });

  blocks.push({ type: 'heading', text: '同意事項' });
  CONSENT_CLAUSES.forEach((clause, index) => {
    blocks.push({ type: 'p', lines: [`${index + 1}. ${clause.title}`, clause.body] });
  });

  blocks.push({
    type: 'p',
    lines: [
      `このメールに心当たりがない場合は、お手数ですが ${CONSENT_CONTACT_EMAIL} までご連絡ください。`,
    ],
  });
  blocks.push({ type: 'p', lines: ['NonTurn合同会社', SITE_URL] });

  const subject =
    input.kind === 'ready'
      ? `【NonTurn】写真のご用意ができました｜${input.eventTitle}`
      : `【NonTurn】写真の受け取りへの同意を受け付けました｜${input.eventTitle}`;

  return { to: input.email, subject, text: toText(blocks), html: toHtml(blocks) };
}
