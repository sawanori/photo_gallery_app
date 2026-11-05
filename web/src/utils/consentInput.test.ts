import { describe, expect, it } from 'vitest';
import { normalizeConsentInput, validateConsentInput } from './consentInput';

const valid = {
  companyName: '株式会社サンプル',
  name: '山田 太郎',
  nameKana: 'ヤマダ タロウ',
  email: 'taro@example.com',
};

describe('normalizeConsentInput', () => {
  it('前後の空白を落とし、全角空白を含む連続空白を半角 1 つにする', () => {
    const input = normalizeConsentInput({ ...valid, name: '　山田　　太郎 ' });
    expect(input.name).toBe('山田 太郎');
  });

  it('メールアドレスの空白は取り除く', () => {
    expect(normalizeConsentInput({ ...valid, email: ' taro @example.com ' }).email).toBe(
      'taro@example.com'
    );
  });

  it('文字列でない値は空文字にする', () => {
    expect(normalizeConsentInput({ companyName: 1, name: null })).toEqual({
      companyName: '',
      name: '',
      nameKana: '',
      email: '',
    });
    expect(normalizeConsentInput('nope').email).toBe('');
  });
});

describe('validateConsentInput', () => {
  it('正しい入力にはエラーを返さない', () => {
    expect(validateConsentInput(normalizeConsentInput(valid))).toEqual({});
  });

  it('4 項目すべてを必須にする', () => {
    const errors = validateConsentInput(normalizeConsentInput({}));
    expect(Object.keys(errors).sort()).toEqual(['companyName', 'email', 'name', 'nameKana']);
  });

  it('読み仮名はひらがなでもカタカナでも受け付ける', () => {
    for (const nameKana of ['やまだ たろう', 'ヤマダ・タロー', 'やまだ　タロウ']) {
      expect(validateConsentInput(normalizeConsentInput({ ...valid, nameKana }))).toEqual({});
    }
  });

  it('読み仮名に漢字やローマ字があれば止める', () => {
    for (const nameKana of ['山田 たろう', 'Yamada']) {
      expect(validateConsentInput(normalizeConsentInput({ ...valid, nameKana })).nameKana).toBe(
        '読み仮名はひらがなかカタカナで入力してください'
      );
    }
  });

  it('メールアドレスの形が崩れていれば止める', () => {
    for (const email of ['taro', 'taro@example', '@example.com']) {
      expect(validateConsentInput(normalizeConsentInput({ ...valid, email })).email).toBe(
        'メールアドレスの形式が正しくありません'
      );
    }
  });

  it('上限を超える長さを止める', () => {
    const errors = validateConsentInput(
      normalizeConsentInput({ ...valid, companyName: 'あ'.repeat(101) })
    );
    expect(errors.companyName).toBe('100 文字以内で入力してください');
  });
});
