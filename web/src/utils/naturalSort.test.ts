import { describe, it, expect } from 'vitest';
import { compareNatural, sortNameFromStoragePath } from './naturalSort';

/**
 * ギャラリーの並び順が管理画面と一致することを固定する。
 *
 * 以前は `localeCompare(b, 'ja')` を使っており、数字が文字として比較されていた。
 * その結果 DSC_10 が DSC_2 より前に並び、担当者が管理画面で見た順序と
 * クライアントがギャラリーで見る順序が食い違っていた。
 */
describe('compareNatural', () => {
  const sorted = (names: string[]) => [...names].sort(compareNatural);

  it('数字を数として比較する', () => {
    expect(sorted(['IMG_10.jpg', 'IMG_2.jpg', 'IMG_1.jpg'])).toEqual([
      'IMG_1.jpg',
      'IMG_2.jpg',
      'IMG_10.jpg',
    ]);
  });

  it('桁数が増えても順序が崩れない', () => {
    expect(sorted(['IMG_100.jpg', 'IMG_20.jpg', 'IMG_3.jpg'])).toEqual([
      'IMG_3.jpg',
      'IMG_20.jpg',
      'IMG_100.jpg',
    ]);
  });

  it('文字として比較する実装では通らない並び', () => {
    // 退行したときにここが落ちる
    const byString = ['DSC_10.jpg', 'DSC_2.jpg'].sort((a, b) => a.localeCompare(b, 'ja'));
    expect(byString).toEqual(['DSC_10.jpg', 'DSC_2.jpg']);
    expect(sorted(['DSC_10.jpg', 'DSC_2.jpg'])).toEqual(['DSC_2.jpg', 'DSC_10.jpg']);
  });

  it('大文字と小文字の違いで離れない', () => {
    expect(sorted(['img_2.jpg', 'IMG_1.jpg'])).toEqual(['IMG_1.jpg', 'img_2.jpg']);
  });

  it('ゼロ埋めの有無が混ざっても数として並ぶ', () => {
    expect(sorted(['DSC0005.jpg', 'DSC5.jpg', 'DSC10.jpg'])).toEqual([
      'DSC0005.jpg',
      'DSC5.jpg',
      'DSC10.jpg',
    ]);
  });
});

describe('sortNameFromStoragePath', () => {
  it('保存先から末尾のファイル名を取り出す', () => {
    expect(sortNameFromStoragePath('images/uid123/DSC05695.jpg')).toBe('dsc05695.jpg');
  });

  it('区切りが無い場合はそのまま返す', () => {
    expect(sortNameFromStoragePath('DSC05695.jpg')).toBe('dsc05695.jpg');
  });

  it('空文字でも落ちない', () => {
    expect(sortNameFromStoragePath('')).toBe('');
  });
});
