import { galleryUrlForToken, resolveDeepLink } from './resolveInitialUrl';

const ORIGIN = 'https://gallery.example.com';
const SCHEME = 'photogallery';

describe('resolveDeepLink', () => {
  it('/gallery/:token を解決する', () => {
    expect(resolveDeepLink(`${ORIGIN}/gallery/tok123`, ORIGIN, SCHEME)).toEqual({
      url: `${ORIGIN}/gallery/tok123`,
      token: 'tok123',
    });
  });

  // token だけ抜き出して /gallery/<token> に組み直す実装だとこれが壊れる。
  it('/liked?token= のパスとクエリを保持する', () => {
    expect(resolveDeepLink(`${ORIGIN}/liked?token=tok123`, ORIGIN, SCHEME)).toEqual({
      url: `${ORIGIN}/liked?token=tok123`,
      token: 'tok123',
    });
  });

  it('カスタムスキームの gallery を解決する', () => {
    expect(resolveDeepLink(`${SCHEME}://gallery/tok123`, ORIGIN, SCHEME)).toEqual({
      url: `${ORIGIN}/gallery/tok123`,
      token: 'tok123',
    });
  });

  it('カスタムスキームの liked を解決する', () => {
    expect(
      resolveDeepLink(`${SCHEME}://liked?token=tok123`, ORIGIN, SCHEME)
    ).toEqual({
      url: `${ORIGIN}/liked?token=tok123`,
      token: 'tok123',
    });
  });

  it('末尾スラッシュ付きの gallery を解決する', () => {
    expect(resolveDeepLink(`${ORIGIN}/gallery/tok123/`, ORIGIN, SCHEME)?.token).toBe(
      'tok123'
    );
  });

  it('URL エンコードされたトークンをデコードする', () => {
    expect(resolveDeepLink(`${ORIGIN}/gallery/a%2Db`, ORIGIN, SCHEME)?.token).toBe(
      'a-b'
    );
  });

  it('別オリジンを拒否する', () => {
    expect(resolveDeepLink('https://evil.tld/gallery/tok', ORIGIN, SCHEME)).toBeNull();
    expect(
      resolveDeepLink('https://gallery.example.com.evil.tld/gallery/tok', ORIGIN, SCHEME)
    ).toBeNull();
  });

  it('トークンを含まない URL を拒否する', () => {
    expect(resolveDeepLink(`${ORIGIN}/`, ORIGIN, SCHEME)).toBeNull();
    expect(resolveDeepLink(`${ORIGIN}/liked`, ORIGIN, SCHEME)).toBeNull();
    expect(resolveDeepLink(`${ORIGIN}/gallery/`, ORIGIN, SCHEME)).toBeNull();
    expect(resolveDeepLink(`${ORIGIN}/other/tok`, ORIGIN, SCHEME)).toBeNull();
  });

  it('未知のスキームとパース不能な入力を拒否する', () => {
    expect(resolveDeepLink('otherapp://gallery/tok', ORIGIN, SCHEME)).toBeNull();
    expect(resolveDeepLink('not a url', ORIGIN, SCHEME)).toBeNull();
    expect(resolveDeepLink('', ORIGIN, SCHEME)).toBeNull();
  });
});

/**
 * 実機で起きた不具合の再発防止。
 *
 * React Native の URL（Libraries/Blob/URL.js）は正規表現による簡易実装で、
 * host / pathname / origin のいずれも `https?://` にしかマッチしない。
 * `photogallery://gallery/<token>` を渡しても例外は出ず、host='' pathname='/' に
 * なるため、カスタムスキームの解決が黙って失敗していた。
 * Jest は Node の標準 URL で走るので、通常のテストではこれを再現できない。
 *
 * ここでは実機と同じ挙動の URL に差し替えて、同じ結果になることを確かめる。
 */
describe('resolveDeepLink（React Native の URL 実装下）', () => {
  const RealUrl = global.URL;

  class ReactNativeLikeUrl {
    _url: string;

    constructor(url: string) {
      this._url = url;
      const afterProtocol = this._url.split('://')[1];
      if (
        !this._url.endsWith('/') &&
        !(this._url.includes('?') || this._url.includes('#')) &&
        afterProtocol &&
        !afterProtocol.includes('/')
      ) {
        this._url += '/';
      }
    }

    get origin(): string {
      const matches = this._url.match(/^(https?:\/\/[^/]+)/);
      return matches ? matches[1] : '';
    }

    get pathname(): string {
      const match = this._url.match(/https?:\/\/[^/]+(\/[^?#]*)?/);
      return match ? match[1] || '/' : '/';
    }

    get protocol(): string {
      const match = this._url.match(/^([a-zA-Z][a-zA-Z\d+\-.]*):/);
      return match ? match[1] + ':' : '';
    }

    get search(): string {
      const match = this._url.match(/\?([^#]*)/);
      return match ? `?${match[1]}` : '';
    }

    get searchParams(): URLSearchParams {
      return new URLSearchParams(this.search);
    }

    get host(): string {
      const match = this._url.match(/^https?:\/\/(?:[^@]+@)?([^:/?#]+)/);
      return match ? match[1] : '';
    }

    toString(): string {
      return this._url;
    }
  }

  beforeAll(() => {
    // @ts-expect-error テスト中だけ実機と同じ簡易実装に差し替える
    global.URL = ReactNativeLikeUrl;
  });

  afterAll(() => {
    global.URL = RealUrl;
  });

  it('カスタムスキームの gallery を解決する', () => {
    expect(resolveDeepLink(`${SCHEME}://gallery/tok123`, ORIGIN, SCHEME)).toEqual({
      url: `${ORIGIN}/gallery/tok123`,
      token: 'tok123',
    });
  });

  it('カスタムスキームの liked を解決する', () => {
    expect(resolveDeepLink(`${SCHEME}://liked?token=tok123`, ORIGIN, SCHEME)).toEqual({
      url: `${ORIGIN}/liked?token=tok123`,
      token: 'tok123',
    });
  });

  it('https のディープリンクも解決する', () => {
    expect(resolveDeepLink(`${ORIGIN}/gallery/tok123`, ORIGIN, SCHEME)).toEqual({
      url: `${ORIGIN}/gallery/tok123`,
      token: 'tok123',
    });
  });

  it('別オリジンと未知のスキームは拒否する', () => {
    expect(resolveDeepLink('https://evil.tld/gallery/tok', ORIGIN, SCHEME)).toBeNull();
    expect(resolveDeepLink('otherapp://gallery/tok', ORIGIN, SCHEME)).toBeNull();
  });
});

describe('galleryUrlForToken', () => {
  it('保存済みトークンからギャラリー URL を組み立てる', () => {
    expect(galleryUrlForToken('tok123', ORIGIN)).toBe(`${ORIGIN}/gallery/tok123`);
  });

  it('トークンをエスケープする', () => {
    expect(galleryUrlForToken('a/b', ORIGIN)).toBe(`${ORIGIN}/gallery/a%2Fb`);
  });
});
