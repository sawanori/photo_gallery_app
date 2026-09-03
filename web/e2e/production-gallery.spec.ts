import { test } from '@playwright/test';
import { E2E_GALLERY_URL, E2E_GALLERY_URL_MISSING } from './galleryUrl';

test.describe('Production gallery debug', () => {
  test('Access gallery URL and capture detailed logs', async ({ page }) => {
    test.skip(!E2E_GALLERY_URL, E2E_GALLERY_URL_MISSING);

    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

    const networkErrors: string[] = [];
    page.on('requestfailed', (req) => {
      networkErrors.push(`FAILED: ${req.method()} ${req.url().substring(0, 120)} - ${req.failure()?.errorText}`);
    });

    // Intercept Firebase API calls
    const firebaseRequests: string[] = [];
    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('firestore.googleapis.com') || url.includes('identitytoolkit.googleapis.com')) {
        firebaseRequests.push(`${res.status()} ${res.request().method()} ${url.substring(0, 150)}`);
      }
    });

    console.log('Navigating to gallery...');
    await page.goto(E2E_GALLERY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(15_000);

    console.log('\n=== CONSOLE LOGS ===');
    consoleLogs.forEach((l) => console.log(l));

    console.log('\n=== NETWORK ERRORS ===');
    networkErrors.forEach((l) => console.log(l));

    console.log('\n=== FIREBASE REQUESTS ===');
    firebaseRequests.forEach((l) => console.log(l));

    await page.screenshot({ path: 'e2e/screenshots/gallery-debug.png', fullPage: true });

    const pageContent = await page.textContent('body') || '';
    const hasError = pageContent.includes('アクセスできません') || pageContent.includes('失敗しました');
    console.log('\n=== HAS ERROR:', hasError, '===');

    if (!hasError) {
      const images = await page.locator('img').count();
      console.log('Images found:', images);
    }
  });
});
