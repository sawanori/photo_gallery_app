/**
 * 同意フォームの入力の検証と正規化。
 *
 * 画面（送信前の案内）と Route Handler（受け付けるかの判定）の両方で使う。
 * 判定は Route Handler 側が正であり、画面側はそれを先に教えるだけである。
 */

export interface ConsentInput {
  companyName: string;
  name: string;
  nameKana: string;
  email: string;
}

export type ConsentField = keyof ConsentInput;

export type ConsentErrors = Partial<Record<ConsentField, string>>;

export const MAX_LENGTH: Record<ConsentField, number> = {
  companyName: 100,
  name: 50,
  nameKana: 100,
  email: 254,
};

/**
 * 読み仮名に使える文字。ひらがな・カタカナ・長音・中黒・空白。
 * どちらの仮名で書いてもらっても受け付け、入力どおりに保存する。
 */
const KANA_PATTERN = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+$/u;

/**
 * メールアドレスの形。厳密な RFC 判定はせず、明らかな打ち間違いだけを止める。
 * 届くかどうかは送ってみるまで分からない。
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 前後の空白を落とし、連続する空白（全角を含む）を半角 1 つにまとめる。 */
function squash(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\s　]+/g, ' ').trim();
}

export function normalizeConsentInput(raw: unknown): ConsentInput {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    companyName: squash(source.companyName),
    name: squash(source.name),
    nameKana: squash(source.nameKana),
    // メールアドレスは空白を含められない。大文字小文字は重複判定のときだけそろえる。
    email: squash(source.email).replace(/\s/g, ''),
  };
}

export function validateConsentInput(input: ConsentInput): ConsentErrors {
  const errors: ConsentErrors = {};

  if (!input.companyName) errors.companyName = '企業名を入力してください';
  if (!input.name) errors.name = '氏名を入力してください';

  if (!input.nameKana) {
    errors.nameKana = '読み仮名を入力してください';
  } else if (!KANA_PATTERN.test(input.nameKana)) {
    errors.nameKana = '読み仮名はひらがなかカタカナで入力してください';
  }

  if (!input.email) {
    errors.email = 'メールアドレスを入力してください';
  } else if (!EMAIL_PATTERN.test(input.email)) {
    errors.email = 'メールアドレスの形式が正しくありません';
  }

  for (const field of Object.keys(MAX_LENGTH) as ConsentField[]) {
    if (!errors[field] && input[field].length > MAX_LENGTH[field]) {
      errors[field] = `${MAX_LENGTH[field]} 文字以内で入力してください`;
    }
  }

  return errors;
}

export function hasErrors(errors: ConsentErrors): boolean {
  return Object.keys(errors).length > 0;
}
