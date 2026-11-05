// Records a captioned walkthrough of the live app (synthetic showcase patient) to public/demo/DiabeatIT-demo.webm.
// Usage: node scripts/record-demo.mjs [baseUrl]
import { chromium } from '@playwright/test';
import { mkdir, rename, readdir, rm } from 'node:fs/promises';

const base = (process.argv[2] || 'https://diabeatit.onrender.com').replace(/\/$/, '');
const email = 'sunita.sharma@example.com', password = 'Showcase-Sunita-2026!';
const tmp = 'artifacts/video-tmp';
await rm(tmp, { recursive: true, force: true }); await mkdir(tmp, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 720 }, recordVideo: { dir: tmp, size: { width: 1280, height: 720 } }, colorScheme: 'light', serviceWorkers: 'block' });
await context.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const el = document.createElement('div'); el.id = 'demo-caption';
    el.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;max-width:900px;padding:12px 22px;border-radius:14px;background:#15122ef0;color:#fff;font:600 19px/1.4 "DM Sans",system-ui,sans-serif;box-shadow:0 12px 30px #0006;text-align:center;pointer-events:none;transition:opacity .3s';
    document.body.appendChild(el);
    window.caption = text => { el.textContent = text; el.style.opacity = text ? '1' : '0'; };
    window.caption(sessionStorage.getItem('demo-caption') || '');
  });
});
const page = await context.newPage();
const say = async (text, ms = 3500) => { await page.evaluate(t => { sessionStorage.setItem('demo-caption', t); window.caption?.(t); }, text); await page.waitForTimeout(ms); };
const slowScroll = async (px, steps = 6) => { for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, px / steps); await page.waitForTimeout(350); } };
const nav = name => page.locator('.product-sidebar').getByRole('button', { name, exact: true }).click();
const ai = async (button, result) => {
  for (let i = 0; i < 3; i++) {
    await button.click();
    const ok = await result.waitFor({ timeout: 60000 }).then(() => true, () => false);
    if (ok) return; await page.waitForTimeout(15000);
  }
};

await page.goto('/about'); await page.locator('h1').waitFor();
await say('DiabeatIT — everyday diabetes care for people in India aged 40–65 and their families', 4000);
await slowScroll(900); await say('Prescriptions, meals, doctor visits and family support in one calm place', 3000);
await slowScroll(1400); await say('AI drafts. The patient confirms. Every fact links to its source.', 3000);

await page.goto('/'); await page.getByRole('button', { name: 'Sign in' }).first().click();
await say('Signing in as Sunita, 58 — a synthetic showcase patient with six medicines from three doctors', 1500);
await page.getByLabel('Email address', { exact: true }).pressSequentially(email, { delay: 25 });
await page.getByLabel('Password', { exact: true }).pressSequentially(password, { delay: 25 });
await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
await page.locator('main h1').waitFor();
await say('Today: the next dose, latest reading and meals — shown in India time', 4500);
await slowScroll(500); await page.waitForTimeout(1500);

await nav('Medicines'); await say('Medicines from every doctor in one list. Same-ingredient overlaps are flagged.', 4000);
await page.getByRole('button', { name: 'Scan prescription' }).click();
await page.locator('dialog input[type=file]').setInputFiles('docs/assets/sample-prescription.jpg');
await say('Snap a prescription: the AI reads names and timings (Qwen 3.8 27B on Groq)', 2500);
await page.getByRole('checkbox', { name: /Send this photo/ }).check();
await ai(page.getByRole('button', { name: 'Read with AI' }), page.locator('.scan-draft').first());
await page.locator('.scan-draft').first().scrollIntoViewIfNeeded();
await say('Every line is a draft. Sunita checks it against the paper before anything is saved.', 5000);
await page.keyboard.press('Escape'); await page.waitForTimeout(600);

await nav('Timeline'); await say('Timeline: visits, lab results, medicine changes, missed doses and symptoms on one line', 4000);
await ai(page.getByRole('button', { name: /Create summary/ }), page.locator('.ai-summary'));
await page.locator('.ai-panel').scrollIntoViewIfNeeded();
await say('A visit summary in seconds. Each point cites the exact record it came from.', 4500);
await slowScroll(700); await page.waitForTimeout(1500);

await page.evaluate(() => scrollTo(0, 0));
await page.getByRole('button', { name: 'Share with my doctor' }).click();
await say('Share with a doctor: read-only, expires automatically, can be withdrawn, every view is logged', 2500);
await page.getByLabel('Who is it for?').fill('Dr. Anil Mehta');
await page.getByRole('button', { name: 'Create doctor link' }).click();
await page.locator('.share-result').waitFor(); await page.waitForTimeout(3000);
const link = await page.locator('.link-box input').inputValue();
await page.keyboard.press('Escape');

await page.goto(link.replace(/^https?:\/\/[^/]+/, '')); await page.locator('h1').waitFor();
await say('The doctor scans the QR code — no app, no account. Medicines, lab trends, glucose and questions.', 4500);
await ai(page.getByRole('button', { name: /Generate summary/ }), page.locator('.ai-summary'));
await page.locator('.ai-panel').scrollIntoViewIfNeeded();
await say('A 30-second briefing for a 2-minute consultation — patient-reported, cited, no diagnosis', 5000);
await slowScroll(1200); await page.waitForTimeout(1500);

await page.goto('/'); await page.locator('main h1').waitFor();
await nav('Learn'); await say('Learn: check a myth heard from relatives or forwarded videos', 2500);
await ai(page.getByRole('button', { name: 'Bitter gourd juice can replace my diabetes tablets' }), page.locator('.myth-result'));
await page.locator('.myth-check').scrollIntoViewIfNeeded();
await say('The answer uses only reviewed public-health sources (NIDDK, NCCIH, MedlinePlus), linked below', 5000);
await slowScroll(900); await say('Narrated animated lessons with captions, transcripts and checkpoints', 3500);

await page.request.post('/api/v2/auth/logout', { headers: { 'X-Diabeatit-Client': 'web', Origin: base } });
await page.goto('/'); await page.getByRole('button', { name: 'Phone sign-in' }).click(); await page.locator('.qr-frame img').waitFor();
await say('On a shared computer, sign in with your phone: scan, tap the matching number — no password typed', 5000);
await say('DiabeatIT · diabeatit.onrender.com · github.com/AbhayBhandarkar/DiabeatIt', 4000);

await context.close(); await browser.close();
const [file] = (await readdir(tmp)).filter(f => f.endsWith('.webm'));
await mkdir('public/demo', { recursive: true });
await rename(`${tmp}/${file}`, 'public/demo/DiabeatIT-demo.webm');
console.log('saved public/demo/DiabeatIT-demo.webm');
