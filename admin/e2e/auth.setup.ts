import { test, expect } from '@playwright/test';

test('login with admin credentials', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set in environment variables');
  }

  // Go to login page
  await page.goto('/');

  // Verify login page elements
  await expect(page.getByText('Gallery Admin')).toBeVisible();
  await expect(page.getByPlaceholder('admin@example.com')).toBeVisible();
  await expect(page.getByPlaceholder('パスワード')).toBeVisible();

  // Fill login form
  await page.getByPlaceholder('admin@example.com').fill(email);
  await page.getByPlaceholder('パスワード').fill(password);

  // Click sign in
  await page.getByRole('button', { name: 'サインイン' }).click();

  // Wait for navigation to dashboard
  await page.waitForURL('**/admin/dashboard', { timeout: 15_000 });

  // Verify dashboard loaded
  await expect(page.getByText('プロジェクト一覧')).toBeVisible({ timeout: 10_000 });
});
