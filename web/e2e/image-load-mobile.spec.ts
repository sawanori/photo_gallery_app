import { test, expect } from '@playwright/test';

const ADMIN_URL = process.env.E2E_ADMIN_URL!;
const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;

test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

test('Check images on mobile viewport', async ({ page }) => {
  // Login and get gallery URL
  await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(3000);

  const emailInput = page.locator('input[type="email"], input[id="email"]');
  if (await emailInput.count() > 0) {
    await emailInput.fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(5000);
  }

  await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(8000);

  const pageText = await page.textContent('body') || '';
  const urlMatch = pageText.match(/https:\/\/[^\s]+\/gallery\/[A-Za-z0-9_-]+/);
  expect(urlMatch).not.toBeNull();
  const galleryUrl = urlMatch![0];

  // Navigate to gallery
  await page.goto(galleryUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(12_000);

  // Dismiss welcome guide
  const dismissBtn = page.locator('button', { hasText: 'ギャラリーを見る' });
  if (await dismissBtn.count() > 0) {
    await dismissBtn.click();
    await page.waitForTimeout(500);
  }

  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'e2e/screenshots/mobile-gallery.png', fullPage: true });

  // Check each image
  const images = page.locator('img');
  const imageCount = await images.count();
  console.log(`\n=== Mobile: Total <img> elements: ${imageCount} ===\n`);

  let brokenCount = 0;
  let hiddenCount = 0;

  for (let i = 0; i < imageCount; i++) {
    const img = images.nth(i);
    const alt = await img.getAttribute('alt') || '';
    const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
    const complete = await img.evaluate((el: HTMLImageElement) => el.complete);
    const opacity = await img.evaluate((el: HTMLElement) => getComputedStyle(el).opacity);
    const visible = await img.isVisible();

    const isBroken = complete && naturalWidth === 0;
    const isHidden = opacity === '0' || !visible;

    if (isBroken) brokenCount++;
    if (isHidden) hiddenCount++;

    const status = isBroken ? 'BROKEN' : isHidden ? 'HIDDEN(opacity=0)' : 'OK';
    console.log(`[${status}] #${i} alt="${alt}" naturalWidth=${naturalWidth} complete=${complete} opacity=${opacity} visible=${visible}`);
  }

  console.log(`\n=== Mobile Summary: OK=${imageCount - brokenCount - hiddenCount} Broken=${brokenCount} Hidden=${hiddenCount} ===`);

  // Also scroll down to trigger lazy load and re-check
  console.log('\n=== Scrolling to bottom to trigger lazy loading ===');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'e2e/screenshots/mobile-gallery-scrolled.png', fullPage: true });

  let brokenAfterScroll = 0;
  for (let i = 0; i < imageCount; i++) {
    const img = images.nth(i);
    const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
    const complete = await img.evaluate((el: HTMLImageElement) => el.complete);
    const opacity = await img.evaluate((el: HTMLElement) => getComputedStyle(el).opacity);

    if (complete && naturalWidth === 0) {
      const alt = await img.getAttribute('alt') || '';
      const src = await img.getAttribute('src') || '';
      console.log(`[STILL BROKEN] #${i} alt="${alt}" src=${src.substring(0, 120)}`);
      brokenAfterScroll++;
    } else if (opacity === '0') {
      const alt = await img.getAttribute('alt') || '';
      console.log(`[STILL HIDDEN] #${i} alt="${alt}" opacity=0`);
      brokenAfterScroll++;
    }
  }

  console.log(`\n=== After scroll: Broken/Hidden=${brokenAfterScroll} ===`);
});
