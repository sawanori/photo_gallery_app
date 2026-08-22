import { test, expect } from '@playwright/test';

const ADMIN_URL = process.env.E2E_ADMIN_URL!;
const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;

test('Check all images loading status', async ({ page }) => {
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

  // Wait for all images to potentially load
  await page.waitForTimeout(5000);

  // Check each image
  const images = page.locator('img');
  const imageCount = await images.count();
  console.log(`\n=== Total <img> elements: ${imageCount} ===\n`);

  const brokenImages: string[] = [];
  const loadedImages: string[] = [];

  for (let i = 0; i < imageCount; i++) {
    const img = images.nth(i);
    const src = await img.getAttribute('src') || '';
    const alt = await img.getAttribute('alt') || '';
    const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
    const naturalHeight = await img.evaluate((el: HTMLImageElement) => el.naturalHeight);
    const complete = await img.evaluate((el: HTMLImageElement) => el.complete);
    const opacity = await img.evaluate((el: HTMLElement) => getComputedStyle(el).opacity);
    const display = await img.evaluate((el: HTMLElement) => getComputedStyle(el).display);

    const isBroken = complete && naturalWidth === 0;
    const isHidden = opacity === '0' || display === 'none';

    const status = isBroken ? 'BROKEN' : isHidden ? 'HIDDEN' : 'OK';
    const info = `[${status}] #${i} alt="${alt}" size=${naturalWidth}x${naturalHeight} complete=${complete} opacity=${opacity} src=${src.substring(0, 120)}`;

    if (isBroken || isHidden) {
      brokenImages.push(info);
    } else {
      loadedImages.push(info);
    }
    console.log(info);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Loaded: ${loadedImages.length}`);
  console.log(`Broken/Hidden: ${brokenImages.length}`);

  if (brokenImages.length > 0) {
    console.log('\n=== Broken/Hidden Images ===');
    brokenImages.forEach((img) => console.log(img));
  }

  // Take full page screenshot
  await page.screenshot({ path: 'e2e/screenshots/image-load-check.png', fullPage: true });

  // Also check next/image config
  const nextConfig = await page.evaluate(() => {
    // Check if there are any image errors in the DOM
    const errorImgs = document.querySelectorAll('img[data-nimg]');
    return Array.from(errorImgs).map((img) => ({
      src: (img as HTMLImageElement).src.substring(0, 150),
      naturalWidth: (img as HTMLImageElement).naturalWidth,
      complete: (img as HTMLImageElement).complete,
    }));
  });
  console.log('\n=== Next.js Image elements ===');
  nextConfig.forEach((img, i) => {
    console.log(`  ${i}: ${img.naturalWidth > 0 ? 'OK' : 'FAIL'} - ${img.src}`);
  });
});
