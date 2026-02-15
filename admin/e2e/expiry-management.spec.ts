import { test, expect } from '@playwright/test';

const ADMIN_BASE_URL = process.env.E2E_ADMIN_BASE_URL;
const WEB_BASE_URL = process.env.E2E_WEB_BASE_URL;
const PROJECT_ID = process.env.E2E_PROJECT_ID;
const INVITATION_ID = process.env.E2E_INVITATION_ID;

if (!ADMIN_BASE_URL) {
  throw new Error('E2E_ADMIN_BASE_URL must be set in .env.test');
}

async function loginToAdmin(page: import('@playwright/test').Page) {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set');
  }

  await page.goto(`${ADMIN_BASE_URL}/`);

  // Wait for login page to load
  await expect(page.getByRole('button', { name: 'サインイン' })).toBeVisible({ timeout: 15_000 });

  // Fill login form
  await page.getByPlaceholder('admin@example.com').fill(email);
  await page.getByPlaceholder('パスワード').fill(password);

  // Click sign in
  await page.getByRole('button', { name: 'サインイン' }).click();

  // Wait for dashboard
  await page.waitForURL('**/admin/dashboard', { timeout: 20_000 });
  await expect(page.getByText('プロジェクト一覧')).toBeVisible({ timeout: 10_000 });
}

test.describe('期限管理機能 - 本番環境チェック', () => {
  test.describe('ダッシュボード', () => {
    test('ダッシュボードにプロジェクトカードが表示され、期限タグの有無を確認', async ({ page }) => {
      await loginToAdmin(page);

      // プロジェクトカードが1つ以上表示されることを確認
      const cards = page.locator('.ant-card');
      await expect(cards.first()).toBeVisible({ timeout: 10_000 });
      const cardCount = await cards.count();
      console.log(`[ダッシュボード] プロジェクト数: ${cardCount}件`);

      // ページ全体のスクリーンショットを取得
      await page.screenshot({ path: 'test-results/dashboard-overview.png', fullPage: true });

      // 期限タグの存在チェック
      const warningTags = page.locator('.ant-tag').filter({ hasText: /削除まで.*日/ });
      const expiredTags = page.locator('.ant-tag').filter({ hasText: '期限切れ' });

      const warningCount = await warningTags.count();
      const expiredCount = await expiredTags.count();
      console.log(`[期限タグ] 警告タグ: ${warningCount}件, 期限切れタグ: ${expiredCount}件`);

      // 期限切れプロジェクトがある場合のアラートバナー確認
      if (expiredCount > 0) {
        const alert = page.locator('.ant-alert-error').filter({ hasText: /期限切れのプロジェクトが.*件あります/ });
        await expect(alert).toBeVisible();
        console.log('[期限切れアラート] 表示あり');

        const bulkDeleteBtn = page.getByRole('button', { name: '一括削除' });
        await expect(bulkDeleteBtn).toBeVisible();
        console.log('[一括削除ボタン] 表示あり');
      } else {
        console.log('[期限切れアラート] 期限切れプロジェクトなし - アラート非表示（正常）');
      }

      // デプロイ状態の確認: プロジェクトカード内のタグ構造をチェック
      // 期限管理機能がデプロイされていれば、7日以上前のプロジェクトにタグが出るはず
      // 全プロジェクトが7日未満なら、タグが出ないのは正常
      const allTagTexts = await page.locator('.ant-tag').allTextContents();
      console.log(`[全タグ一覧] ${JSON.stringify(allTagTexts)}`);
    });

    test('ステータスフィルターが正常に動作する', async ({ page }) => {
      await loginToAdmin(page);

      // 全フィルターオプションの表示確認
      await expect(page.getByTitle('すべて')).toBeVisible();
      await expect(page.getByTitle('進行中')).toBeVisible();
      await expect(page.getByTitle('納品済み')).toBeVisible();
      await expect(page.getByTitle('アーカイブ')).toBeVisible();
    });
  });

  test.describe('プロジェクト詳細ページ', () => {
    test('プロジェクト詳細ページにアクセスし、期限警告の有無を確認', async ({ page }) => {
      test.setTimeout(90_000);

      await loginToAdmin(page);

      // プロジェクト詳細へ直接遷移（networkidleではなくdomcontentloadedを使用）
      await page.goto(`${ADMIN_BASE_URL}/admin/projects/${PROJECT_ID}`, {
        waitUntil: 'domcontentloaded',
      });

      // プロジェクト名 (h2) が表示されるまで待機
      const projectTitle = page.locator('h2');
      await expect(projectTitle).toBeVisible({ timeout: 20_000 });
      const titleText = await projectTitle.textContent();
      console.log(`[プロジェクト名] ${titleText}`);

      // ステータスバッジ確認
      const statusTag = page.locator('.ant-tag').first();
      await expect(statusTag).toBeVisible();
      const statusText = await statusTag.textContent();
      console.log(`[ステータス] ${statusText}`);

      // 期限警告アラートの確認
      // warning = .ant-alert-warning（作成7-13日: オレンジ）
      // danger/expired = .ant-alert-error（14日以上: 赤）
      const warningAlert = page.locator('.ant-alert-warning');
      const errorAlert = page.locator('.ant-alert-error');

      const hasWarning = await warningAlert.count() > 0;
      const hasError = await errorAlert.count() > 0;

      if (hasWarning) {
        const alertText = await warningAlert.textContent();
        console.log(`[警告アラート] ${alertText}`);
        await expect(warningAlert.filter({ hasText: /日経過/ })).toBeVisible();
      } else if (hasError) {
        const alertText = await errorAlert.textContent();
        console.log(`[エラーアラート] ${alertText}`);
        const isExpired = await errorAlert.filter({ hasText: /期限切れです/ }).count() > 0;
        const isDanger = await errorAlert.filter({ hasText: /日経過/ }).count() > 0;
        if (isExpired) console.log('[判定] 期限切れ (expired)');
        else if (isDanger) console.log('[判定] 残り日数わずか (danger)');
      } else {
        console.log('[期限アラート] なし（7日未満 or archived、またはデプロイ未反映の可能性）');
      }

      // タブの存在確認
      await expect(page.getByRole('tab', { name: /画像/ })).toBeVisible();
      await expect(page.getByRole('tab', { name: /招待/ })).toBeVisible();

      // スクリーンショット
      await page.screenshot({ path: 'test-results/project-detail-expiry.png', fullPage: true });
    });

    test('招待詳細ページにアクセスできる', async ({ page }) => {
      test.setTimeout(90_000);

      await loginToAdmin(page);

      await page.goto(`${ADMIN_BASE_URL}/admin/projects/${PROJECT_ID}/invitations/${INVITATION_ID}`, {
        waitUntil: 'domcontentloaded',
      });

      // ページのコンテンツが表示されるまで待機
      await page.waitForLoadState('domcontentloaded');

      // ナビゲーションボタンまたはコンテンツの存在確認
      await expect(page.locator('body')).not.toBeEmpty();

      // 少し待機してレンダリング完了を待つ
      await page.waitForTimeout(3000);

      await page.screenshot({ path: 'test-results/invitation-detail.png', fullPage: true });

      // 戻るボタンまたは何らかのUIが表示される
      const bodyText = await page.locator('body').textContent();
      console.log(`[招待詳細] コンテンツ: ${bodyText?.substring(0, 300)}`);
    });
  });

  test.describe('招待ギャラリー（Web）', () => {
    test('招待URLでギャラリーにアクセスできる', async ({ page }) => {
      if (!WEB_BASE_URL) {
        test.skip();
        return;
      }

      await page.goto(WEB_BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      await page.screenshot({ path: 'test-results/web-gallery.png', fullPage: true });

      const bodyText = await page.locator('body').textContent();
      console.log(`[Webギャラリー] ${bodyText?.substring(0, 200)}`);
    });
  });
});
