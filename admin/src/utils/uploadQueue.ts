/**
 * 同時実行数を制限して処理を流すワーカープール。
 *
 * アップロードは1枚ずつ完全に直列だったため、往復待ちが枚数分積み上がっていた。
 * この関数は同時実行数の上限を守りながら並列に流す。
 *
 * 設計上の約束:
 * - 1件が失敗しても全体を止めない。その項目だけ失敗として記録する。
 * - 結果配列は**入力と同じ順序**で返す（完了順ではない）。
 * - `onSettled` は1件終わるたびに呼ぶ。こちらは**完了順**で呼ばれる。
 */

export type SettledResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

export interface RunWithConcurrencyOptions<T> {
  /** 1件終わるたびに呼ばれる。完了順。進捗表示に使う。 */
  onSettled?: (result: SettledResult<T>, index: number) => void;
}

export async function runWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
  options: RunWithConcurrencyOptions<TResult> = {}
): Promise<SettledResult<TResult>[]> {
  const results: SettledResult<TResult>[] = new Array(items.length);
  if (items.length === 0) return results;

  const limit = Math.max(1, Math.min(Math.floor(concurrency), items.length));
  let nextIndex = 0;

  const runOne = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      let settled: SettledResult<TResult>;
      try {
        settled = { ok: true, value: await worker(items[index], index) };
      } catch (error) {
        settled = { ok: false, error };
      }

      results[index] = settled;
      options.onSettled?.(settled, index);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => runOne()));
  return results;
}
