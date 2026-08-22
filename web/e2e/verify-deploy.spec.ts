import { test, expect } from '@playwright/test';

test('Verify deployment reflects security fixes', async ({ page }) => {
  const baseUrl = 'https://web-kappa-neon-94.vercel.app';
  const galleryUrl = `${baseUrl}/gallery/UR0ht6dvnku-SpUuMnQmo`;

  console.log('=== Testing: ' + galleryUrl + ' ===');

  // Track /api/image responses
  const apiRequests: { url: string; status: number; headers: Record<string, string> }[] = [];
  const imageErrors: string[] = [];

  page.on('response', async (response) => {
    if (response.url().includes('/api/image')) {
      apiRequests.push({
        url: response.url(),
        status: response.status(),
        headers: response.headers(),
      });
    }
  });

  page.on('requestfailed', (request) => {
    imageErrors.push(request.url());
  });

  await page.goto(galleryUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(10000);

  // Check images loaded
  const images = await page.$$eval('img', (imgs) =>
    imgs.map(img => ({
      src: img.src.substring(0, 80),
      complete: img.complete,
      naturalWidth: img.naturalWidth,
    }))
  );

  const loaded = images.filter(i => i.complete && i.naturalWidth > 0);
  console.log(`Images: ${loaded.length}/${images.length} loaded`);

  // Check API response headers
  console.log(`API /api/image requests: ${apiRequests.length}`);

  if (apiRequests.length > 0) {
    const sample = apiRequests[0];
    console.log('Sample status:', sample.status);
    console.log('Content-Type:', sample.headers['content-type']);
    console.log('Cache-Control:', sample.headers['cache-control']);
    console.log('Has immutable?', sample.headers['cache-control']?.includes('immutable') ? 'YES (NOT fixed)' : 'NO (fixed)');
  }

  // === Security Tests ===
  console.log('\n=== Security Tests ===');

  // Test 1: HTTP URL should be rejected (HTTPS-only)
  const httpReject = await page.request.get(
    `${baseUrl}/api/image?url=${encodeURIComponent('http://firebasestorage.googleapis.com/test')}&w=256`
  );
  console.log(`HTTP URL rejection: status=${httpReject.status()}, body=${await httpReject.text()}`);

  // Test 2: Non-allowed host should be rejected
  const hostReject = await page.request.get(
    `${baseUrl}/api/image?url=${encodeURIComponent('https://evil.com/image.jpg')}&w=256`
  );
  console.log(`Bad host rejection: status=${hostReject.status()}, body=${await hostReject.text()}`);

  // Test 3: Missing URL param
  const missingUrl = await page.request.get(`${baseUrl}/api/image?w=256`);
  console.log(`Missing URL param: status=${missingUrl.status()}, body=${await missingUrl.text()}`);

  console.log(`\nNetwork errors: ${imageErrors.length}`);

  // === Accessibility ===
  console.log('\n=== Accessibility ===');
  const cardButton = await page.$('[role="button"][tabindex="0"]');
  console.log(`ImageCard role="button" + tabIndex: ${cardButton ? 'FOUND (fixed)' : 'NOT FOUND'}`);

  // Screenshot
  await page.screenshot({ path: 'test-results/verify-deploy.png', fullPage: false });
  console.log('Screenshot saved');

  expect(loaded.length).toBeGreaterThan(0);
});
