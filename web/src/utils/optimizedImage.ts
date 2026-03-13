/** Build a URL to our self-hosted image optimization API */
export function optimizedImageUrl(
  src: string,
  width: number,
  quality = 75,
): string {
  return `/api/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}
