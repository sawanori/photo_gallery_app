import {
  galleryUrlForToken,
  normalizeInvitationInput,
  resolveDeepLink,
} from './resolveInitialUrl';

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

/**
 * 貼り付け入力の正規化。
 *
 * これが無いと、アプリを起動した利用者は招待リンクをタップする以外に
 * ギャラリーへ到達する手段が無い。App Store の審査でも、レビュアーが
 * 中身に到達できないと Guideline 2.1 で却下される。
 */
describe('normalizeInvitationInput', () => {
  const norm = (raw: string) => normalizeInvitationInput(raw, ORIGIN);

  it('https のリンクをそのまま通す', () => {
    expect(norm(`${ORIGIN}/gallery/tok12345`)).toBe(`${ORIGIN}/gallery/tok12345`);
  });

  it('カスタムスキームをそのまま通す', () => {
    expect(norm(`${SCHEME}://gallery/tok12345`)).toBe(`${SCHEME}://gallery/tok12345`);
  });

  it('/liked?token= の形も通す', () => {
    expect(norm(`${ORIGIN}/liked?token=tok12345`)).toBe(`${ORIGIN}/liked?token=tok12345`);
  });

  it('招待コードだけでもギャラリーの URL に組み立てる', () => {
    expect(norm('REVIEW-DEMO-2026')).toBe(`${ORIGIN}/gallery/REVIEW-DEMO-2026`);
    expect(norm('7AA53aP_hAqR-x3qXEqY7')).toBe(`${ORIGIN}/gallery/7AA53aP_hAqR-x3qXEqY7`);
  });

  // メールやメッセージからのコピーで混入する
  it('前後の空白と改行を取り除く', () => {
    expect(norm('  REVIEW-DEMO-2026  ')).toBe(`${ORIGIN}/gallery/REVIEW-DEMO-2026`);
    expect(norm(`\n${ORIGIN}/gallery/tok12345\n`)).toBe(`${ORIGIN}/gallery/tok12345`);
  });

  it('空文字と空白だけの入力を拒否する', () => {
    expect(norm('')).toBeNull();
    expect(norm('   ')).toBeNull();
  });

  // 広げすぎると、貼り間違えた任意の文字列がトークンとして解決され、
  // エラーページへ送られてしまう
  it('コードの長さの境界を守る', () => {
    expect(norm('a'.repeat(7))).toBeNull();
    expect(norm('a'.repeat(8))).toBe(`${ORIGIN}/gallery/${'a'.repeat(8)}`);
    expect(norm('a'.repeat(40))).toBe(`${ORIGIN}/gallery/${'a'.repeat(40)}`);
    expect(norm('a'.repeat(41))).toBeNull();
  });

  it('使えない文字を含むコードを拒否する', () => {
    expect(norm('日本語のコード')).toBeNull();
    expect(norm('code with space')).toBeNull();
    expect(norm('tok/../etc')).toBeNull();
  });

  // オリジンの判定は resolveDeepLink が行う。ここでは素通しし、最終的に拒否されることを確かめる
  it('別オリジンや危険なスキームは、最終的に解決されない', () => {
    expect(resolveDeepLink(norm('https://evil.tld/gallery/tok') ?? '', ORIGIN, SCHEME)).toBeNull();
    expect(resolveDeepLink(norm('javascript:alert(1)') ?? '', ORIGIN, SCHEME)).toBeNull();
    expect(
      resolveDeepLink(norm('https://web-photo-gallery-app.vercel.app/gallery/tok') ?? '', ORIGIN, SCHEME)
    ).toBeNull();
  });

  it('正規化した結果が resolveDeepLink で解決できる', () => {
    const url = norm('7AA53aP_hAqR-x3qXEqY7');
    expect(resolveDeepLink(url ?? '', ORIGIN, SCHEME)).toEqual({
      url: `${ORIGIN}/gallery/7AA53aP_hAqR-x3qXEqY7`,
      token: '7AA53aP_hAqR-x3qXEqY7',
    });
  });
});
