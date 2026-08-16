import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { AppState, type AppStateStatus } from 'react-native';

import { DOWNLOAD_CONCURRENCY, MAX_BATCH_ITEMS, MAX_TOTAL_BYTES } from '../config';
import type { ErrorCode } from '../bridge/protocol';
import { checkFreeSpace, estimateRequiredBytes } from './storage';
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
  /** 処理中にアプリがバックグラウンドへ回った場合 true（中断の可能性を web に伝える）。 */
  interrupted?: boolean;
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
 * - ダウンロードは DOWNLOAD_CONCURRENCY 並列。
 * - フォトライブラリへの書き込みはミューテックスで直列化する（同時書き込みの競合を避ける）。
 * - 上限超過分は無言で切り捨てず、失敗として計上する。
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

  let accepted = deduplicateFilenames(validated);
  if (accepted.length > MAX_BATCH_ITEMS) {
    failedCount += accepted.length - MAX_BATCH_ITEMS;
    accepted = accepted.slice(0, MAX_BATCH_ITEMS);
  }

  const estimated = estimateRequiredBytes(accepted);
  if (estimated > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      savedCount: 0,
      failedCount: failedCount + accepted.length,
      errorCode: 'too_many_items',
      requiredBytes: estimated,
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
  let wentBackground = false;
  let lastReportedAt = 0;
  let nextIndex = 0;

  const appStateSub = AppState.addEventListener(
    'change',
    (state: AppStateStatus) => {
      if (state !== 'active') wentBackground = true;
    }
  );

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
        cancelled = true;
        return;
      }

      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      const item = items[index];
      let downloaded = null as Awaited<ReturnType<typeof downloadToCache>> | null;

      try {
        downloaded = await downloadToCache(item);

        if (cancelled || options.isCancelled()) {
          cancelled = true;
          return;
        }

        // 書き込みだけを直列化する。ダウンロードは並列のまま。
        const file = downloaded;
        await runExclusive(() => saveCachedFile(file));
        savedCount += 1;
      } catch (error) {
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
    appStateSub.remove();
    try {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch {
      // 解除の失敗は結果に影響させない
    }
  }

  if (cancelled) {
    return {
      ok: false,
      savedCount,
      failedCount,
      errorCode: 'cancelled',
      interrupted: wentBackground,
    };
  }

  return {
    ok: failedCount === 0,
    savedCount,
    failedCount,
    interrupted: wentBackground,
  };
}
