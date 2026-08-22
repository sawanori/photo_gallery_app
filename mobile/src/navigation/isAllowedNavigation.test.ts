import {
  decideNavigation,
  isAllowedNavigation,
  isOpenableExternally,
} from './isAllowedNavigation';

const ORIGIN = 'https://gallery.example.com';

describe('isAllowedNavigation', () => {
  it('自オリジンの URL を許可する', () => {
    expect(isAllowedNavigation(`${ORIGIN}/gallery/abc`, ORIGIN)).toBe(true);
    expect(isAllowedNavigation(`${ORIGIN}/liked?token=abc`, ORIGIN)).toBe(true);
    expect(isAllowedNavigation(`${ORIGIN}/`, ORIGIN)).toBe(true);
  });

  // startsWith 実装だとこれが通ってしまう。origin の完全一致で判定していることの検証。
  it('サブドメイン偽装を拒否する', () => {
    expect(isAllowedNavigation('https://gallery.example.com.evil.tld/x', ORIGIN)).toBe(
      false
    );
    expect(
      isAllowedNavigation('https://gallery.example.com.evil.tld/gallery/abc', ORIGIN)
    ).toBe(false);
  });

  it('別ホストを拒否する', () => {
    expect(isAllowedNavigation('https://evil.tld/gallery/abc', ORIGIN)).toBe(false);
  });

  // 本番は https 設定なので、http のページは origin 不一致で弾かれる
  it('https 設定のとき http のページを拒否する', () => {
    expect(isAllowedNavigation('http://gallery.example.com/gallery/abc', ORIGIN)).toBe(
      false
    );
  });

  // 開発中は手元の web サーバー（http）を読み込めないと実機で試せない
  it('http のオリジンを設定した場合は http のページを許可する', () => {
    const dev = 'http://192.168.3.8:3002';
    expect(isAllowedNavigation(`${dev}/gallery/abc`, dev)).toBe(true);
    // ポート違いは別オリジンなので拒否
    expect(isAllowedNavigation('http://192.168.3.8:3003/gallery/abc', dev)).toBe(false);
    // http 設定でも https の別ホストは通さない
    expect(isAllowedNavigation('https://evil.tld/gallery/abc', dev)).toBe(false);
  });

  it('https 以外のスキームを一律で拒否する', () => {
    expect(isAllowedNavigation('javascript:alert(1)', ORIGIN)).toBe(false);
    expect(isAllowedNavigation('data:text/html,<h1>x</h1>', ORIGIN)).toBe(false);
    expect(isAllowedNavigation('blob:https://gallery.example.com/uuid', ORIGIN)).toBe(
      false
    );
    expect(isAllowedNavigation('ftp://gallery.example.com/x', ORIGIN)).toBe(false);
    expect(isAllowedNavigation('intent://scan/#Intent;scheme=zxing;end', ORIGIN)).toBe(
      false
    );
    expect(isAllowedNavigation('file:///etc/passwd', ORIGIN)).toBe(false);
  });

  it('パースできない URL を拒否する', () => {
    expect(isAllowedNavigation('about:blank', ORIGIN)).toBe(false);
    expect(isAllowedNavigation('/gallery/abc', ORIGIN)).toBe(false);
    expect(isAllowedNavigation('', ORIGIN)).toBe(false);
  });

  it('末尾スラッシュ付きのオリジン指定でも一致する', () => {
    expect(isAllowedNavigation(`${ORIGIN}/gallery/abc`, `${ORIGIN}/`)).toBe(true);
  });
});

describe('isOpenableExternally', () => {
  it('http と https のみ外部ブラウザへ回す', () => {
    expect(isOpenableExternally('https://line.me/x')).toBe(true);
    expect(isOpenableExternally('http://example.com')).toBe(true);
  });

  it('危険なスキームは外部にも回さない', () => {
    expect(isOpenableExternally('javascript:alert(1)')).toBe(false);
    expect(isOpenableExternally('data:text/html,x')).toBe(false);
    expect(isOpenableExternally('intent://x')).toBe(false);
    expect(isOpenableExternally('not a url')).toBe(false);
  });
});

/**
 * iframe の扱い。実機で起きた不具合の再発防止。
 *
 * Vercel のプレビュー用ツールバーが `vercel.live` の iframe を読み込み、それを
 * 外部ブラウザへ回していたため、ページを開くたびにアプリが Safari へ切り替わった。
 * アプリが背面に回ると WebView の JavaScript が止まるので、写真一覧も読み込めなかった。
 */
describe('decideNavigation', () => {
  const top = (url: string) => ({ url, isTopFrame: true });
  const frame = (url: string) => ({ url, isTopFrame: false });

  it('自オリジンは最上位でも iframe でも読み込む', () => {
    expect(decideNavigation(top(`${ORIGIN}/gallery/tok`), ORIGIN)).toBe('allow');
    expect(decideNavigation(frame(`${ORIGIN}/gallery/tok`), ORIGIN)).toBe('allow');
  });

  it('外部サイトの iframe は外部ブラウザへ回さず、その場で止める', () => {
    expect(
      decideNavigation(frame('https://vercel.live/_next-live/feedback.html'), ORIGIN)
    ).toBe('block');
    expect(
      decideNavigation(frame('https://photo-gallery-app-20251204.firebaseapp.com/__/auth/iframe'), ORIGIN)
    ).toBe('block');
  });

  it('外部サイトへの最上位の遷移は外部ブラウザで開く', () => {
    expect(decideNavigation(top('https://example.com/'), ORIGIN)).toBe('external');
  });

  it('http/https 以外は最上位でも開かない', () => {
    expect(decideNavigation(top('javascript:alert(1)'), ORIGIN)).toBe('block');
    expect(decideNavigation(top('intent://evil'), ORIGIN)).toBe('block');
  });
});
