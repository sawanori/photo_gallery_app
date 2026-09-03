import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rateLimiter';

/**
 * レート制限そのものの検証。
 *
 * 監査（2026-09-02, S6）で見つかった 2 点を固定する。
 *   1. 掃除が「既存バケットに当たった側」でしか走らず、未知のキーが来続けると
 *      Map が無限に育っていた
 *   2. 窓が明けたらカウントが戻ること
 */

describe('createRateLimiter', () => {
  it('上限までは通し、超えたら true を返す', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 3 });

    expect(limiter.check('a', 0)).toBe(false);
    expect(limiter.check('a', 0)).toBe(false);
    expect(limiter.check('a', 0)).toBe(false);
    expect(limiter.check('a', 0)).toBe(true);
  });

  it('キーごとに独立して数える', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });

    expect(limiter.check('a', 0)).toBe(false);
    expect(limiter.check('a', 0)).toBe(true);
    expect(limiter.check('b', 0)).toBe(false);
  });

  it('窓が明けたら数え直す', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });

    expect(limiter.check('a', 0)).toBe(false);
    expect(limiter.check('a', 500)).toBe(true);
    expect(limiter.check('a', 1000)).toBe(false);
  });

  // 未知のキーが来続けても Map が無限に育たないこと
  it('新規追加の前に期限切れを掃除する', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 10, sweepThreshold: 5 });

    for (let i = 0; i < 5; i += 1) limiter.check(`old-${i}`, 0);
    expect(limiter.size()).toBe(5);

    // 窓が明けた後に新しいキーが来たら、期限切れの 5 件が消えて 1 件だけ残る
    limiter.check('new', 2000);
    expect(limiter.size()).toBe(1);
  });

  it('期限内のキーは掃除で消さない', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 10, sweepThreshold: 2 });

    limiter.check('alive', 900); // resetAt = 1900
    limiter.check('expired', 0); // resetAt = 1000
    limiter.check('new', 1100); // ここで掃除が走る

    // expired だけが消え、alive と new が残る
    expect(limiter.size()).toBe(2);
    expect(limiter.check('alive', 1200)).toBe(false);
    expect(limiter.size()).toBe(2);
  });
});
