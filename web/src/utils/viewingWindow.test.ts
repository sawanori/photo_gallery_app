import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VIEWING_DAYS,
  isWithinViewingWindow,
  normalizeViewingDays,
  viewingDeadline,
} from './viewingWindow';

/**
 * 閲覧期限の計算。
 *
 * この計算は以前3か所（validateInvitation・manifestService.isUsable・Header の表示）に
 * 別々に書かれていた。1つ直して他を忘れると**表示と実際の期限がずれる**ため、
 * ここに集約して固定する。
 */

const DAY = 24 * 60 * 60 * 1000;
const CREATED = new Date('2026-08-16T00:00:00Z');
const at = (days: number) => new Date(CREATED.getTime() + days * DAY);

describe('normalizeViewingDays', () => {
  it('1 以上の整数はそのまま使う', () => {
    expect(normalizeViewingDays(1)).toBe(1);
    expect(normalizeViewingDays(180)).toBe(180);
  });

  // 不正な値で期限が消えて「無期限」になることを避ける。
  // 緩く受けるより既定へ倒すほうが安全側に働く。
  it.each([
    ['0', 0],
    ['負数', -1],
    ['小数', 1.5],
    ['文字列', 'abc'],
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['真偽値', true],
    ['オブジェクト', {}],
  ])('%s は既定の 7 日に倒す', (_label, value) => {
    expect(normalizeViewingDays(value)).toBe(DEFAULT_VIEWING_DAYS);
  });
});

describe('viewingDeadline', () => {
  it('未設定なら作成から 7 日後', () => {
    expect(viewingDeadline(CREATED).toISOString()).toBe(at(7).toISOString());
  });

  it('指定があればその日数後', () => {
    expect(viewingDeadline(CREATED, 180).toISOString()).toBe(at(180).toISOString());
  });
});

describe('isWithinViewingWindow', () => {
  it('未設定の招待は 7 日で切れる', () => {
    expect(isWithinViewingWindow(CREATED, undefined, at(6))).toBe(true);
    expect(isWithinViewingWindow(CREATED, undefined, at(8))).toBe(false);
  });

  // デモ招待が審査期間中に失効しないことの根拠
  it('長い日数を指定すると 7 日を過ぎても有効', () => {
    expect(isWithinViewingWindow(CREATED, 180, at(8))).toBe(true);
    expect(isWithinViewingWindow(CREATED, 180, at(179))).toBe(true);
    expect(isWithinViewingWindow(CREATED, 180, at(181))).toBe(false);
  });

  it('期限ちょうどは有効、1ミリ秒過ぎたら無効', () => {
    const deadline = viewingDeadline(CREATED, 7);
    expect(isWithinViewingWindow(CREATED, 7, deadline)).toBe(true);
    expect(isWithinViewingWindow(CREATED, 7, new Date(deadline.getTime() + 1))).toBe(false);
  });

  it('不正な日数では既定の 7 日として判定する（無期限にならない）', () => {
    expect(isWithinViewingWindow(CREATED, 0, at(8))).toBe(false);
    expect(isWithinViewingWindow(CREATED, -1, at(8))).toBe(false);
    expect(isWithinViewingWindow(CREATED, 'forever', at(8))).toBe(false);
  });
});
