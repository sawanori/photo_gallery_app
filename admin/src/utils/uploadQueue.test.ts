import { describe, it, expect, vi } from 'vitest';
import { runWithConcurrency } from './uploadQueue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('runWithConcurrency / 同時実行数', () => {
  // これが守られないと Firestore と Storage を叩きすぎる
  it('指定した同時実行数を超えない', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    await runWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      4,
      async (n) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
        return n;
      }
    );

    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('件数が同時実行数より少なくても動く', async () => {
    const results = await runWithConcurrency([1, 2], 8, async (n) => n * 2);
    expect(results).toEqual([
      { ok: true, value: 2 },
      { ok: true, value: 4 },
    ]);
  });

  it('空配列なら何もせず空を返す', async () => {
    const worker = vi.fn();
    const results = await runWithConcurrency([], 4, worker);
    expect(results).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });

  it('同時実行数が0以下でも1として扱う', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await runWithConcurrency([1, 2, 3], 0, async (n) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return n;
    });
    expect(maxInFlight).toBe(1);
  });
});

describe('runWithConcurrency / 失敗の扱い', () => {
  // 1枚壊れていても残りをアップロードし切る必要がある
  it('1件失敗しても残りが完走する', async () => {
    const results = await runWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    });

    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results[1]).toEqual({ ok: false, error: expect.any(Error) });
  });

  it('全件失敗しても reject しない', async () => {
    const results = await runWithConcurrency([1, 2], 2, async () => {
      throw new Error('boom');
    });
    expect(results.every((r) => !r.ok)).toBe(true);
  });
});

describe('runWithConcurrency / 順序と通知', () => {
  // 完了順に詰めると進捗と結果の対応がずれるので、入力順を保つ
  it('完了順が入れ替わっても結果は入力順で返る', async () => {
    const slow = deferred<void>();

    const promise = runWithConcurrency([0, 1], 2, async (n) => {
      if (n === 0) await slow.promise;
      return `item-${n}`;
    });

    // 1 を先に終わらせてから 0 を終わらせる
    await new Promise((r) => setTimeout(r, 1));
    slow.resolve();

    const results = await promise;
    expect(results).toEqual([
      { ok: true, value: 'item-0' },
      { ok: true, value: 'item-1' },
    ]);
  });

  it('onSettled が件数分呼ばれ、index が渡る', async () => {
    const seen: number[] = [];
    await runWithConcurrency([10, 20, 30], 2, async (n) => n, {
      onSettled: (_result, index) => seen.push(index),
    });

    expect(seen).toHaveLength(3);
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('onSettled は失敗した項目でも呼ばれる', async () => {
    const outcomes: boolean[] = [];
    await runWithConcurrency([1, 2], 1, async (n) => {
      if (n === 1) throw new Error('boom');
      return n;
    }, {
      onSettled: (result) => outcomes.push(result.ok),
    });

    expect(outcomes).toEqual([false, true]);
  });

  it('worker に index が渡る', async () => {
    const indexes: number[] = [];
    await runWithConcurrency(['a', 'b', 'c'], 1, async (_item, index) => {
      indexes.push(index);
      return index;
    });
    expect(indexes).toEqual([0, 1, 2]);
  });
});
