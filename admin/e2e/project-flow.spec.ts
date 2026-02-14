import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Project creation and detail flow', () => {
  const timestamp = Date.now();
  const projectName = `E2Eテスト_${timestamp}`;
  const clientName = 'テストクライアント';

  test('create project and verify details', async ({ page }) => {
    // Capture console errors for debugging
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`[BROWSER ERROR] ${msg.text()}`);
      }
    });

    // Login
    await login(page);

    // Click new project button
    await page.getByRole('button', { name: '新規プロジェクト' }).click();
    await page.waitForURL('**/admin/projects/new');
    await expect(page.getByText('新規プロジェクト作成')).toBeVisible({ timeout: 10_000 });

    // Fill project form
    await page.getByLabel('プロジェクト名').fill(projectName);
    await page.getByLabel('クライアント名').fill(clientName);

    // Submit form (Ant Design adds a space between CJK characters: "作 成")
    await page.getByRole('button', { name: /作\s*成/ }).click();

    // Wait for success message or navigation
    await expect(
      page.getByText('プロジェクトを作成しました').or(page.locator('text=プロジェクトの作成に失敗しました'))
    ).toBeVisible({ timeout: 20_000 });

    // Wait for navigation to project detail page (not /new)
    await page.waitForURL(/\/admin\/projects\/(?!new)/, { timeout: 15_000 });

    // Verify project name is displayed on detail page
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });

    // Verify client name is displayed
    await expect(page.getByText(clientName)).toBeVisible();

    // Verify tabs exist (images and invitations)
    await expect(page.getByRole('tab', { name: /画像/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /招待/ })).toBeVisible();

    // Navigate back to dashboard
    await page.getByRole('button', { name: 'プロジェクト一覧に戻る' }).click();
    await page.waitForURL('**/admin/dashboard');
    await expect(page.getByText('プロジェクト一覧')).toBeVisible({ timeout: 10_000 });

    // Verify the created project appears in the list
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  });
});
