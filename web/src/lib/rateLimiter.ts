/**
 * インスタンス内メモリの簡易レート制限。
 *
 * サーバーレスではインスタンスごとに独立したカウンタになるため、
 * 厳密な制限にはならない。**総当たりを鈍らせるための減速帯**として使う。
 * 厳密さが要るなら外部ストア（Redis 等）が必要になる。
 *
 * Route Handler から切り出してあるのは、期限切れバケットの掃除が効いているか
 * （＝未知のキーが来続けても Map が無限に育たないか）を単体テストで固定するため。
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  /** 上限を超えていれば true。呼ぶたびに 1 回分として数える。 */
  check(key: string, now: number): boolean;
  /** 保持しているキーの数。掃除が効いているかを見るためのもの。 */
  size(): number;
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  /** この件数に達したら、新規追加の前に期限切れを掃除する。 */
  sweepThreshold?: number;
}

export function createRateLimiter({
  windowMs,
  max,
  sweepThreshold = 1000,
}: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    check(key: string, now: number): boolean {
      const bucket = buckets.get(key);
      if (bucket && now < bucket.resetAt) {
        bucket.count += 1;
        return bucket.count > max;
      }

      // 新規に入れる**前に**掃除する。以前は既存バケットに当たった側でしか
      // 掃除しておらず、未知のキーが来るたびに Map が増え続けていた。
      if (buckets.size >= sweepThreshold) {
        for (const [k, v] of buckets) {
          if (now >= v.resetAt) buckets.delete(k);
        }
      }

      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    },

    size(): number {
      return buckets.size;
    },
  };
}
