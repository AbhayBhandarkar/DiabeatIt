import AxeBuilder from '@axe-core/playwright';
import { test, expect, navigate, snapshot } from './fixtures';

test('mobile menu opens an accessible navigation drawer', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) > 600, 'Mobile drawer assertion; desktop navigation covered by all-screen audits.');
  await page.goto('/');
  await expect(page.getByLabel('Active workspace', { exact: true })).toBeVisible();
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).toBeVisible();
  await page.locator('.product-sidebar').getByRole('button', { name: 'Medicine insights', exact: true }).click();
  await expect(page.locator('main h1')).toHaveText('Medicine insights');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

for (const theme of ['light', 'dark']) test(`all account screens: ${theme} axe WCAG A/AA, no horizontal overflow or demo controls`, async ({ page, account }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await navigate(page, 'Settings & privacy');
  await page.getByRole('button', { name: theme === 'light' ? 'Light' : 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  const before = (await snapshot(page, account.spaceId)).entities;
  const checks: { screen: string; overflow: number; violations: unknown[] }[] = [];
  const screens = ['Today', 'Medicines', 'Food', 'Learn', 'Care circle', 'Medicine insights', 'Settings & privacy'];
  for (const screen of screens) {
    await navigate(page, screen);
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth);
    expect.soft(overflow, `${screen} ${theme} ${testInfo.project.name}: horizontal overflow`).toBeLessThanOrEqual(1);
    await expect.soft(page.locator('main')).not.toContainText(/demo mode|fictional patient|sample patient|switch role|ananya|meera/i);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const violations = results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.map(n => ({ target: n.target, failureSummary: n.failureSummary })) }));
    checks.push({ screen, overflow, violations });
    expect.soft(violations, `${screen} ${theme} ${testInfo.project.name}: axe`).toEqual([]);
  }
  // Read-only browsing/theme changes must not create patient records.
  expect((await snapshot(page, account.spaceId)).entities).toEqual(before);
  await testInfo.attach('screen-audits.json', { body: JSON.stringify(checks, null, 2), contentType: 'application/json' });
});