/**
 * ギャラリーを開いてから **1 枚目の写真が出るまで** を実測する。
 *
 *   cd web
 *   E2E_GALLERY_URL='https://<host>/gallery/<token>' node e2e/measure-first-photo.mjs
 *   E2E_GALLERY_URL=... node e2e/measure-first-photo.mjs --throttle=4g --runs=5
 *
 * 別のデプロイと比べたいときは URL を差し替えて 2 回走らせる。Vercel の
 * 過去のデプロイ URL（web-photo-gallery-xxxxx-....vercel.app）でも同じ招待が開けるので、
 * 変更前後の A/B が取れる。
 *
 * **招待トークンは環境変数で渡すこと。** このリポジトリは公開されている。
 *
 * 出るのは合計時間ではなく内訳。どこを削ると効くかは、内訳を見ないと決められない。
 *   - JS が届き終わるまで
 *   - 匿名サインインの開始
 *   - Firestore の開始と終了、および要求の本数
 *   - 1 枚目の写真を要求した時刻 ←「表示までの下ごしらえ」の総和
 *   - 1 枚目の写真が描画された時刻 ← 利用者が写真を見た時刻
 *   - 写真の要求本数と合計バイト ← 開いた瞬間に何 MB 取りに行っているか
 */
import { chromium } from 'playwright';

const GALLERY_URL = process.env.E2E_GALLERY_URL ?? '';
if (!GALLERY_URL) {
  console.error(
    "E2E_GALLERY_URL が未設定。E2E_GALLERY_URL='https://<host>/gallery/<token>' を渡して実行する。"
  );
  process.exit(1);
}

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const RUNS = Number(arg('runs', '3'));
const THROTTLE = arg('throttle', 'none');

const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const ms = (v) => (v == null ? '     —' : `${Math.round(v)}`.padStart(6));

const bucket = (url) => {
  if (url.includes('firebasestorage')) return 'storage';
  if (url.includes('identitytoolkit') || url.includes('securetoken')) return 'auth';
  if (url.includes('firestore.googleapis.com')) return 'firestore';
  // Vercel は静的アセットに ?dpl=... を付けるので、パスだけで判定する
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    /* 相対 URL は来ない想定 */
  }
  if (pathname.includes('/_next/static/') && pathname.endsWith('.js')) return 'js';
  return 'other';
};

async function measureOnce(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  // 初回案内は測りたいものではないので出さない
  await context.addInitScript(() => {
    try {
      localStorage.setItem('welcome_guide_dismissed', '1');
    } catch {
      /* プライベートウィンドウ相当で落ちても測定には影響しない */
    }
  });

  const page = await context.newPage();

  if (THROTTLE === '4g') {
    const cdp = await context.newCDPSession(page);
    // Network.enable を先に送らないと emulateNetworkConditions が無視される
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 70,
      downloadThroughput: (9 * 1024 * 1024) / 8,
      uploadThroughput: (3 * 1024 * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }

  const events = [];
  const t0 = Date.now();
  page.on('request', (r) => events.push({ kind: 'req', at: Date.now() - t0, b: bucket(r.url()) }));
  page.on('response', (r) => {
    const b = bucket(r.url());
    if (b !== 'js' && b !== 'storage') return;
    events.push({
      kind: 'res',
      at: Date.now() - t0,
      b,
      size: Number(r.headers()['content-length'] || 0),
    });
  });

  await page.goto(GALLERY_URL, { waitUntil: 'commit', timeout: 60_000 });

  let firstPainted = null;
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll('main img')].some((i) => i.complete && i.naturalWidth > 0),
      { timeout: 45_000 }
    );
    firstPainted = Date.now() - t0;
  } catch {
    /* 45 秒で 1 枚も出なければ null のまま報告する */
  }

  // 残りの写真の取得が落ち着くまで見る
  await page.waitForTimeout(6000);

  const first = (b, kind = 'req') => events.find((e) => e.b === b && e.kind === kind)?.at ?? null;
  const last = (b, kind = 'req') =>
    [...events].reverse().find((e) => e.b === b && e.kind === kind)?.at ?? null;
  const count = (b, kind = 'req') => events.filter((e) => e.b === b && e.kind === kind).length;
  const bytes = (b) =>
    events.filter((e) => e.kind === 'res' && e.b === b).reduce((s, e) => s + e.size, 0);

  const cards = await page.evaluate(() => document.querySelectorAll('[data-image-id]').length);

  await context.close();
  return {
    lastJs: last('js', 'res'),
    firstAuth: first('auth'),
    firstFirestore: first('firestore'),
    lastFirestore: last('firestore'),
    firestoreReqs: count('firestore'),
    firstPhotoReq: first('storage'),
    firstPainted,
    photoReqs: count('storage'),
    photoMB: bytes('storage') / 1024 / 1024,
    cards,
  };
}

const browser = await chromium.launch();
const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(await measureOnce(browser));
await browser.close();

const k = (key) => median(runs.map((r) => r[key]));
const origin = new URL(GALLERY_URL).origin;

console.log(`\n=== ${origin} / ${RUNS} 回 / throttle=${THROTTLE} （中央値） ===`);
console.log(`  JS が届き終わる        ${ms(k('lastJs'))} ms`);
console.log(`  匿名サインイン開始     ${ms(k('firstAuth'))} ms`);
console.log(`  Firestore 開始         ${ms(k('firstFirestore'))} ms`);
console.log(`  Firestore 終了         ${ms(k('lastFirestore'))} ms   要求 ${k('firestoreReqs')} 本`);
console.log(`  1枚目の写真を要求      ${ms(k('firstPhotoReq'))} ms`);
console.log(`  1枚目の写真が描画      ${ms(k('firstPainted'))} ms`);
console.log(`  写真の要求             ${k('photoReqs')} 本 / ${k('photoMB').toFixed(2)} MB / カード ${k('cards')} 枚`);
console.log(`  各回「描画」           ${runs.map((r) => (r.firstPainted == null ? '×' : Math.round(r.firstPainted))).join(', ')}`);
