import { test } from '@playwright/test';

test('Verify optimized images on web-kappa-neon-94', async ({ page }) => {
  const networkErrors: string[] = [];
  const apiImageRequests: string[] = [];

  page.on('response', response => {
    const url = response.url();
    if (url.includes('/api/image')) {
      apiImageRequests.push(`${response.status()} ${response.headers()['content-type']} ${url.substring(0, 100)}`);
    }
    if (response.status() >= 400) {
      networkErrors.push(`${response.status()} ${url.substring(0, 150)}`);
    }
  });

  await page.goto('https://web-kappa-neon-94.vercel.app/gallery/UR0ht6dvnku-SpUuMnQmo', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  const modalBtn = page.locator('text=ギャラリーを見る');
  if (await modalBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await modalBtn.click();
  }

  await page.waitForTimeout(15000);

  const totalImgs = await page.locator('img').count();
  const loadedImgs = await page.locator('img').evaluateAll(imgs =>
    imgs.filter(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0).length
  );

  console.log('Total: ' + totalImgs + ', Loaded: ' + loadedImgs);
  console.log('API image requests: ' + apiImageRequests.length);
  apiImageRequests.slice(0, 3).forEach(r => console.log('  ' + r));
  console.log('Network errors: ' + networkErrors.length);
  networkErrors.slice(0, 5).forEach(e => console.log('  ' + e));

  await page.screenshot({ path: '/tmp/gallery_optimized.png', fullPage: false });
});
