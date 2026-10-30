export const isIos = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export const isAndroid = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Android/.test(navigator.userAgent);
};

/**
 * LINE などのアプリ内ブラウザか。User-Agent に名乗るものだけを判定する。
 * ここで開いたお気に入りは Safari や Chrome に引き継がれない（perDevice の招待）。
 */
export const isInAppBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /\bLine\/|FBAN|FBAV|Instagram/.test(navigator.userAgent);
};
