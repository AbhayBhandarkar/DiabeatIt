import { randomUUID } from 'node:crypto';
import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import type { MeResponse, SnapshotResponse } from '../../shared/v2';

export { expect };
export type Account = { email: string; password: string; name: string; spaceId: string };
export const unique = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

export async function register(page: Page): Promise<Account> {
  const account = { email: `${randomUUID()}@example.invalid`, password: `E2e!${randomUUID()}`, name: 'Browser Tester', spaceId: '' };
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make room for better care.' })).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill(account.name);
  await page.getByLabel('Email address', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('checkbox', { name: /I agree to store my records/ }).check();
  // Only assert status: never attach the registration body (contains recovery codes).
  const response = page.waitForResponse(r => r.url().endsWith('/api/v2/auth/register') && r.request().method() === 'POST', { timeout: 45000 });
  await page.getByRole('button', { name: 'Create my account' }).click();
  expect((await response).status(), 'UI registration status').toBe(201);
  const dialog = page.getByRole('dialog', { name: 'Save your recovery codes' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Continue to my workspace' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  // Evaluate shape only, so a failed assertion cannot print codes.
  expect(await dialog.locator('.recovery-codes').evaluate(el => {
    const codes = el.textContent?.match(/[a-f0-9]{64}/g) ?? [];
    return codes.length === 8 && new Set(codes).size === 8;
  }), 'Eight distinct recovery codes are displayed').toBe(true);
  await dialog.getByRole('checkbox', { name: 'I have saved my recovery codes securely.' }).check();
  await dialog.getByRole('button', { name: 'Continue to my workspace' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('main h1')).toHaveText('Hello, Browser.');
  account.spaceId = (await me(page)).spaceId!;
  return account;
}

export async function me(page: Page): Promise<MeResponse> {
  const response = await page.request.get('/api/v2/me');
  expect(response.status()).toBe(200);
  return response.json();
}
export async function snapshot(page: Page, spaceId: string): Promise<SnapshotResponse> {
  const response = await page.request.get(`/api/v2/spaces/${spaceId}`);
  expect(response.status()).toBe(200);
  return response.json();
}
export async function cleanup(context: BrowserContext, account: Account) {
  const response = await context.request.delete(`/api/v2/account`, { headers: { 'X-Diabeatit-Client': 'web', Origin: 'http://127.0.0.1:3001' }, data: { password: account.password, confirmation: 'DELETE' } });
  expect(response.status(), 'Delete only this generated test account').toBe(200);
}
export async function navigate(page: Page, name: string) {
  // Wait for the authenticated shell before checking the responsive menu.
  await expect(page.getByLabel('Active workspace', { exact: true })).toBeVisible();
  await expect(page.locator('main h1')).toBeVisible();
  const sidebar = page.locator('.product-sidebar');
  const mobile = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
  if (await mobile.isVisible()) {
    if (name === 'Settings & privacy') await page.getByRole('button', { name: 'Account settings', exact: true }).click();
    else if (name === 'Medicine insights') {
      await mobile.getByRole('button', { name: 'Today', exact: true }).click();
      await page.getByRole('button', { name: 'Explore medicine insights', exact: true }).click();
    } else await mobile.getByRole('button', { name: name === 'Care circle' ? 'Care' : name, exact: true }).click();
  } else await sidebar.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.topbar-label')).toHaveText(name === 'Settings & privacy' ? 'Settings' : name);
  await expect(page.locator('main h1')).toBeVisible();
}
export async function sharing(page: Page) {
  await navigate(page, 'Care circle');
  await expect(page.locator('main h1')).toHaveText('People & access');
}

// One real-UI account per worker keeps finite runs below auth rate limits.
// Individual tests receive isolated pages/contexts, sharing only this test identity.
export const test = base.extend<{ account: Account }, { owner: { account: Account; cookies: Awaited<ReturnType<BrowserContext['cookies']>> } }>({
  owner: [async ({ browser }, use, workerInfo) => {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3001', viewport: workerInfo.project.use.viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const account = await register(page);
    try { await use({ account, cookies: await context.cookies() }); }
    finally { await cleanup(context, account); await context.close(); }
  }, { scope: 'worker' }],
  account: async ({ owner }, use) => { await use(owner.account); },
  context: async ({ context, owner }, use) => { await context.addCookies(owner.cookies); await use(context); },
});