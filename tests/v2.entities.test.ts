import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { openDatabase, type Database } from '../server/db';
import { createV2Router } from '../server/v2';
import type { EntityKind } from '../shared/v2';

let db: Database, app: Express, a: ReturnType<typeof request.agent>, b: ReturnType<typeof request.agent>, root: string, other: string, userId: string;
const medicine = { name: 'My recorded medicine', ingredient: 'Ingredient', strength: 'As labeled', form: 'Tablet', route: 'Oral', instructions: 'Patient-reported directions', times: ['08:00'], days: [0, 1, 2, 3, 4, 5, 6], startDate: '2026-01-01', status: 'active', source: 'Patient-reported' };
const at = '2026-01-01T10:00:00Z';
const nutrition = { carbs: null, fiber: null, protein: null, kcal: null };
const pdf = Buffer.from('%PDF-1.4\n%%EOF').toString('base64');
beforeAll(async () => {
  db = await openDatabase(true); app = express(); app.use(express.json({ limit: '3mb' }), cookieParser()); app.use('/api/v2', await createV2Router(db));
  a = request.agent(app); b = request.agent(app);
  for (const agent of [a, b]) {
    const response = await agent.post('/api/v2/auth/register').send({ name: 'Patient', email: `${randomUUID()}@example.org`, password: 'A long passphrase for tests!', consent: true }).expect(201);
    if (agent === a) { root = `/api/v2/spaces/${response.body.spaceId}`; userId = response.body.user.id; } else other = `/api/v2/spaces/${response.body.spaceId}`;
  }
});
afterAll(async () => { await db.close(); });

describe('v2 versioned records', () => {
  it('validates and persists every supported collection with server authors', async () => {
    const data: Partial<Record<EntityKind, unknown>> = {
      medicines: medicine, glucose: { value: 100, unit: 'mg/dL', measuredAt: at, context: 'Recorded reading' },
      meals: { name: 'Recorded meal', meal: 'Lunch', at, grams: 100, ...nutrition, source: 'Package' },
      recipes: { name: 'Recipe', servings: 2, ingredients: [{ name: 'Ingredient', grams: 10, ...nutrition, source: 'Package' }], instructions: '' },
      documents: { name: 'record.pdf', mime: 'application/pdf', base64: pdf }, questions: { text: 'A coordination question' },
      tasks: { title: 'Bring records', assignee: '', dueDate: '2027-01-01', status: 'open' }, symptoms: { text: 'Recorded observation', at },
      lessons: { lessonId: 'label-portions', completed: false, position: 0 }, reviews: { title: 'Discuss records', question: 'What to discuss?', status: 'open', resolution: '' },
    };
    for (const [kind, value] of Object.entries(data)) {
      const response = await a.post(`${root}/entities`).send({ kind, data: value }).expect(201);
      expect(response.body.kind).toBe(kind); expect(response.body.version).toBe(1); expect(response.body.author).toEqual({ id: userId, name: 'Patient', role: 'owner' });
      expect(response.body.createdAt).toMatch(/Z$/); expect(response.body.data.base64).toBeUndefined();
    }
    const snapshot = (await a.get(root).expect(200)).body;
    expect(snapshot.entities.meals[0].data.carbs).toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain(pdf); expect(snapshot.entities.documents[0].data.size).toBe(Buffer.from(pdf, 'base64').length);
  });
  it('resolves concurrent updates by version without duplicate audit entries', async () => {
    const entity = (await a.post(`${root}/entities`).send({ kind: 'questions', data: { text: 'Initial' } }).expect(201)).body;
    const results = await Promise.all(['First', 'Second'].map(text => a.put(`${root}/entities/${entity.id}`).send({ version: 1, data: { text } })));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const changed = results.find(r => r.status === 200)!.body; expect(changed.version).toBe(2); expect(changed.createdAt).toBe(entity.createdAt);
    await a.delete(`${root}/entities/${entity.id}`).send({ version: 1 }).expect(409);
    await a.delete(`${root}/entities/${entity.id}`).send({ version: 2 }).expect(200);
    const audit = (await a.get(root)).body.audit.filter((e: { entityId: string }) => e.entityId === entity.id);
    expect(audit.map((e: { action: string }) => e.action).sort()).toEqual(['entity.created', 'entity.deleted', 'entity.updated']);
  });
  it('rejects unknown fields, wrong scalar types, invalid calendars and future observations', async () => {
    const cases = [
      { kind: 'questions', data: { text: 'Unknown', professional: true } }, { kind: 'questions', data: { text: '' } },
      { kind: 'glucose', data: { value: '100', unit: 'mg/dL', measuredAt: at, context: 'Reading' } },
      { kind: 'glucose', data: { value: -1, unit: 'mg/dL', measuredAt: at, context: 'Reading' } },
      { kind: 'glucose', data: { value: 2001, unit: 'mg/dL', measuredAt: at, context: 'Reading' } },
      { kind: 'glucose', data: { value: 200, unit: 'mmol/L', measuredAt: at, context: 'Reading' } },
      { kind: 'glucose', data: { value: 100, unit: 'mg/dL', measuredAt: '2999-01-01T00:00:00Z', context: 'Reading' } },
      { kind: 'medicines', data: { ...medicine, startDate: '2026-02-30' } }, { kind: 'medicines', data: { ...medicine, times: ['25:00'] } },
      { kind: 'medicines', data: { ...medicine, days: [1, 1] } }, { kind: 'medicines', data: { ...medicine, endDate: '2025-01-01' } },
      { kind: 'meals', data: { name: 'Meal', meal: 'Lunch', at, grams: 10, ...nutrition, source: 'Package', sourceUrl: 'https://evil.invalid/track' } },
      { kind: 'reviews', data: { title: 'Review', question: 'Question', status: 'resolved', resolution: '' } },
      { kind: 'prescriptions', data: { text: 'Unsupported action' } },
    ];
    for (const entry of cases) await a.post(`${root}/entities`).send(entry).expect(400);
  });
  it('treats SQL-looking input as plain data and rejects path injection', async () => {
    const text = "'); DROP TABLE v2_accounts; --";
    const entry = (await a.post(`${root}/entities`).send({ kind: 'questions', data: { text } }).expect(201)).body;
    expect(entry.data.text).toBe(text); await a.get('/api/v2/me').expect(200);
    await a.get('/api/v2/spaces/not-a-uuid').expect(400);
    await a.post(`${root}/entities`).send({ kind: 'questions', data: { text }, version: 99 }).expect(400);
    await a.put(`${root}/entities/${entry.id}`).send({ version: 1, data: { text }, kind: 'reviews' }).expect(400);
  });
  it('never updates or deletes an entity through another patient partition', async () => {
    const entity = (await a.post(`${root}/entities`).send({ kind: 'questions', data: { text: 'Private' } }).expect(201)).body;
    await b.put(`${other}/entities/${entity.id}`).send({ version: 1, data: { text: 'No' } }).expect(404);
    await b.delete(`${other}/entities/${entity.id}`).send({ version: 1 }).expect(404);
    await b.get(`${root}/export`).expect(404);
  });
  it('enforces medicine references and one intake occurrence across concurrent requests', async () => {
    const med = (await a.post(`${root}/entities`).send({ kind: 'medicines', data: medicine }).expect(201)).body;
    const intake = { medicineId: med.id, date: '2026-01-01', scheduledTime: '08:00', status: 'unsure', reason: '' };
    const results = await Promise.all([a.post(`${root}/entities`).send({ kind: 'intakes', data: intake }), a.post(`${root}/entities`).send({ kind: 'intakes', data: intake })]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    const entity = results.find(r => r.status === 201)!.body;
    await b.post(`${other}/entities`).send({ kind: 'intakes', data: intake }).expect(409);
    const question = (await a.post(`${root}/entities`).send({ kind: 'questions', data: { text: 'Not a medicine' } })).body;
    await a.post(`${root}/entities`).send({ kind: 'intakes', data: { ...intake, medicineId: question.id } }).expect(409);
    await a.post(`${root}/entities`).send({ kind: 'intakes', data: { ...intake, medicineId: randomUUID() } }).expect(409);
    await a.put(`${root}/entities/${entity.id}`).send({ version: 1, data: { ...intake, status: 'taken' } }).expect(200);
    await a.delete(`${root}/entities/${med.id}`).send({ version: 1 }).expect(409);
    await a.delete(`${root}/entities/${entity.id}`).send({ version: 2 }).expect(200);
    await a.delete(`${root}/entities/${med.id}`).send({ version: 1 }).expect(200);
  });
  it('keeps audit rows immutable but exports only metadata and paginates history', async () => {
    await expect(db.query("UPDATE v2_audit SET action='changed' WHERE space_id=$1", [root.split('/').at(-1)])).rejects.toThrow('immutable');
    await expect(db.query('DELETE FROM v2_audit WHERE space_id=$1', [root.split('/').at(-1)])).rejects.toThrow('immutable');
    const response = await a.get(`${root}/export`).expect(200);
    expect(response.headers['content-disposition']).toContain('attachment'); expect(response.body.format).toBe('diabeatit-v2'); expect(JSON.stringify(response.body)).not.toContain('base64');
    const first = (await a.get(`${root}/audit`).expect(200)).body;
    const before = first.audit[0].id;
    const next = (await a.get(`${root}/audit?before=${before}`).expect(200)).body;
    expect(next.audit.every((r: { id: string }) => BigInt(r.id) < BigInt(before))).toBe(true);
  });
  it('rolls back entity and blob creation if the audit cannot be recorded', async () => {
    const before = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM v2_documents')).rows[0].count;
    await db.query("ALTER TABLE v2_audit ADD CONSTRAINT v2_test_audit_failure CHECK(action<>'entity.created') NOT VALID");
    try {
      await a.post(`${root}/entities`).send({ kind: 'documents', data: { name: 'must-rollback.pdf', mime: 'application/pdf', base64: pdf } }).expect(400);
      expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM v2_documents')).rows[0].count).toBe(before);
      expect((await db.query("SELECT 1 FROM v2_entities WHERE data->>'name'='must-rollback.pdf'")).rows).toHaveLength(0);
    } finally { await db.query('ALTER TABLE v2_audit DROP CONSTRAINT v2_test_audit_failure'); }
  });
  it('rejects prototype and clinical-authority fields in nested request data', async () => {
    await a.post(`${root}/entities`).set('Content-Type', 'application/json').send('{"kind":"questions","data":{"text":"Question","__proto__":{"polluted":true}}}').expect(400);
    await a.post(`${root}/entities`).send({ kind: 'reviews', data: { title: 'Coordination', question: 'Question', status: 'open', resolution: '', signedBy: 'Doctor' } }).expect(400);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe('v2 documents', () => {
  it('validates signatures and size, downloads attachments, replaces and deletes bytes atomically', async () => {
    for (const data of [
      { name: 'bad.pdf', mime: 'application/pdf', base64: Buffer.from('<html>bad</html>').toString('base64') },
      { name: 'bad.svg', mime: 'image/svg+xml', base64: pdf }, { name: '../bad.pdf', mime: 'application/pdf', base64: pdf },
      { name: 'bad.pdf', mime: 'application/pdf', base64: '%%%%' },
    ]) await a.post(`${root}/entities`).send({ kind: 'documents', data }).expect(400);
    const oversized = Buffer.alloc(2 * 1024 * 1024 + 1); oversized.write('%PDF-');
    await a.post(`${root}/entities`).send({ kind: 'documents', data: { name: 'large.pdf', mime: 'application/pdf', base64: oversized.toString('base64') } }).expect(413);
    const entity = (await a.post(`${root}/entities`).send({ kind: 'documents', data: { name: 'safe.pdf', mime: 'application/pdf', base64: pdf } }).expect(201)).body;
    await b.get(`${other}/documents/${entity.id}`).expect(404); await b.get(`${root}/documents/${entity.id}`).expect(404);
    const download = await a.get(`${root}/documents/${entity.id}`).expect(200);
    expect(download.headers['content-type']).toContain('application/pdf'); expect(download.headers['content-disposition']).toContain('attachment'); expect(download.headers['x-content-type-options']).toBe('nosniff'); expect(download.body.toString()).toBe(Buffer.from(pdf, 'base64').toString());
    const replacement = Buffer.from('%PDF-1.7\nchanged\n%%EOF').toString('base64');
    await a.put(`${root}/entities/${entity.id}`).send({ version: 1, data: { name: 'replacement.pdf', mime: 'application/pdf', base64: replacement } }).expect(200);
    await a.put(`${root}/entities/${entity.id}`).send({ version: 1, data: { name: 'stale.pdf', mime: 'application/pdf', base64: pdf } }).expect(409);
    expect((await a.get(`${root}/documents/${entity.id}`)).body.toString()).toContain('changed');
    await a.delete(`${root}/entities/${entity.id}`).send({ version: 2 }).expect(200);
    await a.get(`${root}/documents/${entity.id}`).expect(404);
    expect((await db.query('SELECT 1 FROM v2_documents WHERE entity_id=$1', [entity.id])).rows).toHaveLength(0);
  });
  it('pages one collection, newest first, without another workspace or file bytes', async () => {
    const made: string[] = [];
    for (const text of ['Page one', 'Page two', 'Page three']) made.push((await a.post(`${root}/entities`).send({ kind: 'questions', data: { text } }).expect(201)).body.id);
    const first = await a.get(`${root}/entities`).query({ kind: 'questions', limit: 2 }).expect(200);
    expect(first.body.entities.map((entity: { id: string }) => entity.id)).toEqual([made[2], made[1]]);
    expect(JSON.stringify(first.body)).not.toContain(pdf);
    expect(first.body.nextBefore).toBe(made[1]);
    const second = await a.get(`${root}/entities`).query({ kind: 'questions', limit: 2, before: first.body.nextBefore }).expect(200);
    expect(second.body.entities[0].id).toBe(made[0]);
    await a.get(`${root}/entities`).query({ kind: 'questions', before: randomUUID() }).expect(400);
    await b.get(`${root}/entities`).query({ kind: 'questions' }).expect(404);
    await a.get(`${root}/entities`).query({ kind: 'not-a-kind' }).expect(400);
  });
});