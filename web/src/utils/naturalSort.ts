/**
 * ファイル名の自然順比較。
 *
 * 管理画面のアップロード画面（admin の naturalSortFiles）と**同じ規則**にしてある。
 * 揃っていないと、担当者が管理画面で見た並びと、クライアントがギャラリーで見る並びが
 * 食い違う。撮影順に見たい相手にとっては、これは並び順の不具合として現れる。
 *
 * `numeric: true` が要点。これが無いと数字が文字として比較され、
 * `DSC_10` が `DSC_2` より前に、`IMG_100` が `IMG_20` より前に来る。
 *
 * `sensitivity: 'base'` は大文字小文字と濁点の違いを無視する。
 * 同じ撮影で `IMG` と `img` が混ざっても、まとまった位置に並ぶ。
 */
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export function compareNatural(a: string, b: string): number {
  return collator.compare(a, b);
}

/** `images/{uid}/DSC05695.jpg` のような保存先から、並び替えに使う名前を取り出す。 */
export function sortNameFromStoragePath(storagePath: string): string {
  return (storagePath.split('/').pop() || '').toLowerCase();
}
