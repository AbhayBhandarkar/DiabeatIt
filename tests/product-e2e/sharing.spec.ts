import { test, expect, register, cleanup, sharing, navigate, snapshot, unique } from './fixtures';
import type { Entity } from '../../shared/v2';

test('two accounts accept selective read/write access, deny cross-scope writes, then revoke', async ({ page, account, browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3001', viewport: testInfo.project.use.viewport, serviceWorkers: 'block', extraHTTPHeaders: { 'X-Diabeatit-Client': 'web', Origin: 'http://127.0.0.1:3001' } });
  const companion = await context.newPage();
  const other = await register(companion);
  try {
    const root = `/api/v2/spaces/${account.spaceId}`;
    const create = async (kind: string, data: unknown): Promise<Entity> => {
      const response = await page.request.post(`${root}/entities`, { data: { kind, data } });
      expect(response.status()).toBe(201); return response.json();
    };
    const medicine = await create('medicines', { name: unique('Shared medicine'), ingredient: 'Unknown', strength: '', form: 'Tablet', route: 'Oral', instructions: '', times: ['00:01'], days: [0, 1, 2, 3, 4, 5, 6], startDate: '2026-01-01', status: 'active', source: 'User entered' });
    const privateNote = await create('symptoms', { text: unique('Private symptom'), at: new Date().toISOString() });
    expect((await companion.request.get(root)).status()).toBe(404);
    await page.goto('/'); await sharing(page);
    await page.getByLabel('Invitation label', { exact: true }).fill('Browser companion');
    await page.getByRole('checkbox', { name: 'Read Medicines', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Write Tasks', exact: true }).check();
    await expect(page.getByRole('checkbox', { name: 'Read Tasks', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Write Medicines', exact: true })).not.toBeChecked();
    await page.getByRole('button', { name: 'Create one-time invitation' }).click();
    const link = page.getByLabel('Private one-time invitation link', { exact: true });
    await expect(link).toBeVisible();
    // Hold the bearer token only in memory, never in URL, logs or attachments.
    const invitation = await link.inputValue();
    await page.getByRole('button', { name: 'I have saved it · hide link' }).click();
    await sharing(companion);
    await companion.getByLabel('Invitation token or link', { exact: true }).fill(invitation);
    await companion.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(companion.getByRole('button', { name: 'Reload account spaces' })).toBeVisible();
    await expect(companion.getByLabel('Invitation token or link', { exact: true })).toBeEmpty();
    await companion.getByLabel('Active workspace', { exact: true }).selectOption(account.spaceId);
    await expect(companion.locator('.shared-banner')).toBeVisible();
    const state = await snapshot(companion, account.spaceId);
    expect(state.space.scopes.slice().sort()).toEqual(['medicines:read', 'tasks:read', 'tasks:write']);
    expect(state.entities.symptoms).toEqual([]);
    expect(JSON.stringify(state)).not.toContain(privateNote.data.text);
    await navigate(companion, 'Medicines');
    await expect(companion.getByRole('button', { name: 'Add medicine', exact: true })).toBeDisabled();
    await expect(companion.locator('main')).toContainText(medicine.data.name as string);
    await expect(companion.locator('main')).toContainText('Status unavailable');
    await expect(companion.getByRole('button', { name: 'Record', exact: true })).toBeDisabled();
    expect((await companion.request.put(`${root}/entities/${medicine.id}`, { data: { version: medicine.version, data: { ...medicine.data, name: 'Forbidden edit' } } })).status()).toBe(403);
    expect((await companion.request.delete(`${root}/entities/${medicine.id}`, { data: { version: medicine.version } })).status()).toBe(403);
    expect((await companion.request.post(`${root}/entities`, { data: { kind: 'symptoms', data: { text: 'Forbidden', at: new Date().toISOString() } } })).status()).toBe(403);
    await navigate(companion, 'Care circle');
    await expect(companion.getByRole('button', { name: 'Add task', exact: true })).toHaveCount(0);
    const taskTitle = unique('Collect record');
    // The simplified patient UI no longer asks for tasks. Preserve API scope regression.
    expect((await companion.request.post(`${root}/entities`, { data: { kind: 'tasks', data: { title: taskTitle, assignee: '', dueDate: '2026-11-04', status: 'open' } } })).status()).toBe(201);
    const task = (await snapshot(page, account.spaceId)).entities.tasks.find(e => e.data.title === taskTitle)!;
    expect(task.author.role).toBe('companion');
    await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Revoke access', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Revoke access', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect((await companion.request.get(root)).status()).toBe(404);
    expect((await companion.request.put(`${root}/entities/${task.id}`, { data: { version: task.version, data: { ...task.data, status: 'done' } } })).status()).toBe(404);
    await companion.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
    await expect(companion.locator('.shared-banner')).toHaveCount(0);
    await expect(companion.getByLabel('Active workspace', { exact: true })).toHaveValue(other.spaceId);
    expect((await snapshot(page, account.spaceId)).entities.tasks.find(e => e.id === task.id)?.data.status).toBe('open');
  } finally { await cleanup(context, other); await context.close(); }
});