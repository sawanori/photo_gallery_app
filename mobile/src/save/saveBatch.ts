import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import {
  CANCEL_POLL_INTERVAL_MS,
  DOWNLOAD_CONCURRENCY,
  MAX_BATCH_ITEMS,
  MAX_TOTAL_BYTES,
} from '../config';
import type { ErrorCode } from '../bridge/protocol';
import { checkFreeSpace, knownBytesTotal } from './storage';
import {
  classifyError,
  discardCached,
  downloadToCache,
  ensureWritePermission,
  saveCachedFile,
} from './saveToLibrary';
import {
  deduplicateFilenames,
  validateSaveItem,
  type ValidatedItem,
} from './validate';

const KEEP_AWAKE_TAG = 'gallery-batch-save';

export interface BatchProgress {
  current: number;
  total: number;
}

export interface BatchResult {
  ok: boolean;
  savedCount: number;
  failedCount: number;
  errorCode?: ErrorCode;
  requiredBytes?: number;
}

export interface BatchOptions {
  onProgress: (progress: BatchProgress) => void;
  isCancelled: () => boolean;
}

/** 直列実行を保証する簡易ミューテックス。 */
function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn, fn);
    // 例外で連鎖が止まらないよう、待ち行列側は握りつぶす
    tail = result.catch(() => undefined);
    return result;
  };
}

/**
 * 一括保存。
 *
 * - ダウンロードは DOWNLOAD_CONCURRENCY 並列。項目ごとに DOWNLOAD_TIMEOUT_MS で打ち切る。
 * - フォトライブラリへの書き込みはミューテックスで直列化する（同時書き込みの競合を避ける）。
 * - 件数上限を超えたら無言で切り捨てず too_many_items で全体を断る。
 * - 1件失敗しても残りを続行する。
 * - どの経路でも結果を1回だけ返す。
 */
export async function saveMany(
  rawItems: unknown[],
  options: BatchOptions
): Promise<BatchResult> {
  const validated: ValidatedItem[] = [];
  let failedCount = 0;

  for (const raw of rawItems) {
    const result = validateSaveItem(raw);
    if (result.ok) validated.push(result.value);
    else failedCount += 1;
  }

  const accepted = deduplicateFilenames(validated);

  // 件数がこの一括保存で唯一の「多すぎる」判定。
  if (accepted.length > MAX_BATCH_ITEMS) {
    return {
      ok: false,
      savedCount: 0,
      failedCount: failedCount + accepted.length,
      errorCode: 'too_many_items',
    };
  }

  // 合計バイト数の上限は、サーバーが実サイズを返した分だけで判定する。
  // 推定値（1枚5MB）を足し込むと、実際には収まる枚数を誤って拒否する。
  const knownBytes = knownBytesTotal(accepted);
  if (knownBytes > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      savedCount: 0,
      failedCount: failedCount + accepted.length,
      errorCode: 'too_many_items',
      requiredBytes: knownBytes,
    };
  }

  if (accepted.length === 0) {
    return { ok: false, savedCount: 0, failedCount, errorCode: 'invalid_url' };
  }

  const space = checkFreeSpace(accepted);
  if (!space.sufficient) {
    return {
      ok: false,
      savedCount: 0,
      failedCount: failedCount + accepted.length,
      errorCode: 'insufficient_storage',
      requiredBytes: space.requiredBytes,
    };
  }

  // 権限が無い時点で全件ループしない
  const granted = await ensureWritePermission();
  if (!granted) {
    return {
      ok: false,
      savedCount: 0,
      failedCount: failedCount + accepted.length,
      errorCode: 'permission_denied',
    };
  }

  return runBatch(accepted, failedCount, options);
}

async function runBatch(
  items: ValidatedItem[],
  initialFailures: number,
  options: BatchOptions
): Promise<BatchResult> {
  const total = items.length;
  const runExclusive = createMutex();

  let savedCount = 0;
  let failedCount = initialFailures;
  let processed = 0;
  let cancelled = false;
  let lastReportedAt = 0;
  let nextIndex = 0;

  // ダウンロード中の項目を止めるための signal。項目の切れ目でしか
  // isCancelled() を見ないと、通信中の1件はキャンセル後も走り続ける。
  const cancelController = new AbortController();
  const markCancelled = () => {
    if (cancelled) return;
    cancelled = true;
    cancelController.abort();
  };

  const cancelPoll = setInterval(() => {
    if (options.isCancelled()) markCancelled();
  }, CANCEL_POLL_INTERVAL_MS);

  try {
    await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
  } catch {
    // keep-awake が使えなくても保存自体は続行する
  }

  const report = () => {
    const now = Date.now();
    if (processed === total || now - lastReportedAt >= 100) {
      lastReportedAt = now;
      options.onProgress({ current: processed, total });
    }
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      if (cancelled || options.isCancelled()) {
        markCancelled();
        return;
      }

      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      const item = items[index];
      let downloaded = null as Awaited<ReturnType<typeof downloadToCache>> | null;

      try {
        downloaded = await downloadToCache(item, {
          signal: cancelController.signal,
        });

        if (cancelled || options.isCancelled()) {
          markCancelled();
          return;
        }

        // 書き込みだけを直列化する。ダウンロードは並列のまま。
        const file = downloaded;
        await runExclusive(() => saveCachedFile(file));
        savedCount += 1;
      } catch (error) {
        // キャンセルで abort した分は失敗として数えない（利用者が止めたもの）。
        // finally の discardCached は return しても走るので一時ファイルは片付く。
        if (cancelled || options.isCancelled()) {
          markCancelled();
          return;
        }
        // タイムアウトした項目も失敗として数え、残りは続行する。
        console.warn('[saveBatch] item failed', classifyError(error), error);
        failedCount += 1;
      } finally {
        discardCached(downloaded);
      }

      processed += 1;
      report();
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, items.length) }, () =>
        worker()
      )
    );
  } finally {
    clearInterval(cancelPoll);
    try {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch {
      // 解除の失敗は結果に影響させない
    }
  }

  if (cancelled) {
    return { ok: false, savedCount, failedCount, errorCode: 'cancelled' };
  }

  return { ok: failedCount === 0, savedCount, failedCount };
}
