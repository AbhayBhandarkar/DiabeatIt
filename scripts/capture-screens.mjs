// Captures product screenshots for review, the website and the pitch deck.
// Usage: node scripts/capture-screens.mjs [baseUrl] [--only=name,name]
// Signs in as the synthetic showcase patient created by scripts/seed-showcase.mjs.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://127.0.0.1:3001').replace(/\/$/, '');
const only = (process.argv.find(a => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const out = 'artifacts/screens';
const email = process.env.SHOWCASE_EMAIL || 'sunita.sharma@example.com', password = process.env.SHOWCASE_PASSWORD || 'Showcase-Sunita-2026!';
await mkdir(out, { recursive: true });
const headers = { 'X-Diabeatit-Client': 'web', Origin: base };
const browser = await chromium.launch();
const devices = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
};

async function session(device, theme) {
  const context = await browser.newContext({ ...devices[device], baseURL: base, colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addInitScript(t => { try { localStorage.setItem('diabeatit-theme', t); } catch {} }, theme);
  const page = await context.newPage();
  return { context, page };
}
async function signIn(page) {
  const r = await page.request.post('/api/v2/auth/login', { headers, data: { email, password } });
  if (!r.ok()) throw new Error(`Sign-in failed ${r.status()}`);
  return r.json();
}
async function go(page, device, name) {
  if (device === 'phone') {
    const mobile = page.getByRole('navigation', { name: 'Mobile navigation' });
    await mobile.getByRole('button', { name, exact: true }).click();
  } else await page.locator('.product-sidebar').getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(500);
}
const shot = async (page, file, full = false) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${file}.png`, fullPage: full }); console.log('captured', file); };
const want = n => !only.length || only.some(o => n.includes(o));

for (const device of ['phone', 'desktop']) {
  for (const theme of ['light', 'dark']) {
    const { context, page } = await session(device, theme);
    const me = await signIn(page);
    await page.goto('/'); await page.locator('main h1').waitFor();
    const tag = `${device}-${theme}`;
    if (want('today')) await shot(page, `${tag}-today`);
    if (want('medicines')) { await go(page, device, 'Medicines'); await shot(page, `${tag}-medicines`); }
    if (want('timeline')) {
      await go(page, device, 'Timeline'); await shot(page, `${tag}-timeline`);
      if (theme === 'light') {
        await page.getByRole('button', { name: /Create summary/ }).click();
        await page.locator('.ai-summary').waitFor({ timeout: 60000 });
        await page.locator('.ai-panel').scrollIntoViewIfNeeded();
        await shot(page, `${tag}-timeline-summary`);
        await page.locator('.timeline').scrollIntoViewIfNeeded(); await shot(page, `${tag}-timeline-feed`);
      }
    }
    if (want('food')) { await go(page, device, 'Food'); await shot(page, `${tag}-food`); }
    if (want('learn')) {
      await go(page, device, 'Learn'); await shot(page, `${tag}-learn`);
      if (theme === 'light') {
        await page.getByRole('button', { name: 'Bitter gourd juice can replace my diabetes tablets' }).click();
        await page.locator('.myth-result').waitFor({ timeout: 60000 }); await page.locator('.myth-check').scrollIntoViewIfNeeded();
        await shot(page, `${tag}-myth`);
      }
    }
    if (want('care')) { await go(page, device, device === 'phone' ? 'Care' : 'Care circle'); await shot(page, `${tag}-care`); }
    if (want('scan') && device === 'phone' && theme === 'light') {
      await page.getByRole('button', { name: 'Scan to sign in on a computer' }).click(); await page.waitForTimeout(800); await shot(page, `${tag}-scanner`); await page.keyboard.press('Escape');
    }
    if (want('doctor') && theme === 'light') {
      const link = await page.request.post(`/api/v2/spaces/${me.spaceId}/clinician-links`, { headers, data: { label: 'Dr. Anil Mehta', days: 7, fromDate: new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10) } }).then(r => r.json());
      const doctor = await browser.newContext({ ...devices[device], baseURL: base, colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const dp = await doctor.newPage(); await dp.goto(`/doctor#${link.token}`); await dp.locator('h1').waitFor();
      await shot(dp, `${tag}-doctor`);
      await dp.getByRole('button', { name: /Generate summary/ }).click(); await dp.locator('.ai-summary').waitFor({ timeout: 60000 });
      await dp.locator('.ai-panel').scrollIntoViewIfNeeded(); await shot(dp, `${tag}-doctor-summary`);
      await doctor.close();
      await page.request.delete(`/api/v2/spaces/${me.spaceId}/clinician-links/${link.id}`, { headers });
    }
    await context.close();
    if (want('auth')) {
      const { context: c2, page: p2 } = await session(device, theme);
      await p2.goto('/'); await p2.getByRole('heading', { name: 'Make room for better care.' }).waitFor(); await shot(p2, `${tag}-auth`);
      if (device === 'desktop') { await p2.getByRole('button', { name: 'Use my phone' }).click(); await p2.locator('.qr-frame img').waitFor(); await shot(p2, `${tag}-qr-login`); }
      await c2.close();
    }
    if (want('about')) { const { context: c3, page: p3 } = await session(device, theme); await p3.goto('/about'); await p3.locator('h1').waitFor(); await shot(p3, `${tag}-about`); await shot(p3, `${tag}-about-full`, true); await c3.close(); }
  }
}
await browser.close();
