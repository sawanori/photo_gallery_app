import { test } from '@playwright/test';
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

// iPhone 6.9インチ。@3x で 1290×2796 になる。
test.use({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 });

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

test('App Store 用のスクリーンショットを撮る', async ({ page }) => {
  test.setTimeout(180_000);

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
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT_DIR}/02-favourites.png` });
  console.log(`02-favourites.png（${Math.min(3, heartCount)} 枚にハートを付けた）`);

  // --- 3. 写真を1枚開いた状態 ---
  await closeDialogs(page);
  const firstImage = page.locator('img').first();
  await firstImage.click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT_DIR}/03-lightbox.png` });
  console.log('03-lightbox.png');

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
