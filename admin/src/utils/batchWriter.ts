import {
  writeBatch,
  type DocumentReference,
  type Firestore,
  type WriteBatch,
} from 'firebase/firestore';

/**
 * Firestore の一括書き込みを、上限を超えないように自動で分割するライター。
 *
 * **上限はドキュメント数ではなく「操作数」で数える。**
 * 1回のバッチに積めるのは最大 500 操作。プロジェクト削除では画像ドキュメントと
 * お気に入りとプロジェクトの更新を同じバッチへ積むため、ドキュメント数で数えると
 * 簡単に超過し、commit 全体が失敗する。
 *
 * 設計上の約束:
 * - 上限を超える操作を積もうとした時点で、その前に自動で commit する。
 * - commit が失敗したら例外を投げる。**握り潰さない。**
 *   バッチは1件でも拒否されると全体が巻き戻るため、失敗を隠すと
 *   「消えたはずのものが残っている」状態に気付けない。
 * - 積んだだけでは書き込まれない。最後に必ず flush() を呼ぶ。
 */

/** 1回の writeBatch に積める操作数の上限。 */
export const MAX_BATCH_OPERATIONS = 500;

export interface BatchWriter {
  /** 削除を積む。上限に達していれば先に commit してから積む。 */
  delete(ref: DocumentReference): Promise<void>;
  /** 更新を積む。上限に達していれば先に commit してから積む。 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update(ref: DocumentReference, data: Record<string, any>): Promise<void>;
  /** 積んだ操作を確定させる。何も積まれていなければ何もしない。 */
  flush(): Promise<void>;
  /** 未確定の操作数。呼び出し側が区切り位置を決めるために使う。 */
  readonly size: number;
  /** これまでに commit したバッチの数。 */
  readonly committedBatches: number;
}

export const createBatchWriter = (
  db: Firestore,
  maxOperations: number = MAX_BATCH_OPERATIONS
): BatchWriter => {
  const limit = Math.max(1, Math.min(Math.floor(maxOperations), MAX_BATCH_OPERATIONS));

  let batch: WriteBatch | null = null;
  let pending = 0;
  let committed = 0;

  const flush = async (): Promise<void> => {
    if (!batch || pending === 0) {
      batch = null;
      pending = 0;
      return;
    }
    // commit の前に手放す。失敗しても同じバッチを再送しないため。
    const target = batch;
    batch = null;
    pending = 0;
    await target.commit();
    committed += 1;
  };

  const reserve = async (): Promise<WriteBatch> => {
    if (batch && pending >= limit) {
      await flush();
    }
    if (!batch) {
      batch = writeBatch(db);
      pending = 0;
    }
    pending += 1;
    return batch;
  };

  return {
    async delete(ref) {
      const target = await reserve();
      target.delete(ref);
    },
    async update(ref, data) {
      const target = await reserve();
      target.update(ref, data);
    },
    flush,
    get size() {
      return pending;
    },
    get committedBatches() {
      return committed;
    },
  };
};
