import { describe, expect, it } from 'vitest';
import { consentClauses } from './consentTerms';

describe('consentClauses', () => {
  it('主催者・会場の名前が無ければ、受け渡しの当事者の項目を出さない', () => {
    const titles = consentClauses().map((c) => c.title);
    expect(titles).not.toContain('写真の受け渡しの当事者');
    expect(consentClauses('  ')).toEqual(consentClauses());
  });

  it('名前があれば 2 項目目に入れ、その名前が関与しないことを書く', () => {
    const clauses = consentClauses('WWJ株式会社');
    expect(clauses).toHaveLength(consentClauses().length + 1);
    expect(clauses[1].title).toBe('写真の受け渡しの当事者');
    expect(clauses[1].body).toContain('当社とご利用者様との間で行うものです');
    expect(clauses[1].body).toContain('WWJ株式会社は');
    expect(clauses[1].body).toContain('関与しません');
  });
});
