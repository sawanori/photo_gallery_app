import escapeStringRegexp from 'escape-string-regexp';

import { WEB_ORIGIN } from '../config';

/**
 * `originWhitelist` に渡す値が、react-native-webview の照合を実際に通ることを確かめる。
 *
 * 実機で起きた不具合の再発防止。`originWhitelist={[`${WEB_ORIGIN}/*`]}` と書いていたため
 * 自分のギャラリーが「外部サイト」と判定され、ライブラリが Linking.openURL に渡していた。
 * その結果アプリ内は白いまま、同じページが OS のブラウザで開いていた。
 *
 * 照合はライブラリ内部で行われ、こちらの onShouldStartLoadWithRequest は
 * 一致しなかった時点で呼ばれない。つまり自前の判定関数をいくらテストしても捕まらない。
 * そのためライブラリの照合そのものをここで再現する。
 *
 * 出典: react-native-webview/lib/WebViewShared.js の
 * extractOrigin / originWhitelistToRegex / passesWhitelist。
 */

const extractOrigin = (url: string): string => {
  const result = /^[A-Za-z][A-Za-z0-9+\-.]+:(\/\/)?[^/]*/.exec(url);
  return result === null ? '' : result[0];
};

const originWhitelistToRegex = (entry: string): string =>
  `^${escapeStringRegexp(entry).replace(/\\\*/g, '.*')}`;

const passesWhitelist = (whitelist: string[], url: string): boolean =>
  ['about:blank', ...whitelist]
    .map(originWhitelistToRegex)
    .some((pattern) => new RegExp(pattern).test(extractOrigin(url)));

/**
 * GalleryWebView に渡している値と同じもの。
 *
 * 意図的に緩くしてある。ここで弾かれた URL はこちらのハンドラを通らず、
 * ライブラリが直接 Linking.openURL に渡してしまうため制御できない。
 * 実際の可否は decideNavigation で判定する。
 */
const WHITELIST = ['https://*', 'http://*'];

/** 以前使っていた、オリジンだけを列挙する書き方。 */
const ORIGIN_ONLY = [WEB_ORIGIN];

describe('originWhitelist', () => {
  it('ギャラリーのページを通す', () => {
    expect(passesWhitelist(WHITELIST, `${WEB_ORIGIN}/gallery/tok123`)).toBe(true);
  });

  it('お気に入りのページを通す', () => {
    expect(passesWhitelist(WHITELIST, `${WEB_ORIGIN}/liked?token=tok123`)).toBe(true);
  });

  it('オリジンそのもの（パス無し）を通す', () => {
    expect(passesWhitelist(WHITELIST, WEB_ORIGIN)).toBe(true);
    expect(passesWhitelist(WHITELIST, `${WEB_ORIGIN}/`)).toBe(true);
  });

  it('about:blank を通す（ライブラリが既定で許可している）', () => {
    expect(passesWhitelist(WHITELIST, 'about:blank')).toBe(true);
  });

  // 別サイトもここでは通す。ライブラリに横取りされると Linking.openURL へ直行してしまい、
  // iframe の読み込みだけでアプリがブラウザへ切り替わる。可否は decideNavigation が決める。
  it('別サイトも通し、判定はこちらのハンドラに委ねる', () => {
    expect(passesWhitelist(WHITELIST, 'https://vercel.live/_next-live/feedback.html')).toBe(
      true
    );
  });

  // これが最初の不具合。パスを含めると自分のページが通らなくなる。
  it('パスを含む書き方（末尾 /*）では自分のページが通らない', () => {
    expect(
      passesWhitelist([`${WEB_ORIGIN}/*`], `${WEB_ORIGIN}/gallery/tok123`)
    ).toBe(false);
  });

  it('オリジンだけの書き方なら自分のページは通る', () => {
    expect(passesWhitelist(ORIGIN_ONLY, `${WEB_ORIGIN}/gallery/tok123`)).toBe(true);
  });
});
