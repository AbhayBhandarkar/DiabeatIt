import { test, expect, navigate, snapshot, unique } from './fixtures';
import type { LabelsResponse, MedicineSearchResponse } from '../../shared/v2';

test('explicit knowledge queries, source identity, local filters and unavailable states never imply safety', async ({ page, account }) => {
  const calls: string[] = [];
  const privateName = unique('Private medicine');
  const saved = await page.request.post(`/api/v2/spaces/${account.spaceId}/entities`, { data: { kind: 'questions', data: { text: privateName } } });
  expect(saved.status()).toBe(201);
  const before = (await snapshot(page, account.spaceId)).entities;
  const labels: LabelsResponse = { source: 'openFDA', limitations: 'US labels only', results: [{ id: 'deterministic-label', title: 'Matched product', brand: ['Matched brand'], generic: ['Metformin'], manufacturer: ['Named manufacturer'], route: ['ORAL'], updated: '20260101', region: 'US', sourceUrl: 'https://api.fda.gov/drug/label.json', sections: { adverse_reactions: ['Source passage about nausea.', 'Source passage about another observation.'], warnings: ['Read the original warning.'], drug_interactions: [], indications_and_usage: [] } }] };
  const references: MedicineSearchResponse = { source: 'DailyMed', limitations: 'Separate references, not a clinical assessment', results: [{ id: 'reference-1', title: 'Original product document', published: '20260101', url: 'https://dailymed.nlm.nih.gov/dailymed/' }] };
  await page.route('**/api/v2/knowledge/**', async route => {
    const url = new URL(route.request().url()); calls.push(url.pathname + url.search);
    expect(route.request().method()).toBe('GET');
    expect([...url.searchParams.keys()]).toEqual(['q']);
    expect(url.searchParams.get('q')).not.toContain(privateName);
    if (url.searchParams.get('q') === 'Unavailable') return route.fulfill({ status: 503, json: { error: 'Provider unavailable', code: 'PROVIDER_UNAVAILABLE' } });
    if (url.searchParams.get('q') === 'NoMatch') return route.fulfill({ json: { ...(url.pathname.endsWith('/labels') ? labels : references), results: [] } });
    expect(url.searchParams.get('q')).toBe('Metformin');
    await route.fulfill({ json: url.pathname.endsWith('/labels') ? labels : references });
  });
  await page.goto('/'); await navigate(page, 'Medicine insights');
  expect(calls).toEqual([]);
  await page.getByLabel('Medicine name', { exact: true }).fill('Metformin');
  expect(calls).toEqual([]);
  await page.getByRole('button', { name: 'Find side effects & warnings', exact: true }).click();
  await page.getByRole('button', { name: 'View this product label' }).click();
  const evidence = page.getByRole('region', { name: 'Selected product evidence' });
  await expect(evidence).toContainText('Named manufacturer');
  await expect(evidence.getByRole('link', { name: 'Original source' })).toHaveAttribute('href', labels.results[0].sourceUrl);
  await evidence.getByLabel('Filter text within this section', { exact: true }).fill('nausea');
  await expect(evidence.locator('.p-source-excerpt')).toHaveCount(1);
  await expect(evidence.locator('.p-source-excerpt')).toHaveText('Source passage about nausea.');
  expect(calls).toHaveLength(2);
  await evidence.getByRole('button', { name: 'Interactions', exact: true }).click();
  await expect(evidence).toContainText('no absence of risk is implied');
  for (const term of ['NoMatch', 'Unavailable']) {
    await page.getByLabel('Medicine name', { exact: true }).fill(term);
    await expect(evidence).toHaveCount(0);
    await page.getByRole('button', { name: 'Find side effects & warnings', exact: true }).click();
    if (term === 'NoMatch') await expect(page.locator('main')).toContainText('coverage gap, not evidence of safety or absence of interactions');
    else { await expect(page.getByRole('alert').filter({ hasText: 'Product labels unavailable' })).toBeVisible(); await expect(page.getByRole('alert').filter({ hasText: 'DailyMed references unavailable' })).toBeVisible(); }
  }
  expect(calls).toHaveLength(6);
  expect((await snapshot(page, account.spaceId)).entities).toEqual(before);
});