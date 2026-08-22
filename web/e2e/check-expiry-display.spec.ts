import { test, expect } from '@playwright/test';

const ADMIN_URL = process.env.E2E_ADMIN_URL!;
const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;

test.describe('Expiry date display check', () => {
  test('Admin invitation page shows gallery URL, then gallery shows expiry date', async ({ page }) => {
    // Step 1: Login to admin
    console.log('=== Step 1: Login to admin ===');
    await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait for login page or redirect
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    console.log('Current URL after nav:', currentUrl);

    // If redirected to login page, login
    if (currentUrl.includes('login') || await page.locator('input[type="email"], input[id="email"]').count() > 0) {
      console.log('Login form detected, logging in...');
      await page.fill('input[type="email"], input[id="email"]', EMAIL);
      await page.fill('input[type="password"], input[id="password"]', PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);
      console.log('After login URL:', page.url());
    }

    // Step 2: Navigate to invitation detail page
    console.log('=== Step 2: Navigate to invitation detail ===');
    await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(8000);

    // Take screenshot of admin page
    await page.screenshot({ path: 'e2e/screenshots/admin-invitation-detail.png', fullPage: true });

    // Extract gallery URL from the page
    const pageText = await page.textContent('body') || '';
    console.log('Page text (first 500):', pageText.substring(0, 500));

    // Find the gallery URL in the page
    const galleryUrlMatch = pageText.match(/https:\/\/[^\s]+\/gallery\/[A-Za-z0-9_-]+/);
    console.log('Gallery URL found:', galleryUrlMatch?.[0] || 'NOT FOUND');

    expect(galleryUrlMatch).not.toBeNull();
    const galleryUrl = galleryUrlMatch![0];

    // Step 3: Navigate to gallery and check expiry display
    console.log('=== Step 3: Check gallery ===');
    await page.goto(galleryUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(8000);

    await page.screenshot({ path: 'e2e/screenshots/gallery-expiry-check.png', fullPage: true });

    const galleryText = await page.textContent('body') || '';
    console.log('Gallery body text (first 500):', galleryText.substring(0, 500));

    // Check expiry text is present
    const hasExpiryText = galleryText.includes('まで閲覧可能');
    console.log('Has expiry text:', hasExpiryText);

    // Check photo count
    const hasPhotos = galleryText.includes('photos');
    console.log('Has photos text:', hasPhotos);

    // Check for errors
    const hasError = galleryText.includes('アクセスできません') || galleryText.includes('失敗しました');
    console.log('Has error:', hasError);

    if (hasExpiryText) {
      // Extract the expiry text
      const expiryMatch = galleryText.match(/\d+月\d+日まで閲覧可能/);
      console.log('Expiry text:', expiryMatch?.[0] || 'Pattern not matched');
    }

    expect(hasError).toBe(false);
    expect(hasExpiryText).toBe(true);
  });
});
