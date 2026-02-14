import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('displays project list heading', async ({ page }) => {
    await expect(page.getByText('プロジェクト一覧')).toBeVisible();
  });

  test('has new project button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: '新規プロジェクト' })
    ).toBeVisible();
  });

  test('has status filter with all options', async ({ page }) => {
    // Target the Segmented filter specifically by its title attribute
    await expect(page.getByTitle('すべて')).toBeVisible();
    await expect(page.getByTitle('進行中')).toBeVisible();
    await expect(page.getByTitle('納品済み')).toBeVisible();
    await expect(page.getByTitle('アーカイブ')).toBeVisible();
  });

  test('new project button navigates to creation page', async ({ page }) => {
    await page.getByRole('button', { name: '新規プロジェクト' }).click();
    await page.waitForURL('**/admin/projects/new');
    await expect(page.getByText('新規プロジェクト作成')).toBeVisible({ timeout: 10_000 });
  });
});
