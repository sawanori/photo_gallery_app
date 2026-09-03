import { test, expect } from '@playwright/test';
import { E2E_GALLERY_URL, E2E_GALLERY_URL_MISSING } from './galleryUrl';

test('Verify spinner loading and fade-in on production', async ({ page }) => {
  test.skip(!E2E_GALLERY_URL, E2E_GALLERY_URL_MISSING);

  const url = E2E_GALLERY_URL;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Check for spinner on initial load
  const spinner = await page.$('.animate-spin');
  const loadingText = await page.textContent('p.text-muted');
  console.log(`Spinner found: ${spinner ? 'YES' : 'NO'}`);
  console.log(`Loading text: ${loadingText}`);

  // Screenshot during loading
  await page.screenshot({ path: 'test-results/loading-spinner.png' });
  console.log('Screenshot (loading) saved');

  // Wait for images
  await page.waitForTimeout(12000);

  // Spinner should be gone, grid visible
  const spinnerAfter = await page.$('.animate-spin');
  console.log(`Spinner after load: ${spinnerAfter ? 'STILL VISIBLE (bad)' : 'GONE (good)'}`);

  const images = await page.$$eval('img', (imgs) =>
    imgs.map(img => ({ complete: img.complete, naturalWidth: img.naturalWidth }))
  );
  const loaded = images.filter(i => i.complete && i.naturalWidth > 0);
  console.log(`Images: ${loaded.length}/${images.length} loaded`);

  // Screenshot after loading
  await page.screenshot({ path: 'test-results/loaded-gallery.png' });
  console.log('Screenshot (loaded) saved');

  expect(loaded.length).toBeGreaterThan(0);
  expect(spinnerAfter).toBeNull();
});
