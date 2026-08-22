import { test, expect } from '@playwright/test';

/**
 * App Store のレビュアーがたどる経路を、そのまま本番で確認する。
 *
 * **却下理由として一番多いのは Guideline 2.1（レビュアーが中身に到達できない）である。**
 * この App は招待制で、レビュアーは審査メモに書いた招待だけを頼りに中へ入る。
 * その招待が期限切れ・無効・空だと、レビュアーには「アプリが動かない」としか見えない。
 *
 * ここで確かめるのは3点だけ。
 *   1. デモ招待のギャラリーが開く
 *   2. 写真が実際に表示される（枠だけ出て中身が来ない状態を弾く）
 *   3. 提出予定日から見て、審査期間中に期限が切れない
 *
 * 提出直前に必ず走らせること。
 *   cd web && npx playwright test e2e/review-demo.spec.ts
 *
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
const DEMO_URL = `${ORIGIN}/gallery/${DEMO_TOKEN}`;

// 未設定なら**落とす**。スキップにすると「通った」と読めてしまう。
test.beforeAll(() => {
  if (!DEMO_TOKEN) {
    throw new Error(
      'DEMO_TOKEN が未設定です。 DEMO_TOKEN=<招待トークン> npx playwright test <このファイル> のように渡してください。'
    );
  }
});

/** 審査に要する日数の見込み。これを下回る残日数なら招待を作り直す。 */
const REVIEW_HEADROOM_DAYS = 14;

test.describe('App Store 審査用のデモ招待', () => {
  test('レビュアーの経路でギャラリーが開き、写真が表示される', async ({ page }) => {
    const failures: string[] = [];
    page.on('requestfailed', (req) => {
      failures.push(`${req.method()} ${req.url().slice(0, 120)} — ${req.failure()?.errorText}`);
    });

    const response = await page.goto(DEMO_URL, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), 'ギャラリー URL が 200 を返すこと').toBe(200);

    // 「招待リンクが無効です」の類が出ていないこと。
    // これが出ると、レビュアーには中身が一切見えない。
    await expect(page.locator('body')).not.toContainText('無効', { timeout: 20_000 });
    await expect(page.locator('body')).not.toContainText('期限', { timeout: 5_000 });

    // 写真が実際に読み込まれたか。src が付いているだけでは足りず、
    // naturalWidth が 0 でないことまで見る（読み込み失敗した img も DOM には残る）。
    await page.waitForFunction(
      () => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.filter((i) => i.naturalWidth > 0).length > 0;
      },
      { timeout: 45_000 }
    );

    const loaded = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('img')).filter((i) => i.naturalWidth > 0).length
    );
    console.log(`表示された写真: ${loaded} 枚`);
    expect(loaded, '写真が1枚も表示されていない').toBeGreaterThan(0);

    if (failures.length > 0) {
      console.log('失敗したリクエスト:');
      failures.forEach((f) => console.log(`  ${f}`));
    }
  });

  test('審査期間中に招待の期限が切れない', async ({ page }) => {
    await page.goto(DEMO_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('img')).some((i) => i.naturalWidth > 0),
      { timeout: 45_000 }
    );

    // 画面に出ている「〇月〇日まで」を読む。招待の閲覧期限そのもの。
    const body = (await page.locator('body').innerText()).replace(/\s+/g, '');
    const match = body.match(/(\d{1,2})月(\d{1,2})日まで/);
    expect(match, '閲覧期限の表示が見つからない').not.toBeNull();

    const now = new Date();
    const month = Number(match![1]);
    const day = Number(match![2]);
    // 表示は年を含まない。今より過去の月日なら翌年とみなす。
    let deadline = new Date(now.getFullYear(), month - 1, day);
    if (deadline.getTime() < now.getTime()) {
      deadline = new Date(now.getFullYear() + 1, month - 1, day);
    }

    const remainingDays = Math.floor(
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    console.log(`閲覧期限まで残り ${remainingDays} 日（${month}月${day}日まで）`);

    expect(
      remainingDays,
      `残り ${remainingDays} 日では審査中に切れる恐れがある。招待を作り直すこと`
    ).toBeGreaterThanOrEqual(REVIEW_HEADROOM_DAYS);
  });
});
