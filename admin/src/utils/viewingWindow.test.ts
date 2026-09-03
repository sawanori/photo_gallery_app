import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VIEWING_DAYS,
  effectiveDeadline,
  normalizeViewingDays,
  viewingDeadline,
} from './viewingWindow';

/**
 * `web/src/utils/viewingWindow.ts` の写し。**web を変えたらここも変える。**
 * ずれると管理画面の表示と、クライアントが実際に見られる期限が食い違う。
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

describe('normalizeViewingDays', () => {
  it('1以上の整数はそのまま使う', () => {
    expect(normalizeViewingDays(1)).toBe(1);
    expect(normalizeViewingDays(30)).toBe(30);
  });

  it('未設定・非数値・0以下・小数はすべて既定の7日に倒す', () => {
    expect(normalizeViewingDays(undefined)).toBe(DEFAULT_VIEWING_DAYS);
    expect(normalizeViewingDays(null)).toBe(DEFAULT_VIEWING_DAYS);
    expect(normalizeViewingDays('7')).toBe(DEFAULT_VIEWING_DAYS);
    expect(normalizeViewingDays(0)).toBe(DEFAULT_VIEWING_DAYS);
    expect(normalizeViewingDays(-3)).toBe(DEFAULT_VIEWING_DAYS);
    expect(normalizeViewingDays(1.5)).toBe(DEFAULT_VIEWING_DAYS);
  });
});

describe('viewingDeadline', () => {
  it('作成日から viewingDays 日後', () => {
    expect(viewingDeadline(CREATED_AT, 3)).toEqual(
      new Date(CREATED_AT.getTime() + 3 * DAY_MS)
    );
  });

  it('viewingDays が無ければ既定の7日後', () => {
    expect(viewingDeadline(CREATED_AT, undefined)).toEqual(
      new Date(CREATED_AT.getTime() + DEFAULT_VIEWING_DAYS * DAY_MS)
    );
  });
});

describe('effectiveDeadline', () => {
  // 管理画面のプロジェクト詳細は expiresAt だけで判定していたため、
  // 閲覧期限（作成から N 日）が切れた招待が「有効」と表示され続けていた。
  it('閲覧期限のほうが早ければ閲覧期限を返す', () => {
    const expiresAt = new Date(CREATED_AT.getTime() + 30 * DAY_MS);

    expect(effectiveDeadline(CREATED_AT, 7, expiresAt)).toEqual(
      new Date(CREATED_AT.getTime() + 7 * DAY_MS)
    );
  });

  it('expiresAt のほうが早ければ expiresAt を返す', () => {
    const expiresAt = new Date(CREATED_AT.getTime() + 2 * DAY_MS);

    expect(effectiveDeadline(CREATED_AT, 7, expiresAt)).toEqual(expiresAt);
  });

  it('viewingDays が未設定なら既定の7日と比べる', () => {
    const expiresAt = new Date(CREATED_AT.getTime() + 30 * DAY_MS);

    expect(effectiveDeadline(CREATED_AT, undefined, expiresAt)).toEqual(
      new Date(CREATED_AT.getTime() + DEFAULT_VIEWING_DAYS * DAY_MS)
    );
  });

  it('createdAt が無ければ expiresAt をそのまま返す', () => {
    const expiresAt = new Date(CREATED_AT.getTime() + 2 * DAY_MS);

    expect(effectiveDeadline(undefined, 7, expiresAt)).toEqual(expiresAt);
  });

  it('expiresAt が無ければ閲覧期限を返す', () => {
    expect(effectiveDeadline(CREATED_AT, 7, undefined)).toEqual(
      new Date(CREATED_AT.getTime() + 7 * DAY_MS)
    );
  });

  it('どちらも無ければ null', () => {
    expect(effectiveDeadline(undefined, undefined, undefined)).toBeNull();
  });
});
