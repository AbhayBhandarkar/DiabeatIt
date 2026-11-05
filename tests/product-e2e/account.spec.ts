import { test, expect } from '@playwright/test';
import { register, cleanup, navigate, snapshot } from './fixtures';
import { entityKinds } from '../../shared/v2';

test('real registration is empty and private; logout/login restores the account without seeds', async ({ page, context }) => {
  const account = await register(page);
  try {
    const state = await snapshot(page, account.spaceId);
    for (const kind of entityKinds) expect(state.entities[kind], `No seeded ${kind}`).toEqual([]);
    expect(state.grants).toEqual([]); expect(state.invitations).toEqual([]);
    await expect(page.locator('main')).not.toContainText(/demo mode|fictional patient|sample patient|switch role|ananya|meera/i);
    await navigate(page, 'Settings & privacy');
    await page.locator('main').getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Make room for better care.' })).toBeVisible();
    expect((await page.request.get(`/api/v2/spaces/${account.spaceId}`)).status()).toBe(401);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Email address', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('main h1')).toHaveText('Hello, Browser.');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await snapshot(page, account.spaceId)).entities).toEqual(state.entities);
  } finally { await cleanup(context, account); }
});