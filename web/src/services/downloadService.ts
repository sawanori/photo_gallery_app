import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Image } from '@/types';
import { isIos, isAndroid } from '@/utils/device';

const downloadViaAnchor = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadSingleImage = async (image: Image): Promise<void> => {
  if (isIos() || isAndroid()) {
    // Mobile: open image in new tab (must be synchronous to preserve user gesture)
    // iOS: user long-presses to save to Photos
    // Android: user uses ⋮ menu → Download or long-press → Download image
    // Chrome's UI download uses MediaStore, so images appear in gallery
    window.open(image.url, '_blank');
    return;
  }

  // Desktop: fetch blob and trigger download
  const response = await fetch(image.url);
  const blob = await response.blob();
  const extension = blob.type.split('/')[1] || 'jpg';
  const filename = `${image.title || image.id}.${extension}`;
  downloadViaAnchor(blob, filename);
};

export interface DownloadProgress {
  current: number;
  total: number;
  percentage: number;
  /**
   * 'fetching' … 写真を取得している
   * 'zipping'  … 取得を終えて ZIP を組み立てている
   *
   * 省略可能にしてあるのは、ネイティブ保存の進捗（NativeSaveProgress）も
   * 同じ進捗モーダルに渡すため。あちらに段階の区別は無い。
   */
  phase?: 'fetching' | 'zipping';
}

/**
 * 一括 ZIP の結果。
 *
 * 以前は `Promise.all` だったため 1 枚失敗すると全体が拒否され、
 * 呼び出し側は await も catch もしていなかったのでモーダルが消えるだけだった
 * （監査 F1）。**失敗しても残りは渡し、失敗した枚数を返す。**
 */
export interface BulkDownloadResult {
  /** ZIP に入った枚数 */
  savedCount: number;
  /** 取得に失敗して ZIP に入らなかった枚数 */
  failedCount: number;
}

export const downloadImagesAsZip = async (
  images: Image[],
  zipName: string,
  onProgress?: (progress: DownloadProgress) => void,
  abortSignal?: AbortSignal,
): Promise<BulkDownloadResult> => {
  const zip = new JSZip();
  const total = images.length;
  const batchSize = 50;
  let failedCount = 0;

  for (let i = 0; i < total; i += batchSize) {
    const batch = images.slice(i, i + batchSize);

    // allSettled にするのは、1 枚の失敗で残り全部を捨てないため。
    const settled = await Promise.allSettled(
      batch.map(async (image, batchIndex) => {
        const index = i + batchIndex + 1;
        try {
          if (abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

          const response = await fetch(image.url, { signal: abortSignal });
          // response.ok を見ずに blob() していたため、403/404 の XML 本文が
          // `.jpg` として ZIP に混入していた。
          if (!response.ok) {
            throw new Error(`Failed to fetch image ${image.id}: ${response.status}`);
          }

          const blob = await response.blob();
          const extension = blob.type.split('/')[1] || 'jpg';
          const filename = `${String(index).padStart(3, '0')}_${image.title || image.id}.${extension}`;
          zip.file(filename, blob);
        } finally {
          onProgress?.({
            current: index,
            total,
            percentage: Math.round((index / total) * 100),
            phase: 'fetching',
          });
        }
      })
    );

    // 中止は「失敗」ではなく中断。呼び出し側へそのまま伝える。
    if (abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

    for (const result of settled) {
      if (result.status === 'rejected') {
        console.error('Bulk download item failed:', result.reason);
        failedCount += 1;
      }
    }
  }

  if (abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // 取得が終わってから ZIP を組み立てる。ここは数百枚だと数十秒かかるため、
  // 進捗を出さないと画面が固まったように見える。
  onProgress?.({ current: total, total, percentage: 0, phase: 'zipping' });

  const content = await zip.generateAsync(
    {
      type: 'blob',
      // JPEG は既に圧縮済みで、再圧縮してもほとんど縮まない。
      // 既定の DEFLATE のままだと、その効果の無い計算に時間を使うだけになる。
      // STORE は無圧縮で格納するだけなので、生成が目に見えて速くなる。
      compression: 'STORE',
    },
    (metadata) => {
      onProgress?.({
        current: total,
        total,
        percentage: Math.round(metadata.percent),
        phase: 'zipping',
      });
    }
  );

  // 生成中に中止された場合はファイルを渡さない。
  // JSZip の生成そのものは途中で止められないため、ここで捨てる。
  if (abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

  saveAs(content, `${zipName}.zip`);

  return { savedCount: total - failedCount, failedCount };
};
