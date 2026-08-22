import { test, expect } from '@playwright/test';

const ADMIN_URL = process.env.E2E_ADMIN_URL!;
const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;

test('Measure gallery performance metrics', async ({ page }) => {
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

  // --- Measurement 1: Page load ---
  console.log('\n========================================');
  console.log('  GALLERY PERFORMANCE REPORT');
  console.log('========================================\n');

  // Track all image requests
  const imageRequests: { url: string; size: number; duration: number; format: string }[] = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/_next/image') || (url.includes('firebasestorage') && response.headers()['content-type']?.startsWith('image'))) {
      const contentType = response.headers()['content-type'] || 'unknown';
      const contentLength = parseInt(response.headers()['content-length'] || '0', 10);
      const timing = response.request().timing();
      const duration = timing.responseEnd > 0 ? timing.responseEnd - timing.requestStart : 0;

      let size = contentLength;
      if (size === 0) {
        try {
          const body = await response.body();
          size = body.length;
        } catch { /* ignore */ }
      }

      imageRequests.push({
        url: url.substring(0, 80),
        size,
        duration: Math.round(duration),
        format: contentType,
      });
    }
  });

  // Load gallery page (cold)
  const startTime = Date.now();
  await page.goto(galleryUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const domContentLoaded = Date.now() - startTime;

  // Dismiss welcome guide
  await page.waitForTimeout(3000);
  await page.evaluate(() => localStorage.setItem('welcome_guide_dismissed', '1'));
  const dismissBtn = page.locator('button', { hasText: 'ギャラリーを見る' });
  if (await dismissBtn.count() > 0) {
    await dismissBtn.click();
    await page.waitForTimeout(500);
  }

  // Wait for all images
  await page.waitForTimeout(8000);
  const allImagesLoaded = Date.now() - startTime;

  // Check all images are visible
  const imgs = page.locator('img');
  const imgCount = await imgs.count();
  let visibleCount = 0;
  for (let i = 0; i < imgCount; i++) {
    const opacity = await imgs.nth(i).evaluate((el: HTMLElement) => getComputedStyle(el).opacity);
    if (opacity === '1') visibleCount++;
  }

  console.log('--- Page Load ---');
  console.log(`  DOMContentLoaded:     ${domContentLoaded}ms`);
  console.log(`  All images loaded:    ${allImagesLoaded}ms`);
  console.log(`  Images visible:       ${visibleCount}/${imgCount}`);

  // --- Measurement 2: Image sizes ---
  console.log('\n--- Image Transfer ---');
  const totalBytes = imageRequests.reduce((sum, r) => sum + r.size, 0);
  const avgDuration = imageRequests.length > 0
    ? Math.round(imageRequests.reduce((sum, r) => sum + r.duration, 0) / imageRequests.length)
    : 0;

  // Count formats
  const formats: Record<string, number> = {};
  imageRequests.forEach((r) => {
    const fmt = r.format.includes('avif') ? 'AVIF' : r.format.includes('webp') ? 'WebP' : r.format.includes('jpeg') ? 'JPEG' : r.format;
    formats[fmt] = (formats[fmt] || 0) + 1;
  });

  console.log(`  Total images fetched: ${imageRequests.length}`);
  console.log(`  Total transfer size:  ${(totalBytes / 1024).toFixed(1)} KB (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  Avg per image:        ${(totalBytes / Math.max(imageRequests.length, 1) / 1024).toFixed(1)} KB`);
  console.log(`  Avg load time:        ${avgDuration}ms`);
  console.log(`  Formats used:         ${JSON.stringify(formats)}`);

  // Per-image details
  console.log('\n--- Per Image Detail ---');
  imageRequests
    .sort((a, b) => b.size - a.size)
    .forEach((r, i) => {
      console.log(`  ${i + 1}. ${(r.size / 1024).toFixed(1)} KB | ${r.duration}ms | ${r.format} | ${r.url}`);
    });

  // --- Measurement 3: Lightbox navigation speed ---
  console.log('\n--- Lightbox Navigation ---');
  const firstCard = page.locator('.break-inside-avoid').first();
  await firstCard.click({ force: true });
  // Wait for lightbox to appear and first image to load
  await page.waitForFunction(() => {
    const img = document.querySelector('img[class*="object-contain"]') as HTMLImageElement;
    return img && img.complete && img.naturalWidth > 0;
  }, { timeout: 15_000 });
  console.log('  Lightbox opened');

  // Navigate through 3 images and measure
  for (let i = 0; i < 3; i++) {
    const navStart = Date.now();
    const nextBtn = page.locator('button').filter({
      has: page.locator('path[d*="8.25 4.5"]'),
    });
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
      // Wait for image to become visible (opacity 1)
      await page.waitForFunction(() => {
        const img = document.querySelector('img[class*="object-contain"]') as HTMLImageElement;
        return img && img.complete && img.naturalWidth > 0 && getComputedStyle(img).opacity === '1';
      }, { timeout: 15_000 });
      const navTime = Date.now() - navStart;
      console.log(`  Image ${i + 2}: ${navTime}ms`);
    }
  }

  // --- Measurement 4: Compare with original JPEG estimate ---
  console.log('\n--- Format Comparison (estimated) ---');
  const avifTotal = imageRequests.reduce((sum, r) => sum + r.size, 0);
  // JPEG thumbnails at same resolution are typically 3-5x larger than AVIF
  const estimatedJpegTotal = avifTotal * 4;
  console.log(`  AVIF total:           ${(avifTotal / 1024).toFixed(1)} KB`);
  console.log(`  JPEG estimate (4x):   ${(estimatedJpegTotal / 1024).toFixed(1)} KB`);
  console.log(`  Savings:              ~${(100 - (avifTotal / estimatedJpegTotal) * 100).toFixed(0)}%`);

  console.log('\n========================================');
  console.log('  END OF REPORT');
  console.log('========================================\n');
});
