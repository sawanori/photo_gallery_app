import {
  deduplicateFilenames,
  validateSaveItem,
  type ValidatedItem,
} from './validate';

const OK_URL =
  'https://firebasestorage.googleapis.com/v0/b/photo-gallery-app-20251204.firebasestorage.app/o/images%2Fuid%2Fphoto.jpg?alt=media&token=abc';

describe('validateSaveItem / オリジン検証', () => {
  it('許可オリジンの Storage URL を通す', () => {
    const result = validateSaveItem({ url: OK_URL, filename: 'photo.jpg' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.safeFilename).toBe('photo.jpg');
  });

  it('バケット直アクセスのオリジンも通す', () => {
    const result = validateSaveItem({
      url: 'https://photo-gallery-app-20251204.firebasestorage.app/images/uid/a.jpg',
      filename: 'a.jpg',
    });
    expect(result.ok).toBe(true);
  });

  // これが接頭辞一致で通ってしまうのを防ぐのが本質。startsWith 実装だと通ってしまう。
  it('サブドメイン偽装を拒否する', () => {
    const result = validateSaveItem({
      url: 'https://firebasestorage.googleapis.com.evil.tld/v0/b/photo-gallery-app-20251204.firebasestorage.app/o/images%2Fx.jpg',
      filename: 'x.jpg',
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_url' });
  });

  it('http を拒否する', () => {
    const result = validateSaveItem({
      url: OK_URL.replace('https://', 'http://'),
      filename: 'photo.jpg',
    });
    expect(result.ok).toBe(false);
  });

  it('許可外ホストを拒否する', () => {
    const result = validateSaveItem({
      url: 'https://example.com/images/x.jpg',
      filename: 'x.jpg',
    });
    expect(result.ok).toBe(false);
  });

  it('Storage のオブジェクトパスに見えない URL を拒否する', () => {
    const result = validateSaveItem({
      url: 'https://firebasestorage.googleapis.com/v0/b/other-project.appspot.com/o/secret%2Fx.jpg',
      filename: 'x.jpg',
    });
    expect(result.ok).toBe(false);
  });

  it('パースできない URL を拒否する', () => {
    expect(validateSaveItem({ url: 'not a url', filename: 'a.jpg' }).ok).toBe(false);
  });

  it('url が無い / オブジェクトでない入力を拒否する', () => {
    expect(validateSaveItem(null).ok).toBe(false);
    expect(validateSaveItem('string').ok).toBe(false);
    expect(validateSaveItem({ filename: 'a.jpg' }).ok).toBe(false);
  });
});

describe('validateSaveItem / ファイル名', () => {
  it('パス traversal を含むファイル名を拒否する', () => {
    expect(
      validateSaveItem({ url: OK_URL, filename: '../../etc/passwd' }).ok
    ).toBe(false);
  });

  it('パス区切りを含むファイル名を拒否する', () => {
    expect(validateSaveItem({ url: OK_URL, filename: 'a/b.jpg' }).ok).toBe(false);
    expect(validateSaveItem({ url: OK_URL, filename: 'a\\b.jpg' }).ok).toBe(false);
  });

  it('NUL や制御文字を含むファイル名を拒否する', () => {
    expect(
      validateSaveItem({ url: OK_URL, filename: 'a\u0000.jpg' }).ok
    ).toBe(false);
    expect(
      validateSaveItem({ url: OK_URL, filename: 'a\u000a.jpg' }).ok
    ).toBe(false);
  });

  it("'..' で始まるファイル名を拒否する", () => {
    expect(validateSaveItem({ url: OK_URL, filename: '..jpg' }).ok).toBe(false);
  });

  it('拡張子が無いファイル名には URL から導出した拡張子を付ける', () => {
    const result = validateSaveItem({ url: OK_URL, filename: 'photo' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.safeFilename).toBe('photo.jpg');
  });

  it('許可外の拡張子には URL から導出した拡張子を付け足す', () => {
    const result = validateSaveItem({ url: OK_URL, filename: 'photo.exe' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.safeFilename).toBe('photo.exe.jpg');
  });

  it('ファイル名が渡されない場合は URL の末尾から作る', () => {
    const result = validateSaveItem({ url: OK_URL });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.safeFilename).toBe('photo.jpg');
  });

  it('URL からも拡張子が取れない場合は jpg にフォールバックする', () => {
    const result = validateSaveItem({
      url: 'https://photo-gallery-app-20251204.firebasestorage.app/images/uid/noext',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.safeFilename).toBe('image.jpg');
  });

  it('日本語ファイル名を通す', () => {
    const result = validateSaveItem({ url: OK_URL, filename: '結婚式_001.jpg' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.safeFilename).toBe('結婚式_001.jpg');
  });

  describe('長すぎる名前の切り詰め', () => {
    it('末尾 120 コードポイントを残す', () => {
      const long = `${'a'.repeat(200)}.jpg`;
      const result = validateSaveItem({ url: OK_URL, filename: long });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Array.from(result.value.safeFilename)).toHaveLength(120);
      expect(result.value.safeFilename.endsWith('.jpg')).toBe(true);
    });

    // UTF-16 単位で切るとサロゲートペアが割れ、壊れた半分（U+D83C 等）が残る。
    it('サロゲートペアを分断しない', () => {
      const long = `${'🎈'.repeat(200)}.jpg`;
      const result = validateSaveItem({ url: OK_URL, filename: long });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const name = result.value.safeFilename;
      expect(Array.from(name)).toHaveLength(120);
      // 対になっていないサロゲート（割れた絵文字の片割れ）が残っていないこと
      const loneSurrogate =
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
      expect(loneSurrogate.test(name)).toBe(false);
      expect(name.endsWith('.jpg')).toBe(true);
    });

    it('120 コードポイント以下はそのまま通す', () => {
      const name = `${'🎈'.repeat(100)}.jpg`;
      const result = validateSaveItem({ url: OK_URL, filename: name });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.safeFilename).toBe(name);
    });
  });
});

describe('validateSaveItem / bytes', () => {
  it('正の数のみ採用する', () => {
    const ok = validateSaveItem({ url: OK_URL, filename: 'a.jpg', bytes: 1234 });
    expect(ok.ok && ok.value.bytes).toBe(1234);

    const negative = validateSaveItem({
      url: OK_URL,
      filename: 'a.jpg',
      bytes: -1,
    });
    expect(negative.ok && negative.value.bytes).toBeUndefined();
  });
});

describe('deduplicateFilenames', () => {
  it('同名に連番を付ける', () => {
    const items: ValidatedItem[] = [
      { url: OK_URL, safeFilename: 'a.jpg' },
      { url: OK_URL, safeFilename: 'a.jpg' },
      { url: OK_URL, safeFilename: 'A.JPG' },
      { url: OK_URL, safeFilename: 'b.jpg' },
    ];
    expect(deduplicateFilenames(items).map((i) => i.safeFilename)).toEqual([
      'a.jpg',
      'a_1.jpg',
      'A_2.JPG',
      'b.jpg',
    ]);
  });
});
