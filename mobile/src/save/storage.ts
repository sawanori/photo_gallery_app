import { Paths } from 'expo-file-system';

import {
  ESTIMATED_BYTES_PER_IMAGE,
  STORAGE_HEADROOM_BYTES,
} from '../config';
import type { ValidatedItem } from './validate';

/** 保存に必要なバイト数を見積もる。サイズ不明の画像は既定値で数える。 */
export function estimateRequiredBytes(items: ValidatedItem[]): number {
  return items.reduce(
    (sum, item) => sum + (item.bytes ?? ESTIMATED_BYTES_PER_IMAGE),
    0
  );
}

export interface StorageCheck {
  sufficient: boolean;
  requiredBytes: number;
  availableBytes: number | null;
}

/**
 * 空き容量が足りるかを確認する。
 * 端末の空き容量が取得できない場合は「足りる」とみなして進む（判定不能で止めない）。
 */
export function checkFreeSpace(items: ValidatedItem[]): StorageCheck {
  const requiredBytes = estimateRequiredBytes(items) + STORAGE_HEADROOM_BYTES;

  let availableBytes: number | null = null;
  try {
    availableBytes = Paths.availableDiskSpace ?? null;
  } catch {
    availableBytes = null;
  }

  if (availableBytes === null) {
    return { sufficient: true, requiredBytes, availableBytes: null };
  }

  return {
    sufficient: availableBytes >= requiredBytes,
    requiredBytes,
    availableBytes,
  };
}
