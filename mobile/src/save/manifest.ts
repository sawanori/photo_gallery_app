import { MANIFEST_ENDPOINT, MAX_BATCH_ITEMS } from '../config';
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

export async function fetchManifest(
  token: string,
  imageIds: string[]
): Promise<ManifestOutcome> {
  if (imageIds.length === 0) return { ok: true, items: [] };
  if (imageIds.length > MAX_BATCH_ITEMS) {
    return { ok: false, reason: 'manifest_failed' };
  }

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
