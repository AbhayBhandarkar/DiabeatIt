import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { openDatabase, type Database } from '../server/db';
import { createV2Router } from '../server/v2';
import { dataSchemas, auditQuerySchema } from '../server/v2/validation';
import { intakeToday } from '../shared/v2';

let db: Database, app: Express;
let owner: Awaited<ReturnType<typeof register>>, friend: Awaited<ReturnType<typeof register>>, root: string;
const medicine = { name: 'Private medicine identity', ingredient: 'Reported ingredient', strength: '', form: 'Tablet', route: 'Oral', instructions: 'Private instructions', times: ['08:00', '23:00'], days: [4], startDate: '2026-01-01', endDate: '2026-01-08', status: 'active', source: 'Patient report' };
const intake = (medicineId: string) => ({ medicineId, date: '2026-01-01', scheduledTime: '08:00', status: 'unsure', reason: 'Patient report only' });
const post = async (kind: string, data: unknown) => (await owner.agent.post(`${root}/entities`).send({ kind, data }).expect(201)).body;
async function register() {
  const agent = request.agent(app);
  const response = await agent.post('/api/v2/auth/register').send({ name: 'Private patient name', email: `${randomUUID()}@example.org`, password: 'Long consistency test password!', consent: true }).expect(201);
  return { agent, ...response.body };
}
beforeAll(async () => {
  db = await openDatabase(true); app = express(); app.use(express.json(), cookieParser()); app.use('/api/v2', await createV2Router(db));
  owner = await register(); friend = await register(); root = `/api/v2/spaces/${owner.spaceId}`;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => { await db.close(); });

describe('IST reporting and scheduled occurrence consistency', () => {
  it.each([
    ['2026-11-02T18:29:59.999Z', '2026-11-02'],
    ['2026-11-02T18:30:00.000Z', '2026-11-03'],
    ['2026-11-02T23:59:59.999Z', '2026-11-03'],
    ['2026-11-03T00:00:00.000Z', '2026-11-03'],
    ['2026-12-31T18:30:00.000Z', '2027-01-01'],
    ['2028-02-28T18:30:00.000Z', '2028-02-29'],
  ])('uses the IST calendar at %s', (clock, expected) => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(clock));
    expect(intakeToday()).toBe(expected);
    expect(dataSchemas.intakes.safeParse({ ...intake(randomUUID()), date: expected, scheduledTime: '23:59' }).success).toBe(true);
    const tomorrow = new Date(`${expected}T00:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    expect(dataSchemas.intakes.safeParse({ ...intake(randomUUID()), date: tomorrow.toISOString().slice(0, 10) }).success).toBe(false);
  });

  it('accepts an actual report at IST midnight for a later slot, but rejects tomorrow', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T18:30:00Z'));
    const med = await post('medicines', { ...medicine, startDate: '2026-11-03', endDate: '2026-11-04', days: [2, 3] });
    await post('intakes', { ...intake(med.id), date: '2026-11-03', scheduledTime: '23:00', status: 'taken' });
    await owner.agent.post(`${root}/entities`).send({ kind: 'intakes', data: { ...intake(med.id), date: '2026-11-04' } }).expect(400);
  });

  it('requires entered time, weekday and inclusive start/end dates on every new occurrence', async () => {
    const med = await post('medicines', medicine);
    for (const changes of [{ scheduledTime: '09:00' }, { date: '2026-01-02' }, { date: '2025-12-25' }, { date: '2026-01-15' }]) {
      await owner.agent.post(`${root}/entities`).send({ kind: 'intakes', data: { ...intake(med.id), ...changes } }).expect(400);
    }
    await post('intakes', intake(med.id));
    await post('intakes', { ...intake(med.id), date: '2026-01-08' });
    for (const changes of [{ times: [] }, { status: 'archived' }]) {
      const unavailable = await post('medicines', { ...medicine, ...changes });
      await owner.agent.post(`${root}/entities`).send({ kind: 'intakes', data: intake(unavailable.id) }).expect(400);
    }
  });

  it('preserves status/reason corrections after rescheduling and archival, not new or moved slots', async () => {
    const med = await post('medicines', medicine), entry = await post('intakes', intake(med.id));
    await owner.agent.put(`${root}/entities/${med.id}`).send({ version: 1, data: { ...medicine, times: [], days: [1], startDate: '2026-02-01', endDate: '2026-02-02', status: 'archived' } }).expect(200);
    const corrected = await owner.agent.put(`${root}/entities/${entry.id}`).send({ version: 1, data: { ...intake(med.id), status: 'taken', reason: 'Corrected recollection' } }).expect(200);
    expect(corrected.body.version).toBe(2);
    await owner.agent.put(`${root}/entities/${entry.id}`).send({ version: 1, data: intake(med.id) }).expect(409);
    await owner.agent.post(`${root}/entities`).send({ kind: 'intakes', data: { ...intake(med.id), date: '2026-01-08' } }).expect(400);
    await owner.agent.put(`${root}/entities/${entry.id}`).send({ version: 2, data: { ...intake(med.id), scheduledTime: '23:00' } }).expect(400);
    await owner.agent.delete(`${root}/entities/${med.id}`).send({ version: 2 }).expect(409);
  });

  it('checks same-space medicine identity on create and correction and rolls back duplicate moves', async () => {
    const med = await post('medicines', medicine), entry = await post('intakes', intake(med.id));
    const second = await post('intakes', { ...intake(med.id), scheduledTime: '23:00' });
    await owner.agent.put(`${root}/entities/${second.id}`).send({ version: 1, data: intake(med.id) }).expect(409);
    const foreign = (await friend.agent.post(`/api/v2/spaces/${friend.spaceId}/entities`).send({ kind: 'medicines', data: medicine }).expect(201)).body;
    const nonMedicine = await post('questions', { text: 'Not a medicine' });
    for (const id of [foreign.id, nonMedicine.id, randomUUID()]) {
      await owner.agent.post(`${root}/entities`).send({ kind: 'intakes', data: intake(id) }).expect(409);
      await owner.agent.put(`${root}/entities/${entry.id}`).send({ version: 1, data: intake(id) }).expect(409);
    }
    const audit = (await owner.agent.get(`${root}/audit`).expect(200)).body.audit;
    expect(audit.filter((e: { entityId: string }) => e.entityId === entry.id)).toHaveLength(1);
    expect(audit.filter((e: { entityId: string }) => e.entityId === second.id)).toHaveLength(1);
  });
});

describe('audit access, bounds and request budgets', () => {
  it('accepts the full signed-bigint cursor range and rejects malformed, overflow and injected limits', async () => {
    expect(auditQuerySchema.safeParse({ before: '9223372036854775807' }).success).toBe(true);
    for (const before of ['0', '-1', '1.5', '01', '9223372036854775808', '1e3', 'abc']) {
      await owner.agent.get(`${root}/audit`).query({ before }).expect(400);
    }
    await owner.agent.get(`${root}/audit?limit=10000`).expect(400);
    await owner.agent.get(`${root}/audit?before=9223372036854775807`).expect(200);
  });

  it('pages more than 500 audit rows without gaps, cross-space rows, or payload text', async () => {
    await db.query("INSERT INTO v2_audit(space_id,actor_id,action) SELECT $1,$2,'test.event' FROM generate_series(1,505)", [owner.spaceId, owner.user.id]);
    await db.query("INSERT INTO v2_audit(space_id,actor_id,action) VALUES($1,$2,'private.other-space')", [friend.spaceId, friend.user.id]);
    const first = (await owner.agent.get(`${root}/audit`).expect(200)).body;
    expect(first.audit).toHaveLength(500); expect(first.nextBefore).toBe(first.audit.at(-1).id);
    const second = (await owner.agent.get(`${root}/audit`).query({ before: first.nextBefore }).expect(200)).body;
    expect(second.nextBefore).toBeNull();
    const ids = [...first.audit, ...second.audit].map((e: { id: string }) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id, index) => index === 0 || BigInt(ids[index - 1]) > BigInt(id))).toBe(true);
    const count = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM v2_audit WHERE space_id=$1', [owner.spaceId])).rows[0].count;
    expect(ids).toHaveLength(count);
    const text = JSON.stringify([first, second]);
    for (const secret of ['private.other-space', 'Private instructions', 'Corrected recollection', owner.user.email]) expect(text).not.toContain(secret);
    expect((await owner.agent.get(root).expect(200)).body.audit).toHaveLength(500);
    expect((await owner.agent.get(`${root}/export`).expect(200)).body.audit).toHaveLength(500);
  });

  it('keeps read/write budgets separate, per account and across spaces; blocked writes produce no audit', async () => {
    const limited = await register(), path = `/api/v2/spaces/${limited.spaceId}`;
    for (let i = 0; i < 120; i++) await limited.agent.post(`${path}/entities`).send({ kind: 'questions', data: { text: 'Bounded write' } }).expect(201);
    const blocked = await limited.agent.post(`${path}/entities`).send({ kind: 'questions', data: { text: 'Must not persist' } }).expect(429);
    expect(blocked.body.code).toBe('RATE_LIMITED'); expect(blocked.headers['retry-after']).toBeDefined();
    await limited.agent.post(`${root}/entities`).send({ kind: 'questions', data: { text: 'Different path' } }).expect(429);
    for (let i = 0; i < 240; i++) await limited.agent.get(`${path}/audit`).expect(200);
    await limited.agent.get(`${path}/audit`).expect(429);
    await owner.agent.get(`${root}/audit`).expect(200);
    const count = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM v2_audit WHERE space_id=$1', [limited.spaceId])).rows[0].count;
    expect(count).toBe(121);
  });
});

describe('public insights boundaries and provider identity', () => {
  it('allows public lookup for a narrowly scoped companion without forwarding stored PHI or inbound headers', async () => {
    const invite = (await owner.agent.post(`${root}/invitations`).send({ label: 'Only questions', scopes: ['questions:read'] }).expect(201)).body;
    const grant = (await friend.agent.post('/api/v2/invitations/accept').send({ token: invite.token }).expect(201)).body;
    const snapshot = (await friend.agent.get(root).expect(200)).body;
    expect(snapshot.entities.medicines).toEqual([]); expect(snapshot.entities.intakes).toEqual([]); expect(snapshot.audit).toEqual([]);
    await friend.agent.get(`${root}/audit`).expect(403);
    await friend.agent.get(`${root}/export`).expect(403);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [{ id: 'exact-source-id', set_id: randomUUID(), openfda: { generic_name: ['Metformin'] }, warnings: ['Reference text'] }] })));
    vi.stubGlobal('fetch', fetchMock);
    const response = await friend.agent.get('/api/v2/knowledge/labels?q=metformin').set('Authorization', 'private-header').set('X-Patient-Id', owner.user.id).expect(200);
    expect(new URL(response.body.results[0].sourceUrl).searchParams.get('search')).toBe('id:"exact-source-id"');
    const forwarded = JSON.stringify(fetchMock.mock.calls.map(([url, options]) => [String(url), options]));
    for (const secret of ['private-header', owner.user.id, owner.user.email, 'Private instructions', 'Private patient name']) expect(forwarded).not.toContain(secret);
    await friend.agent.get('/api/v2/knowledge/labels').query({ q: 'metformin', spaceId: owner.spaceId }).expect(400);
    await owner.agent.delete(`${root}/grants/${grant.grantId}`).expect(200);
    await friend.agent.get(root).expect(404);
    // Reference access is account-authenticated, not a grant to patient data.
    await friend.agent.get('/api/v2/knowledge/labels?q=metformin').expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await request(app).get('/api/v2/knowledge/labels?q=metformin').expect(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects altered source IDs and excessive provider results rather than misidentifying or expanding references', async () => {
    const fetchMock = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', fetchMock); vi.stubEnv('FDC_API_KEY', '');
    const cases = [
      ['/knowledge/labels?q=invalidid', { results: [{ id: 'bad/id', openfda: { generic_name: ['invalidid'] } }] }],
      ['/knowledge/labels?q=toomany', { results: Array.from({ length: 11 }, (_, i) => ({ id: `label-${i}`, openfda: { generic_name: ['toomany'] } })) }],
      ['/knowledge/medicines?q=toomany', { data: Array.from({ length: 21 }, () => ({ setid: randomUUID(), title: 'Label' })) }],
      ['/foods/search?q=toomany', { products: Array.from({ length: 21 }, () => ({ code: '12345678', product_name: 'Food' })) }],
    ] as const;
    for (const [path, body] of cases) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
      const response = await owner.agent.get(`/api/v2${path}`).expect(502);
      expect(response.body.code).toBe('PROVIDER_UNAVAILABLE'); expect(response.body.results).toBeUndefined();
    }
    vi.stubEnv('FDC_API_KEY', 'test-only-key');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ foods: Array.from({ length: 21 }, (_, i) => ({ fdcId: i + 1, description: 'Food' })) })));
    await owner.agent.get('/api/v2/foods/search?q=toomanyusda').expect(502);
  });

  it('rate limits even cached reference lookups without blocking patient record reads', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [] })));
    vi.stubGlobal('fetch', fetchMock);
    let blocked = false;
    for (let i = 0; i < 31; i++) {
      const response = await owner.agent.get('/api/v2/knowledge/medicines?q=budgetcheck');
      if (response.status === 429) { expect(response.body.code).toBe('RATE_LIMITED'); blocked = true; break; }
      expect(response.status).toBe(200);
    }
    expect(blocked).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(1);
    await owner.agent.get(`${root}/audit`).expect(200);
  });
});