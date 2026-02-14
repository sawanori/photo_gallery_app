import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Image } from '@/types';

export const downloadSingleImage = async (image: Image): Promise<void> => {
  const response = await fetch(image.url);
  const blob = await response.blob();
  const extension = blob.type.split('/')[1] || 'jpg';
  const filename = `${image.title || image.id}.${extension}`;
  saveAs(blob, filename);
};

export interface DownloadProgress {
  current: number;
  total: number;
  percentage: number;
}

export const downloadImagesAsZip = async (
  images: Image[],
  zipName: string,
  onProgress?: (progress: DownloadProgress) => void,
  abortSignal?: AbortSignal,
): Promise<void> => {
  const zip = new JSZip();
  const total = images.length;
  const batchSize = 50;

  for (let i = 0; i < total; i += batchSize) {
    const batch = images.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (image, batchIndex) => {
        if (abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

        const response = await fetch(image.url, { signal: abortSignal });
        const blob = await response.blob();
        const extension = blob.type.split('/')[1] || 'jpg';
        const index = i + batchIndex + 1;
        const filename = `${String(index).padStart(3, '0')}_${image.title || image.id}.${extension}`;
        zip.file(filename, blob);

        onProgress?.({
          current: i + batchIndex + 1,
          total,
          percentage: Math.round(((i + batchIndex + 1) / total) * 100),
        });
      })
    );
  }

  if (abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `${zipName}.zip`);
};
