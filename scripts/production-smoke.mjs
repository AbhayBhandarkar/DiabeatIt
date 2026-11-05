import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Run against an already-running built server. Never start/stop an API process here.
// No traces, screenshots, storageState files, credentials, or response-body logging.
const baseURL = 'http://127.0.0.1:3001';
const headers = { 'X-Diabeatit-Client': 'web', Origin: baseURL };
const account = { name: 'Smoke Tester', email: `smoke-${randomUUID()}@example.invalid`, password: `Smoke!${randomUUID()}`, consent: true };
const kinds = ['medicines', 'intakes', 'glucose', 'meals', 'recipes', 'documents', 'questions', 'tasks', 'symptoms', 'lessons', 'reviews'];
const videos = ['ingredient-overlap', 'label-portions', 'uncertain-intake', 'glucose-journey'];
let browser;
let context;
let registrationAttempted = false;
let registered = false;
let failed = false;
let stage = 'browser startup';
try {
  browser = await chromium.launch();
  context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'allow', extraHTTPHeaders: headers });
  context.setDefaultTimeout(20_000);
  const page = await context.newPage();
  let browserErrors = 0;
  page.on('pageerror', () => { browserErrors++; });
  page.on('console', message => { if (message.type() === 'error' && /Content Security Policy|Refused to/.test(message.text())) browserErrors++; });

  stage = 'account API health';
  const healthResponse = await context.request.get('/api/health', { timeout: 20_000 });
  assert.equal(healthResponse.status(), 200);
  const health = await healthResponse.json();
  assert.ok(health.status === 'ok' && health.mode === 'account-workspaces' && health.clinicalScreening === false && health.realPatientUse === false);

  stage = 'anonymous built UI, logo, and sign-in';
  const response = await page.goto('/');
  assert.ok(response);
  assert.equal(response.status(), 200);
  assert.ok(response.headers()['content-security-policy']?.includes("default-src 'self'"));
  await page.getByRole('heading', { name: 'Create your account' }).waitFor();
  assert.ok(await page.locator('script[src]').evaluateAll(elements => elements.some(element => new URL(element.src).pathname.startsWith('/assets/'))));
  await page.waitForFunction(() => {
    const logo = document.querySelector('.product-brand img');
    return logo instanceof HTMLImageElement && logo.complete && logo.naturalWidth > 0;
  });
  assert.equal(await page.getByRole('button', { name: 'Explore the working demo', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  assert.equal((await context.request.get('/api/v2/me', { timeout: 20_000 })).status(), 401);

  stage = 'random-account registration and cookie';
  registrationAttempted = true;
  const registration = await context.request.post('/api/v2/auth/register', { data: account, timeout: 20_000 });
  registered = registration.status() === 201;
  assert.ok(registered);
  // Discard the body without parsing it: it contains one-time recovery codes.
  await registration.dispose();
  const cookies = await context.cookies(`${baseURL}/api/v2/me`);
  const cookie = cookies.find(item => item.name === 'diabeatit_account');
  assert.ok(cookie?.httpOnly && cookie.sameSite === 'Strict' && cookie.path === '/api/v2');

  stage = 'authenticated identity and unseeded workspace';
  const meResponse = await context.request.get('/api/v2/me', { timeout: 20_000 });
  assert.equal(meResponse.status(), 200);
  assert.ok(meResponse.headers()['cache-control']?.includes('no-store'));
  const me = await meResponse.json();
  // Compare via booleans so assertion diagnostics cannot expose account values.
  assert.ok(me.user?.email === account.email && me.user?.name === account.name);
  assert.ok(!Object.hasOwn(me, 'recoveryCodes'));
  assert.ok(me.spaces?.length === 1 && me.spaces[0].role === 'owner' && me.spaceId === me.spaces[0].id);
  const snapshotResponse = await context.request.get(`/api/v2/spaces/${me.spaceId}`, { timeout: 20_000 });
  assert.equal(snapshotResponse.status(), 200);
  const snapshot = await snapshotResponse.json();
  assert.ok(snapshot.entities && Object.keys(snapshot.entities).length === kinds.length);
  assert.ok(kinds.every(kind => Array.isArray(snapshot.entities[kind]) && snapshot.entities[kind].length === 0));
  assert.ok(Array.isArray(snapshot.grants) && snapshot.grants.length === 0 && Array.isArray(snapshot.invitations) && snapshot.invitations.length === 0);
  // A registration audit event is expected; blank means no seeded health records.
  await page.reload();
  await page.getByRole('heading', { name: 'Hello, Smoke.', exact: true }).waitFor();

  stage = 'service-worker control and public assets';
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const pwa = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const manifest = await (await fetch('/manifest.webmanifest')).json();
    const icon = await fetch('/icon-192.png');
    return { scope: registration.scope, name: manifest.short_name, iconOk: icon.ok };
  });
  assert.equal(pwa.scope, `${baseURL}/`);
  assert.equal(pwa.name, 'DiabeatIT');
  assert.equal(pwa.iconOk, true);

  stage = 'controlled API requests and all video byte ranges';
  const media = await page.evaluate(async ids => {
    const api = await fetch('/api/v2/me', { signal: AbortSignal.timeout(20_000) });
    const apiStatus = api.status;
    const apiNoStore = api.headers.get('cache-control')?.includes('no-store');
    await api.arrayBuffer();
    const ranges = [];
    for (const id of ids) {
      const response = await fetch(`/lessons/${id}.mp4`, { headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(20_000) });
      // Do not download the full video if the server ignores Range.
      if (response.status !== 206) {
        await response.body?.cancel();
        ranges.push({ status: response.status });
        continue;
      }
      ranges.push({ status: response.status, type: response.headers.get('content-type'), range: response.headers.get('content-range'), accept: response.headers.get('accept-ranges'), bytes: (await response.arrayBuffer()).byteLength });
    }
    const cached = (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat();
    return { apiStatus, apiNoStore, ranges, iconCached: cached.includes('/icon-192.png'), privateOrVideoCached: cached.some(path => path.startsWith('/api/') || path.startsWith('/lessons/') || path.endsWith('.mp4')) };
  }, videos);
  assert.equal(media.apiStatus, 200);
  assert.equal(media.apiNoStore, true);
  assert.ok(media.ranges.length === videos.length && media.ranges.every(item => item.status === 206 && item.type?.startsWith('video/mp4') && /^bytes 0-1023\/\d+$/.test(item.range ?? '') && item.accept === 'bytes' && item.bytes === 1024));
  assert.equal(media.iconCached, true);
  assert.equal(media.privateOrVideoCached, false);
  assert.equal(browserErrors, 0);
} catch {
  // Playwright errors can include request details: print only a fixed stage label.
  failed = true;
  console.error(`Production smoke: FAIL at ${stage}. Details suppressed to protect secrets.`);
} finally {
  if (registrationAttempted && context) {
    try {
      let deletion = await context.request.delete('/api/v2/account', { data: { password: account.password, confirmation: 'DELETE' }, timeout: 20_000 });
      if (deletion.status() === 401) {
        // Recover only our random identity if registration completed but its response was lost.
        const login = await context.request.post('/api/v2/auth/login', { data: { email: account.email, password: account.password }, timeout: 20_000 });
        if (login.status() === 200) {
          deletion = await context.request.delete('/api/v2/account', { data: { password: account.password, confirmation: 'DELETE' }, timeout: 20_000 });
          assert.equal(deletion.status(), 200);
        } else {
          assert.ok(!registered && login.status() === 401);
        }
      } else {
        assert.equal(deletion.status(), 200);
      }
      assert.equal((await context.request.get('/api/v2/me', { timeout: 20_000 })).status(), 401);
    } catch {
      failed = true;
      console.error('Production smoke: FAIL during temporary-account cleanup; a synthetic account may remain. No credentials were logged.');
    }
  }
  try { await browser?.close(); } catch {
    failed = true;
    console.error('Production smoke: FAIL during browser cleanup.');
  }
}
if (failed) process.exitCode = 1;
else console.log('Production smoke: PASS — built login/logo + CSP; account health; cookie authentication + 11 blank collections; service-worker API/video exclusions; 4 video byte-range responses; temporary account deleted; no browser runtime/CSP errors.');