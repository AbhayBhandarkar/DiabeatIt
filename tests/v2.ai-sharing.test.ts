import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { openDatabase, type Database } from '../server/db';
import { createV2Router } from '../server/v2';
import { aiConfig, extractJson, runAi } from '../server/v2/ai/provider';
import { foodPhotoResult, aiPrompts, fitToSchema, timelineSummaryResult } from '../shared/ai';
import { buildTimeline, timelinePrompt } from '../shared/timeline';
import { evidenceCards } from '../shared/evidence';

let db: Database, app: Express, phone: ReturnType<typeof request.agent>, root: string, userId: string;
const reply = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] }), { status: 200 });
const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
beforeAll(async () => {
  db = await openDatabase(true); app = express(); app.use(express.json({ limit: '3mb' }), cookieParser()); app.use('/api/v2', await createV2Router(db));
  phone = request.agent(app);
  const r = await phone.post('/api/v2/auth/register').send({ name: 'Asha Rao', email: `${randomUUID()}@example.org`, password: 'A long passphrase for tests!', consent: true }).expect(201);
  root = `/api/v2/spaces/${r.body.spaceId}`; userId = r.body.user.id;
});
afterAll(async () => { await db.close(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('AI provider configuration', () => {
  it('is disabled without credentials and defaults Groq to Qwen 3.8 27B', () => {
    expect(aiConfig({})).toBeNull();
    const groq = aiConfig({ GROQ_API_KEY: 'k' })!;
    expect(groq.baseUrl).toBe('https://api.groq.com/openai/v1');
    expect(groq.textModel).toBe('qwen/qwen3.8-27b');
    expect(groq.reasoningEffort).toBe('none');
  });
  it('accepts an OpenAI-compatible on-device gateway on the local network only over http', () => {
    expect(aiConfig({ AI_PROVIDER: 'openai-compatible', AI_BASE_URL: 'http://192.168.1.20:8080/v1', AI_TEXT_MODEL: 'small' })?.baseUrl).toBe('http://192.168.1.20:8080/v1');
    expect(aiConfig({ AI_PROVIDER: 'openai-compatible', AI_BASE_URL: 'http://example.com/v1', AI_TEXT_MODEL: 'small' })).toBeNull();
  });
  it('extracts JSON from small-model replies with reasoning or fences', () => {
    expect(extractJson('<think>hmm</think>```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('repairs lists that leaked into the sections array and lists sent as one string', () => {
    const broken = { overview: 'x', sections: [{ heading: 'Visits', points: [{ text: 'Seen', refs: ['app-1'] }, 'Loose point'] }, 'questionsForVisit', ':', ['Ask about feet?']], dataGaps: 'No eye exam; no BP' };
    const fixed = timelineSummaryResult.parse(fitToSchema(broken));
    expect(fixed.questionsForVisit).toEqual(['Ask about feet?']);
    expect(fixed.dataGaps).toEqual(['No eye exam', 'no BP']);
    expect(fixed.sections[0].points[1]).toEqual({ text: 'Loose point', refs: [] });
  });
  it('rejects model output carrying medical fields', () => {
    expect(() => foodPhotoResult.parse({ items: [{ name: 'rice', estimatedGrams: 100, uncertainty: 'rough', insulinDose: 2 }], limitations: '' })).toThrow();
  });
  it('sends a fixed system prompt and discards invalid output', async () => {
    const fetcher = vi.fn().mockImplementation(async () => reply({ verdict: 'myth' }));
    await expect(runAi('mythCheck', 'claim', { config: aiConfig({ GROQ_API_KEY: 'k' }), fetcher })).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(fetcher.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(body.messages[0]).toEqual({ role: 'system', content: aiPrompts.mythCheck });
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).model).toBe('openai/gpt-oss-20b');
  });
});

describe('AI endpoints', () => {
  it('report capabilities and fail closed without a provider', async () => {
    vi.stubEnv('GROQ_API_KEY', ''); vi.stubEnv('AI_API_KEY', ''); vi.stubEnv('AI_PROVIDER', '');
    const caps = await phone.get('/api/v2/ai/capabilities').expect(200);
    expect(caps.body.features.foodPhoto).toBe(false);
    await phone.post('/api/v2/ai/myth-check').send({ claim: 'Rice is forbidden' }).expect(503);
  });
  it('require consent and a real image signature before any request', async () => {
    vi.stubEnv('GROQ_API_KEY', 'k'); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await phone.post('/api/v2/ai/food-photo').send({ consent: false, image: jpeg }).expect(400);
    await phone.post('/api/v2/ai/prescription-scan').send({ consent: true, image: 'data:image/jpeg;base64,YWJj' }).expect(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('return validated prescription drafts that still require confirmation', async () => {
    vi.stubEnv('GROQ_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ medicines: [{ name: 'Glycomet 500', ingredient: 'Metformin', strength: '500 mg', form: 'Tablet', timing: ['morning', 'night'], withFood: 'after', durationDays: 30, confidence: 'high' }], prescriber: 'Dr. K', date: '2026-10-01', limitations: 'Handwriting' })));
    const r = await phone.post('/api/v2/ai/prescription-scan').send({ consent: true, image: jpeg }).expect(200);
    expect(r.body.requiresConfirmation).toBe(true);
    expect(r.body.medicines[0].timing).toEqual(['morning', 'night']);
    expect((await phone.get(root)).body.entities.medicines).toEqual([]);
  });
  it('ground myth checks in known evidence cards only', async () => {
    vi.stubEnv('GROQ_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ verdict: 'myth', headline: 'No food is banned', explanation: 'Portions matter.', evidenceIds: ['meal-plan', 'made-up'], talkToDoctor: false })));
    const r = await phone.post('/api/v2/ai/myth-check').send({ claim: 'People with diabetes can never eat rice' }).expect(200);
    expect(r.body.evidence.map((e: { id: string }) => e.id)).toEqual(['meal-plan']);
    expect(evidenceCards.every(c => c.url.startsWith('https://'))).toBe(true);
  });
  it('summarise the timeline with citations restricted to supplied records', async () => {
    const apt = await phone.post(`${root}/entities`).send({ kind: 'appointments', data: { date: '2026-10-01', clinician: 'Dr. Mehta', specialty: 'Endocrinology', facility: '', reason: 'Review', notes: '', changes: 'Metformin increased' } }).expect(201);
    await phone.post(`${root}/entities`).send({ kind: 'labs', data: { name: 'HbA1c', value: 7.6, unit: '%', takenOn: '2026-09-28', notes: '' } }).expect(201);
    const ref = `app-${apt.body.id.replace(/-/g, '').slice(0, 6)}`;
    vi.stubEnv('GROQ_API_KEY', 'k');
    const fetcher = vi.fn().mockResolvedValue(reply({ overview: 'One visit and one lab.', sections: [{ heading: 'Visits', points: [{ text: 'Seen by Dr. Mehta', refs: [ref, 'xyz-000000'] }] }], questionsForVisit: [], dataGaps: ['No glucose readings'] }));
    vi.stubGlobal('fetch', fetcher);
    const r = await phone.post('/api/v2/ai/timeline-summary').send({ spaceId: root.split('/').at(-1), fromDate: '2026-01-01' }).expect(200);
    expect(r.body.sections[0].points[0].refs).toEqual([ref]);
    const prompt = JSON.parse(fetcher.mock.calls[0][1].body).messages[1].content as string;
    expect(prompt).toContain('HbA1c: 7.6 %');
    expect(prompt).not.toContain(userId);
  });
});

describe('timeline builder', () => {
  it('orders events newest first and marks upcoming visits', () => {
    const e = (kind: string, data: unknown) => ({ id: randomUUID(), kind, version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', author: { id: 'a', name: 'A', role: 'owner' as const }, data: data as Record<string, unknown> });
    const events = buildTimeline({ appointments: [e('appointments', { date: '2026-12-01', clinician: 'Dr. A', specialty: '', facility: '', reason: '', notes: '', changes: '' })] as never, labs: [e('labs', { name: 'HbA1c', value: 7, unit: '%', takenOn: '2026-10-01', notes: '' })] as never }, '2026-11-05');
    expect(events.map(x => x.kind)).toEqual(['appointment', 'lab']);
    expect(events[0].upcoming).toBe(true);
    expect(timelinePrompt({}, '2026-11-05', '2026-01-01').text).toContain('no readings');
  });
});

describe('desktop sign-in from a signed-in phone', () => {
  it('signs a desktop in only after number matching on the phone, once', async () => {
    const desktop = request.agent(app);
    const start = await desktop.post('/api/v2/device-login/start').set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537').expect(201);
    const { id, secret, match } = start.body;
    expect((await desktop.post('/api/v2/device-login/poll').send({ id, secret })).body.status).toBe('pending');
    await desktop.get('/api/v2/me').expect(401);
    const details = await phone.get(`/api/v2/device-login/${id}`).expect(200);
    expect(details.body.device).toBe('Chrome on Windows');
    expect(details.body.choices).toContain(match);
    await phone.post(`/api/v2/device-login/${id}/approve`).send({ match }).expect(200);
    const done = await desktop.post('/api/v2/device-login/poll').send({ id, secret }).expect(200);
    expect(done.body.status).toBe('approved');
    expect(done.body.me.user.id).toBe(userId);
    await desktop.get('/api/v2/me').expect(200);
    expect((await request(app).post('/api/v2/device-login/poll').send({ id, secret })).body.status).toBe('expired');
  });
  it('blocks the attempt after a wrong number and rejects a wrong secret', async () => {
    const desktop = request.agent(app);
    const { id, secret, match } = (await desktop.post('/api/v2/device-login/start').expect(201)).body;
    expect((await desktop.post('/api/v2/device-login/poll').send({ id, secret: 'f'.repeat(64) })).body.status).toBe('expired');
    const wrong = match === '10' ? '11' : '10';
    await phone.post(`/api/v2/device-login/${id}/approve`).send({ match: wrong }).expect(409);
    await phone.post(`/api/v2/device-login/${id}/approve`).send({ match }).expect(404);
    expect((await desktop.post('/api/v2/device-login/poll').send({ id, secret })).body.status).toBe('denied');
  });
});

describe('clinician links', () => {
  it('give a read-only view until revoked, and audit each view', async () => {
    const created = await phone.post(`${root}/clinician-links`).send({ label: 'Dr. Mehta', days: 7, fromDate: '2026-01-01' }).expect(201);
    const doctor = request(app);
    const view = await doctor.post('/api/v2/clinician/view').send({ token: created.body.token }).expect(200);
    expect(view.body.patientName).toBe('Asha Rao');
    expect(view.body.entities.labs).toHaveLength(1);
    expect(view.body.entities.documents).toBeUndefined();
    await doctor.get(`${root}`).expect(401);
    const list = await phone.get(`${root}/clinician-links`).expect(200);
    expect(list.body.links[0].lastViewedAt).not.toBeNull();
    expect(JSON.stringify(list.body)).not.toContain(created.body.token);
    expect((await phone.get(root)).body.audit.some((a: { action: string }) => a.action === 'clinician_link.viewed')).toBe(true);
    await phone.delete(`${root}/clinician-links/${created.body.id}`).expect(200);
    await doctor.post('/api/v2/clinician/view').send({ token: created.body.token }).expect(404);
  });
});
