import { MANIFEST_CHUNK_SIZE, MANIFEST_ENDPOINT } from '../config';
import type { SaveItem } from '../bridge/protocol';

/**
 * サーバーから「保存してよい画像」の一覧を取得する。
 *
 * web は URL を渡してこない。native は招待トークンと imageId だけを送り、
 * サーバーが招待の有効性と所属を検証したうえで URL を返す。
 * ここで返ってきた URL も、保存直前に validate.ts で再検証する（多層防御）。
 */

export type ManifestOutcome =
  | { ok: true; items: SaveItem[] }
  | { ok: false; reason: 'unauthorized' | 'manifest_failed' };

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * サーバーが 1 回で受け付ける件数を超える依頼を、分割して取得し結合する。
 *
 * 件数そのものの上限はここでは判定しない（saveBatch の MAX_BATCH_ITEMS が受け持つ）。
 * ここで弾くと web には「通信に失敗した」と見える manifest_failed になってしまい、
 * 実際の理由（枚数が多すぎる）が伝わらないため。
 */
export async function fetchManifest(
  token: string,
  imageIds: string[]
): Promise<ManifestOutcome> {
  if (imageIds.length === 0) return { ok: true, items: [] };

  const items: SaveItem[] = [];
  for (let start = 0; start < imageIds.length; start += MANIFEST_CHUNK_SIZE) {
    const chunk = imageIds.slice(start, start + MANIFEST_CHUNK_SIZE);
    const outcome = await fetchChunk(token, chunk);
    // 1つでも失敗したら全体を失敗にする。部分的な一覧で保存を始めると
    // 「一部だけ保存されたのに成功に見える」状態になるため。
    if (!outcome.ok) return outcome;
    items.push(...outcome.items);
  }
  return { ok: true, items };
}

async function fetchChunk(
  token: string,
  imageIds: string[]
): Promise<ManifestOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(MANIFEST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, imageIds }),
      signal: controller.signal,
    });

    // 403 / 404 は「この招待では保存できない」。理由は区別しない。
    if (response.status === 403 || response.status === 404) {
      return { ok: false, reason: 'unauthorized' };
    }
    if (!response.ok) return { ok: false, reason: 'manifest_failed' };

    const body: unknown = await response.json();
    const items = parseItems(body);
    if (!items) return { ok: false, reason: 'manifest_failed' };

    return { ok: true, items };
  } catch (error) {
    console.warn('[manifest] request failed', error);
    return { ok: false, reason: 'manifest_failed' };
  } finally {
    clearTimeout(timer);
  }
}

/** サーバーの応答も信用せず形を検査する。 */
function parseItems(body: unknown): SaveItem[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw)) return null;

  const items: SaveItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { imageId, url, filename, bytes } = entry as Record<string, unknown>;
    if (typeof imageId !== 'string' || imageId.length === 0) continue;
    if (typeof url !== 'string' || url.length === 0) continue;
    if (typeof filename !== 'string' || filename.length === 0) continue;
    items.push({
      imageId,
      url,
      filename,
      bytes:
        typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0
          ? bytes
          : undefined,
    });
  }
  return items;
}
