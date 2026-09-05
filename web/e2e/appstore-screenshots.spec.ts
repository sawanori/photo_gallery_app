import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';

/**
 * App Store 用のスクリーンショットを撮る。
 *
 * **アプリの画面はほぼ全部この web の中身である。** ネイティブ側は WebView を
 * 表示しているだけなので、同じ寸法・同じ URL で撮れば実機の見え方と一致する。
 * 例外は招待の貼り付け画面（`mobile/src/screens/OpenByLinkScreen.tsx`）で、
 * これはネイティブの画面なのでここでは撮れない。実機かシミュレータで撮ること。
 *
 * 寸法: 6.9インチ = 1290 × 2796 px。
 * CSS の見た目は 430 × 932 pt なので、viewport を 430×932、
 * deviceScaleFactor を 3 にすると出力が 1290×2796 になる。
 *
 *   cd web && npx playwright test e2e/appstore-screenshots.spec.ts
 *
 * **実在のクライアントの写真で撮らないこと。** デモ用の招待を使う。
 */

const ORIGIN = 'https://gallery.non-turn.com';
/**
 * **デモ招待のトークンをこのファイルに書かないこと。**
 * このリポジトリは GitHub 上で公開されている（sawanori/photo_gallery_app）。
 * 招待トークンはギャラリーを開く鍵そのもので、書けば誰でも中の写真を見られる。
 * デモギャラリーには顔が判別できる人物も写っている。
 *
 * 実行時に環境変数で渡す:
 *   DEMO_TOKEN=xxxx npx playwright test e2e/<file>
 */
const DEMO_TOKEN = process.env.DEMO_TOKEN;
const OUT_DIR =
  process.env.SHOT_DIR ?? '/Volumes/DB/illustration_design/appstore-screenshots';

/**
 * 端末プリセット。`SHOT_PRESET=android` で切り替える。既定は iOS。
 *
 * **Google Play は縦横比に上限がある。**「長辺は短辺の 2 倍を超えてはならない」ため、
 * iPhone 6.9インチの 1290 × 2796（比率 2.17）はそのままでは受け付けられない。
 * Android は 1080 × 1920（9:16、比率 1.78）で撮る。最小の 1080px も満たす。
 */
const PRESETS = {
  // iPhone 6.9インチ。@3x で 1290×2796。
  ios: {
    device: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 },
    platform: 'ios' as const,
  },
  // @3x で 1080×1920。
  android: {
    device: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 },
    platform: 'android' as const,
  },
};

const PRESET = PRESETS[(process.env.SHOT_PRESET ?? 'ios') as keyof typeof PRESETS];
if (!PRESET) throw new Error('SHOT_PRESET は ios か android を指定してください');

test.use(PRESET.device);

test.beforeAll(() => {
  mkdirSync(OUT_DIR, { recursive: true });
});

/**
 * 開いているダイアログを閉じる。
 *
 * ガイドを閉じたクリックがそのまま裏の写真に届き、ライトボックスが開いてしまう。
 * 開いたままだと以降のクリックが全部オーバーレイに吸われるので、
 * 操作の前に必ず通す。
 */
async function closeDialogs(page: import('@playwright/test').Page) {
  for (let i = 0; i < 4; i += 1) {
    if ((await page.locator('[role="dialog"]').count()) === 0) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
}

/**
 * ネイティブシェルとして開く。
 *
 * **素のブラウザで撮ると、アプリでは出ない文言が写る。** web は同じ URL でも
 * ネイティブかどうかで表示を変えており、ブラウザ向けには初回ガイドに
 * 「PC からのダウンロードを推奨します」「推奨ブラウザ: Google Chrome。Safari では
 * 表示が不安定になる場合があります」が出る。App Store の掲載画像にこれが載ると、
 * iOS アプリの紹介画像が PC と別ブラウザを勧めていることになる。
 *
 * アプリが注入するのと同じ形の能力情報を入れて、実機と同じ画面にする
 * （mobile/src/bridge/inject.ts の buildInjectedScript と同じ形）。
 * `window.ReactNativeWebView` は用意しない。postToNative はそれが無ければ
 * false を返すだけなので、押しても壊れない。
 */
async function pretendToBeNativeShell(page: import('@playwright/test').Page) {
  await page.addInitScript((platform: 'ios' | 'android') => {
    (window as unknown as { __NATIVE_GALLERY__: unknown }).__NATIVE_GALLERY__ = {
      bridgeVersion: 1,
      supports: [
        'saveImage',
        'saveImages',
        'cancelSave',
        'openSettings',
        'leaveGallery',
      ],
      platform,
      appVersion: '1.0.1',
      nonce: 'screenshot-run',
    };
    window.dispatchEvent(new Event('native-gallery-ready'));
  }, PRESET.platform);
}

test('App Store 用のスクリーンショットを撮る', async ({ page }) => {
  test.setTimeout(180_000);

  await pretendToBeNativeShell(page);
  await page.goto(`${ORIGIN}/gallery/${DEMO_TOKEN}`, { waitUntil: 'domcontentloaded' });

  // 写真が実際に描画されるまで待つ。src が付いただけでは足りない。
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('img')).filter((i) => i.naturalWidth > 0).length >= 4,
    { timeout: 60_000 }
  );
  // 遅れて入る画像とレイアウトの落ち着きを待つ
  await page.waitForTimeout(4000);

  // --- 0. 初回ガイド ---
  // 初回訪問時に出るモーダル。実際に利用者が最初に見る画面なので1枚残す。
  // これを閉じないと、以降のクリックがすべてこのオーバーレイに吸われる。
  const welcome = page.getByRole('button', { name: 'ギャラリーを見る' });
  if (await welcome.count()) {
    await page.screenshot({ path: `${OUT_DIR}/00-welcome.png` });
    console.log('00-welcome.png');
    await welcome.click();
    await page.waitForTimeout(1500);
  }
  await closeDialogs(page);

  // --- 1. ギャラリー一覧 ---
  await page.screenshot({ path: `${OUT_DIR}/01-gallery.png` });
  console.log('01-gallery.png');

  // --- 2. お気に入りを付けた状態 ---
  // ハートが付いていることが分かる絵にする。閲覧者の選定機能の説明になる。
  /**
   * カードのボタンは**カードをホバーするまで押せない**。
   * 見えていないボタンがタップを受けてしまう問題（監査 F4）を塞いだとき、
   * `pointer-events-none` を既定にしたため。ボタンだけを狙って click すると
   * 「見えているのに押せない」状態で待ち続けてタイムアウトする。
   * 実利用では desktop はホバーで、タッチ端末は常時操作可になる。
   */
  const cards = page.locator('[data-image-id]');
  const cardCount = await cards.count();
  const heartCount = Math.min(3, cardCount);
  for (let i = 0; i < heartCount; i += 1) {
    await closeDialogs(page);
    const card = cards.nth(i);
    await card.hover();
    await card.getByRole('button', { name: 'いいね' }).click();
    await page.waitForTimeout(700);
  }
  await closeDialogs(page);
  await page.mouse.move(0, 0); // ハートを押した直後のカードが浮いたまま写らないように
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT_DIR}/02-favourites.png` });
  console.log(`02-favourites.png（${Math.min(3, heartCount)} 枚にハートを付けた）`);

  // --- 3. 写真を1枚開いた状態 ---
  //
  // **拡大画像の読み込み完了を待つ。時間で待たない。**
  // 以前は click のあと 2.5 秒待つだけだった。ライトボックスは 1920px の
  // 画像を取り直すため間に合わないことがあり、スピナーと「読み込み中」が
  // 出たままの暗い画面が撮れて、そのまま App Store に出しかけた。
  await closeDialogs(page);
  const firstImage = page.locator('img').first();
  await firstImage.click();

  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 30_000 });
  // 「読み込み中」も「読み込めませんでした」も消えていること。
  await expect(dialog).not.toContainText('読み込み中', { timeout: 60_000 });
  await expect(dialog).not.toContainText('読み込めませんでした', { timeout: 5_000 });
  // 実際に画素が来ていること。src が付いただけの img を弾く。
  //
  // **`img` だけで引かないこと。** ライトボックスは原寸が届くまでのつなぎに
  // 640px のサムネイルを重ねており、それがダイアログ内の最初の img になる。
  // つなぎは原寸が出た時点で opacity-0 に落ちるので、そちらを見ていると
  // この条件は永久に成立しない。`aria-hidden` が付いていないほうが本画像。
  await page.waitForFunction(
    () => {
      const d = document.querySelector('[role="dialog"]');
      const img = d?.querySelector<HTMLImageElement>('img:not([aria-hidden])');
      return !!img && img.naturalWidth > 0 && getComputedStyle(img).opacity === '1';
    },
    { timeout: 60_000 }
  );
  // カーソルを画面外へ逃がす。カードの上に置いたままだと、そのカードの
  // お気に入り／保存ボタンが暗転した背景越しに透けて、閉じるボタンと重なる。
  await page.mouse.move(0, 0);
  await page.waitForTimeout(700); // フェードインとホバー解除を終わらせる
  await page.screenshot({ path: `${OUT_DIR}/03-lightbox.png` });
  console.log('03-lightbox.png（拡大画像の読み込み完了を確認済み）');

  await closeDialogs(page);

  // --- 4. 下までスクロールした一覧 ---
  // 枚数が多いことが伝わる絵。無限スクロールで追加読み込みされる。
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT_DIR}/04-gallery-scrolled.png` });
  console.log('04-gallery-scrolled.png');

  // --- 5. 保存の導線が見える状態 ---
  // 一覧の先頭に戻し、ヘッダーの「すべて保存 / ZIP」が写るようにする。
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT_DIR}/05-save-actions.png` });
  console.log('05-save-actions.png');

  console.log(`\n出力先: ${OUT_DIR}`);
});
