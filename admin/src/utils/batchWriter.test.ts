import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DocumentReference, Firestore } from 'firebase/firestore';

// 各バッチの中身を記録できるモック。
// writeBatch() が呼ばれるたびに新しい記録用オブジェクトを返す。
interface FakeBatch {
  ops: string[];
  commit: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

const batches: FakeBatch[] = [];
let commitShouldFail = false;

const makeBatch = (): FakeBatch => {
  const b: FakeBatch = {
    ops: [],
    delete: vi.fn((ref: DocumentReference) => {
      b.ops.push(`delete:${String(ref)}`);
    }),
    update: vi.fn((ref: DocumentReference) => {
      b.ops.push(`update:${String(ref)}`);
    }),
    commit: vi.fn(async () => {
      if (commitShouldFail) throw new Error('commit failed');
    }),
  };
  batches.push(b);
  return b;
};

vi.mock('firebase/firestore', () => ({
  writeBatch: () => makeBatch(),
}));

let batchWriter: typeof import('./batchWriter');

const fakeDb = {} as Firestore;
const refFor = (id: string) => id as unknown as DocumentReference;

beforeEach(async () => {
  batches.length = 0;
  commitShouldFail = false;
  batchWriter = await import('./batchWriter');
});

describe('createBatchWriter / 操作数での分割', () => {
  // Firestore の上限は「ドキュメント数」ではなく「操作数」。
  // 画像とお気に入りを同じバッチに積む以上、ここを取り違えると commit が丸ごと失敗する。
  it('操作数が上限を超えるとバッチを分ける', async () => {
    const writer = batchWriter.createBatchWriter(fakeDb, 500);

    for (let i = 0; i < 600; i += 1) {
      await writer.delete(refFor(`doc-${i}`));
    }
    await writer.flush();

    expect(writer.committedBatches).toBe(2);
    expect(batches).toHaveLength(2);
    expect(batches[0].ops).toHaveLength(500);
    expect(batches[1].ops).toHaveLength(100);
  });

  it('上限ちょうどなら1バッチのままにする', async () => {
    const writer = batchWriter.createBatchWriter(fakeDb, 500);

    for (let i = 0; i < 500; i += 1) {
      await writer.delete(refFor(`doc-${i}`));
    }
    await writer.flush();

    expect(writer.committedBatches).toBe(1);
    expect(batches).toHaveLength(1);
  });

  it('delete と update を混ぜても操作数で数える', async () => {
    const writer = batchWriter.createBatchWriter(fakeDb, 4);

    await writer.delete(refFor('a'));
    await writer.update(refFor('p'), { imageCount: -1 });
    await writer.delete(refFor('b'));
    await writer.update(refFor('p'), { imageCount: -1 });
    await writer.delete(refFor('c')); // 5件目。ここで分割される
    await writer.flush();

    expect(batches).toHaveLength(2);
    expect(batches[0].ops).toHaveLength(4);
    expect(batches[1].ops).toEqual(['delete:c']);
  });

  it('MAX_BATCH_OPERATIONS を超える指定は 500 に丸める', async () => {
    const writer = batchWriter.createBatchWriter(fakeDb, 1000);

    for (let i = 0; i < 501; i += 1) {
      await writer.delete(refFor(`doc-${i}`));
    }
    await writer.flush();

    expect(batches).toHaveLength(2);
    expect(batches[0].ops).toHaveLength(batchWriter.MAX_BATCH_OPERATIONS);
  });
});

describe('createBatchWriter / flush', () => {
  it('flush するまで書き込まない', async () => {
    const writer = batchWriter.createBatchWriter(fakeDb, 500);

    await writer.delete(refFor('a'));

    expect(batches[0].commit).not.toHaveBeenCalled();
    expect(writer.size).toBe(1);

    await writer.flush();

    expect(batches[0].commit).toHaveBeenCalledTimes(1);
    expect(writer.size).toBe(0);
  });

  it('何も積まずに flush しても commit しない', async () => {
    const writer = batchWriter.createBatchWriter(fakeDb, 500);

    await writer.flush();

    expect(batches).toHaveLength(0);
    expect(writer.committedBatches).toBe(0);
  });

  it('flush を二度呼んでも二重に commit しない', async () => {
    const writer = batchWriter.createBatchWriter(fakeDb, 500);

    await writer.delete(refFor('a'));
    await writer.flush();
    await writer.flush();

    expect(batches[0].commit).toHaveBeenCalledTimes(1);
  });
});

describe('createBatchWriter / 失敗', () => {
  // バッチは1件でも拒否されると全体が巻き戻る。握り潰すと
  // 「消したはずのものが残っている」ことに気付けない。
  it('commit が失敗したら例外を投げる', async () => {
    const writer = batchWriter.createBatchWriter(fakeDb, 500);
    commitShouldFail = true;

    await writer.delete(refFor('a'));

    await expect(writer.flush()).rejects.toThrow('commit failed');
    expect(writer.committedBatches).toBe(0);
  });
});
