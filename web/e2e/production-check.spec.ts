import { test, expect } from '@playwright/test';

const ADMIN_URL = process.env.E2E_ADMIN_URL!;
const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;

let galleryUrl = '';

test.describe.serial('Production environment check', () => {
  // ─── Admin Panel ───

  test('1. Admin: ログインページが表示される', async ({ page }) => {
    await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Should redirect to login
    const hasLoginForm = await page.locator('input[type="password"]').count();
    console.log('Login form found:', hasLoginForm > 0);
    await page.screenshot({ path: 'e2e/screenshots/01-admin-login.png', fullPage: true });
    expect(hasLoginForm).toBeGreaterThan(0);
  });

  test('2. Admin: ログインしてプロジェクト招待ページが開ける', async ({ page }) => {
    // Go to admin URL (will redirect to login)
    await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Login
    const emailInput = page.locator('input[type="email"], input[id="email"]');
    if (await emailInput.count() > 0) {
      await emailInput.fill(EMAIL);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(5000);
    }

    // Navigate to invitation detail
    await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(8000);
    await page.screenshot({ path: 'e2e/screenshots/02-admin-invitation.png', fullPage: true });

    // Extract gallery URL
    const pageText = await page.textContent('body') || '';
    const urlMatch = pageText.match(/https:\/\/[^\s]+\/gallery\/[A-Za-z0-9_-]+/);
    console.log('Gallery URL found:', urlMatch?.[0] || 'NOT FOUND');
    expect(urlMatch).not.toBeNull();
    galleryUrl = urlMatch![0];

    // Check invitation details are visible
    const hasClientName = pageText.includes('クライアント名');
    const hasExpiry = pageText.includes('有効期限');
    console.log('Has client name:', hasClientName, '| Has expiry:', hasExpiry);
    expect(hasClientName).toBe(true);
    expect(hasExpiry).toBe(true);
  });

  // ─── Client Gallery ───

  test('3. Gallery: ギャラリーページが表示される', async ({ page }) => {
    expect(galleryUrl).toBeTruthy();

    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    const networkErrors: string[] = [];
    page.on('requestfailed', (req) => {
      networkErrors.push(`FAILED: ${req.method()} ${req.url().substring(0, 150)} - ${req.failure()?.errorText}`);
    });

    await page.goto(galleryUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(10_000);
    await page.screenshot({ path: 'e2e/screenshots/03-gallery-page.png', fullPage: true });

    const pageText = await page.textContent('body') || '';
    const hasError = pageText.includes('アクセスできません') ||
                     pageText.includes('無効です') ||
                     pageText.includes('期限切れ');
    console.log('Gallery error:', hasError);
    if (hasError) console.log('Page text:', pageText.substring(0, 300));

    // Log console errors
    if (consoleLogs.length > 0) {
      console.log('=== Console Errors ===');
      consoleLogs.forEach((l) => console.log(l));
    }
    if (networkErrors.length > 0) {
      console.log('=== Network Errors ===');
      networkErrors.forEach((l) => console.log(l));
    }

    expect(hasError).toBe(false);

    // Check images exist
    const imgCount = await page.locator('img').count();
    console.log('Images found:', imgCount);
    expect(imgCount).toBeGreaterThan(0);
  });

  test('4. Gallery: ヘッダー情報が正しく表示される', async ({ page }) => {
    expect(galleryUrl).toBeTruthy();
    await page.goto(galleryUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(8000);

    // Dismiss welcome guide if shown
    const dismissBtn = page.locator('button', { hasText: 'ギャラリーを見る' });
    if (await dismissBtn.count() > 0) {
      await dismissBtn.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: 'e2e/screenshots/04-gallery-header.png' });

    const pageText = await page.textContent('body') || '';

    // Check expiry display (format: "○月○日まで")
    const hasExpiryText = /\d+月\d+日まで/.test(pageText);
    console.log('Expiry text visible:', hasExpiryText);

    // Check photo count
    const hasPhotoCount = /\d+\s*photos/.test(pageText);
    console.log('Photo count visible:', hasPhotoCount);

    // Check client name in header
    const hasClientName = await page.locator('h1').first().textContent() || '';
    console.log('Header title:', hasClientName);

    expect(hasPhotoCount).toBe(true);
    expect(hasExpiryText).toBe(true);
  });

  test('5. Gallery: WelcomeGuideモーダルが表示される（初回）', async ({ page, context }) => {
    expect(galleryUrl).toBeTruthy();
    // Clear localStorage to simulate first visit
    await context.clearCookies();

    await page.goto(galleryUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(8000);

    // Clear the welcome guide dismissed flag
    await page.evaluate(() => localStorage.removeItem('welcome_guide_dismissed'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);

    await page.screenshot({ path: 'e2e/screenshots/05-welcome-guide.png', fullPage: true });

    const pageText = await page.textContent('body') || '';
    const hasGuide = pageText.includes('ギャラリーの使い方');
    const hasStep1 = pageText.includes('閲覧');
    const hasStep2 = pageText.includes('お気に入り');
    const hasStep3 = pageText.includes('ダウンロード');
    const hasButton = pageText.includes('ギャラリーを見る');
    console.log('Welcome guide visible:', hasGuide);
    console.log('Steps:', { hasStep1, hasStep2, hasStep3 });
    console.log('CTA button:', hasButton);

    expect(hasGuide).toBe(true);
    expect(hasStep1).toBe(true);
    expect(hasStep2).toBe(true);
    expect(hasStep3).toBe(true);
    expect(hasButton).toBe(true);

    // Dismiss the guide
    const dismissBtn = page.locator('button', { hasText: 'ギャラリーを見る' });
    if (await dismissBtn.count() > 0) {
      await dismissBtn.click();
      await page.waitForTimeout(500);
      const guideStillVisible = await page.locator('text=ギャラリーの使い方').count();
      console.log('Guide dismissed:', guideStillVisible === 0);
      expect(guideStillVisible).toBe(0);
    }
  });

  test('6. Gallery: 画像クリックでライトボックスが開く', async ({ page }) => {
    expect(galleryUrl).toBeTruthy();
    await page.goto(galleryUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(8000);

    // Dismiss welcome guide if shown
    const dismissBtn = page.locator('button', { hasText: 'ギャラリーを見る' });
    if (await dismissBtn.count() > 0) {
      await dismissBtn.click();
      await page.waitForTimeout(500);
    }

    // Click first image card (the parent div has the onClick, overlay intercepts img click)
    const firstCard = page.locator('.break-inside-avoid').first();
    await firstCard.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/screenshots/06-lightbox.png', fullPage: true });

    // Check lightbox opened (should have navigation and counter)
    const pageText = await page.textContent('body') || '';
    const hasCounter = /\d+\s*of\s*\d+/.test(pageText);
    console.log('Lightbox counter visible:', hasCounter);
    expect(hasCounter).toBe(true);

    // Navigate to next image
    const nextBtn = page.locator('button').filter({
      has: page.locator('path[d*="8.25 4.5"]'),
    });
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'e2e/screenshots/06-lightbox-next.png', fullPage: true });

      const textAfterNav = await page.textContent('body') || '';
      const hasUpdatedCounter = textAfterNav.includes('2 of');
      console.log('Navigated to next image:', hasUpdatedCounter);

      // Check image is visible (not just spinner)
      const lightboxImg = page.locator('img[class*="object-contain"]');
      const imgVisible = await lightboxImg.count();
      console.log('Lightbox image element present:', imgVisible > 0);
      expect(imgVisible).toBeGreaterThan(0);
    }
  });

  test('7. Gallery: お気に入りページが表示される', async ({ page }) => {
    expect(galleryUrl).toBeTruthy();
    const likedUrl = galleryUrl.replace(/\/gallery\/.*/, '/liked');
    await page.goto(likedUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'e2e/screenshots/07-liked-page.png', fullPage: true });

    const pageText = await page.textContent('body') || '';
    console.log('Liked page text:', pageText.substring(0, 300));

    // Should not show error
    const hasError = pageText.includes('アクセスできません') || pageText.includes('エラー');
    console.log('Liked page error:', hasError);
  });

  test('8. Gallery: ルートページが正常表示される', async ({ page }) => {
    const rootUrl = galleryUrl.replace(/\/gallery\/.*/, '/');
    await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'e2e/screenshots/08-root-page.png', fullPage: true });

    const pageText = await page.textContent('body') || '';
    const hasMessage = pageText.includes('招待リンクからアクセスしてください');
    console.log('Root page message:', hasMessage);
    expect(hasMessage).toBe(true);
  });
});
