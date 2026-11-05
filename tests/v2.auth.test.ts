import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { openDatabase, type Database } from '../server/db';
import { createV2Router } from '../server/v2';
import { hashToken } from '../server/v2/security';

let db: Database, app: Express;
const password = 'Correct horse battery staple 42!';
async function register(name = 'Account') {
  const agent = request.agent(app), email = `${randomUUID()}@example.org`;
  const response = await agent.post('/api/v2/auth/register').send({ name, email, password, consent: true }).expect(201);
  return { agent, email, ...response.body, cookie: response.headers['set-cookie'][0] };
}
beforeAll(async () => {
  db = await openDatabase(true); app = express(); app.use(express.json({ limit: '3mb' }), cookieParser()); app.use('/api/v2', await createV2Router(db));
});
afterAll(async () => { await db.close(); });

describe('v2 accounts and sessions', () => {
  it('requires a real live account session, not a legacy cookie', async () => {
    await request(app).get('/api/v2/me').expect(401);
    await request(app).get('/api/v2/me').set('Cookie', `diabeatit_session=${'a'.repeat(64)}`).expect(401);
  });
  it('creates a blank owner space, secure cookie, salted hash and recovery codes atomically', async () => {
    const a = await register('Patient');
    expect(a.cookie).toContain('HttpOnly'); expect(a.cookie).toContain('SameSite=Strict'); expect(a.cookie).toContain('Path=/api/v2');
    expect(a.spaces).toHaveLength(1); expect(a.spaces[0].role).toBe('owner'); expect(a.spaces[0].scopes).toHaveLength(26);
    const snapshot = (await a.agent.get(`/api/v2/spaces/${a.spaceId}`).expect(200)).body;
    expect(Object.keys(snapshot.entities)).toHaveLength(13); expect(Object.values(snapshot.entities).flat()).toHaveLength(0);
    expect(snapshot.audit[0].action).toBe('space.created'); expect(a.recoveryCodes).toHaveLength(8);
    const stored = (await db.query<{ password_hash: string }>('SELECT password_hash FROM v2_accounts WHERE id=$1', [a.user.id])).rows[0];
    expect(stored.password_hash).toMatch(/^scrypt\$32768\$8\$1\$/); expect(stored.password_hash).not.toContain(password);
    const tokens = (await db.query<{ token_hash: string }>('SELECT token_hash FROM v2_recovery_codes WHERE account_id=$1', [a.user.id])).rows.map(r => r.token_hash);
    expect(tokens).toContain(hashToken(a.recoveryCodes[0])); expect(tokens).not.toContain(a.recoveryCodes[0]);
    const me = (await a.agent.get('/api/v2/me')).body; expect(me.recoveryCodes).toBeUndefined(); expect(JSON.stringify(me)).not.toContain('password');
  });
  it('normalizes email uniqueness and leaves no orphan space on failed registration', async () => {
    const a = await register();
    const before = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM v2_spaces')).rows[0].count;
    await request(app).post('/api/v2/auth/register').send({ name: 'Duplicate', email: a.email.toUpperCase(), password, consent: true }).expect(409);
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM v2_spaces')).rows[0].count).toBe(before);
  });
  it('requires consent, long passwords and rejects role injection', async () => {
    const body = { name: 'Patient', email: 'invalid-registration@example.org', password, consent: true };
    for (const override of [{ consent: false }, { password: 'short' }, { role: 'professional' }, { name: '' }]) {
      await request(app).post('/api/v2/auth/register').send({ ...body, ...override }).expect(400);
    }
  });
  it('logs in case-insensitively, rejects bad passwords and revokes logout tokens', async () => {
    const a = await register(); const b = request.agent(app);
    await b.post('/api/v2/auth/login').send({ email: a.email, password: 'incorrect value' }).expect(401);
    const login = await b.post('/api/v2/auth/login').send({ email: a.email.toUpperCase(), password }).expect(200);
    expect(login.body.user.id).toBe(a.user.id);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    await b.post('/api/v2/auth/logout').send({}).expect(200);
    await request(app).get('/api/v2/me').set('Cookie', cookie).expect(401);
    await a.agent.get('/api/v2/me').expect(200);
  });
  it('checks persisted expiry on every request', async () => {
    const a = await register(); await a.agent.get('/api/v2/me').expect(200);
    await db.query("UPDATE v2_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE account_id=$1", [a.user.id]);
    await a.agent.get('/api/v2/me').expect(401);
  });
  it('changes passwords only with current proof and invalidates all sessions', async () => {
    const a = await register(); const b = request.agent(app);
    await b.post('/api/v2/auth/login').send({ email: a.email, password }).expect(200);
    await a.agent.post('/api/v2/auth/password').send({ currentPassword: 'wrong password', newPassword: `${password}new` }).expect(401);
    await a.agent.post('/api/v2/auth/password').send({ currentPassword: password, newPassword: `${password}new` }).expect(200);
    await b.get('/api/v2/me').expect(401); await a.agent.get('/api/v2/me').expect(401);
    await b.post('/api/v2/auth/login').send({ email: a.email, password }).expect(401);
    await b.post('/api/v2/auth/login').send({ email: a.email, password: `${password}new` }).expect(200);
  });
  it('consumes recovery codes only once even under concurrent requests', async () => {
    const a = await register(); const payload = { email: a.email, recoveryCode: a.recoveryCodes[0], newPassword: `${password}recovered` };
    const results = await Promise.all([request(app).post('/api/v2/auth/recover').send(payload), request(app).post('/api/v2/auth/recover').send(payload)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 401]);
    await a.agent.get('/api/v2/me').expect(401);
    await request(app).post('/api/v2/auth/recover').send(payload).expect(401);
    await a.agent.post('/api/v2/auth/login').send({ email: a.email, password: payload.newPassword }).expect(200);
  });
});

describe('v2 invitations and ownership', () => {
  it('isolates spaces and shares only granted collections; authors cannot impersonate professionals', async () => {
    const owner = await register('Owner'), friend = await register('Companion'), stranger = await register('Other');
    const root = `/api/v2/spaces/${owner.spaceId}`;
    await stranger.agent.get(root).expect(404);
    await stranger.agent.post(`${root}/entities`).send({ kind: 'questions', data: { text: 'No access' } }).expect(404);
    await owner.agent.post(`${root}/entities`).send({ kind: 'questions', data: { text: 'Shared question' } }).expect(201);
    await owner.agent.post(`${root}/entities`).send({ kind: 'symptoms', data: { text: 'Private observation', at: '2026-01-01T12:00:00Z' } }).expect(201);
    const invitation = (await owner.agent.post(`${root}/invitations`).send({ label: 'Family', scopes: ['questions:read', 'questions:write'] }).expect(201)).body;
    const listing = (await owner.agent.get(root)).body.invitations[0];
    expect(listing.token).toBeUndefined(); expect(listing.token_hash).toBeUndefined();
    const accepted = (await friend.agent.post('/api/v2/invitations/accept').send({ token: invitation.token }).expect(201)).body;
    const shared = (await friend.agent.get(root).expect(200)).body;
    expect(shared.space.role).toBe('companion'); expect(shared.entities.questions).toHaveLength(1); expect(shared.entities.symptoms).toHaveLength(0);
    expect(shared.audit).toEqual([]); expect(shared.grants).toEqual([]); expect(shared.invitations).toEqual([]);
    await friend.agent.get(`${root}/export`).expect(403); await friend.agent.get(`${root}/audit`).expect(403);
    await friend.agent.post(`${root}/invitations`).send({ label: 'Escalation', scopes: ['medicines:read'] }).expect(403);
    await friend.agent.post(`${root}/entities`).send({ kind: 'symptoms', data: { text: 'No scope', at: '2026-01-01T12:00:00Z' } }).expect(403);
    const entry = (await friend.agent.post(`${root}/entities`).send({ kind: 'questions', data: { text: 'Patient coordination' } }).expect(201)).body;
    expect(entry.author).toEqual({ id: friend.user.id, name: 'Companion', role: 'companion' });
    await friend.agent.post(`${root}/entities`).send({ kind: 'questions', data: { text: 'Forged' }, author: { role: 'professional' } }).expect(400);
    await stranger.agent.delete(`${root}/grants/${accepted.grantId}`).expect(404);
    await owner.agent.delete(`${root}/grants/${accepted.grantId}`).expect(200);
    await friend.agent.get(root).expect(404);
    await friend.agent.post(`${root}/entities`).send({ kind: 'questions', data: { text: 'Revoked' } }).expect(404);
    await friend.agent.post('/api/v2/invitations/accept').send({ token: invitation.token }).expect(409);
  });
  it('does not allow read-only grants to write and rejects unknown or write-only scopes', async () => {
    const owner = await register(), friend = await register(); const root = `/api/v2/spaces/${owner.spaceId}`;
    await owner.agent.post(`${root}/invitations`).send({ label: 'Bad', scopes: ['professional:write'] }).expect(400);
    await owner.agent.post(`${root}/invitations`).send({ label: 'Bad', scopes: ['questions:write'] }).expect(400);
    const invite = (await owner.agent.post(`${root}/invitations`).send({ label: 'Read', scopes: ['questions:read'] }).expect(201)).body;
    await friend.agent.post('/api/v2/invitations/accept').send({ token: invite.token }).expect(201);
    await friend.agent.post(`${root}/entities`).send({ kind: 'questions', data: { text: 'No write' } }).expect(403);
  });
  it('allows exactly one concurrent acceptance and rejects expired, revoked and self invitations', async () => {
    const owner = await register(), a = await register(), b = await register(); const root = `/api/v2/spaces/${owner.spaceId}`;
    const invite = async () => (await owner.agent.post(`${root}/invitations`).send({ label: 'Link', scopes: ['questions:read'] }).expect(201)).body;
    const first = await invite();
    await owner.agent.post('/api/v2/invitations/accept').send({ token: first.token }).expect(409);
    const results = await Promise.all([a.agent.post('/api/v2/invitations/accept').send({ token: first.token }), b.agent.post('/api/v2/invitations/accept').send({ token: first.token })]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM v2_grants WHERE space_id=$1', [owner.spaceId])).rows[0].count).toBe(1);
    const second = await invite(); await db.query("UPDATE v2_invitations SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [second.id]);
    await a.agent.post('/api/v2/invitations/accept').send({ token: second.token }).expect(409);
    const third = await invite(); await owner.agent.delete(`${root}/invitations/${third.id}`).expect(200);
    await b.agent.post('/api/v2/invitations/accept').send({ token: third.token }).expect(409);
  });
  it('deletes only owned records and uploaded bytes, revoking sessions and grants', async () => {
    const owner = await register(), friend = await register(); const root = `/api/v2/spaces/${owner.spaceId}`;
    const medicine = { name: 'Recorded medicine', ingredient: 'Ingredient', strength: '', form: 'Tablet', route: 'Oral', instructions: '', times: ['08:00'], days: [0, 1, 2, 3, 4, 5, 6], startDate: '2026-01-01', status: 'active', source: 'Patient-reported' };
    const med = (await owner.agent.post(`${root}/entities`).send({ kind: 'medicines', data: medicine }).expect(201)).body;
    await owner.agent.post(`${root}/entities`).send({ kind: 'intakes', data: { medicineId: med.id, date: '2026-01-01', scheduledTime: '08:00', status: 'unsure', reason: '' } }).expect(201);
    const doc = (await owner.agent.post(`${root}/entities`).send({ kind: 'documents', data: { name: 'record.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64') } }).expect(201)).body;
    const invitation = (await owner.agent.post(`${root}/invitations`).send({ label: 'Read', scopes: ['documents:read'] }).expect(201)).body;
    await friend.agent.post('/api/v2/invitations/accept').send({ token: invitation.token }).expect(201);
    await owner.agent.delete('/api/v2/account').send({ password: 'bad password', confirmation: 'DELETE' }).expect(401);
    await owner.agent.delete('/api/v2/account').send({ password, confirmation: 'no' }).expect(400);
    await owner.agent.delete('/api/v2/account').send({ password, confirmation: 'DELETE' }).expect(200);
    await owner.agent.get('/api/v2/me').expect(401); await friend.agent.get(root).expect(404);
    await friend.agent.get(`/api/v2/spaces/${friend.spaceId}`).expect(200);
    expect((await db.query('SELECT 1 FROM v2_documents WHERE entity_id=$1', [doc.id])).rows).toHaveLength(0);
    for (const table of ['v2_entities', 'v2_audit', 'v2_invitations', 'v2_grants']) expect((await db.query(`SELECT 1 FROM ${table} WHERE space_id=$1`, [owner.spaceId])).rows).toHaveLength(0);
    for (const table of ['v2_sessions', 'v2_recovery_codes']) expect((await db.query(`SELECT 1 FROM ${table} WHERE account_id=$1`, [owner.user.id])).rows).toHaveLength(0);
  });
  it('deleting a companion preserves the owner record and audits the removed grant', async () => {
    const owner = await register(), friend = await register(); const root = `/api/v2/spaces/${owner.spaceId}`;
    const invite = (await owner.agent.post(`${root}/invitations`).send({ label: 'Helper', scopes: ['questions:read', 'questions:write'] }).expect(201)).body;
    await friend.agent.post('/api/v2/invitations/accept').send({ token: invite.token }).expect(201);
    const entry = (await friend.agent.post(`${root}/entities`).send({ kind: 'questions', data: { text: 'Keep the owner record' } }).expect(201)).body;
    await friend.agent.delete('/api/v2/account').send({ password, confirmation: 'DELETE' }).expect(200);
    const kept = (await owner.agent.get(root).expect(200)).body;
    expect(kept.entities.questions.some((e: { id: string }) => e.id === entry.id)).toBe(true); expect(kept.grants).toEqual([]);
    expect(kept.audit.some((e: { action: string }) => e.action === 'grant.account_deleted')).toBe(true);
  });
  it('checks document read scope on every download including after revocation', async () => {
    const owner = await register(), friend = await register(); const root = `/api/v2/spaces/${owner.spaceId}`;
    const doc = (await owner.agent.post(`${root}/entities`).send({ kind: 'documents', data: { name: 'record.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64') } }).expect(201)).body;
    const invite = (await owner.agent.post(`${root}/invitations`).send({ label: 'Documents', scopes: ['documents:read'] }).expect(201)).body;
    const grant = (await friend.agent.post('/api/v2/invitations/accept').send({ token: invite.token }).expect(201)).body;
    await friend.agent.get(`${root}/documents/${doc.id}`).expect(200);
    await friend.agent.put(`${root}/entities/${doc.id}`).send({ version: 1, data: { name: 'forbidden.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.4').toString('base64') } }).expect(403);
    await owner.agent.delete(`${root}/grants/${grant.grantId}`).expect(200);
    await friend.agent.get(`${root}/documents/${doc.id}`).expect(404);
  });
  it('rate limits repeated credential guesses without reflecting secrets', async () => {
    const email = 'rate-limited@example.org'; let last;
    for (let n = 0; n < 11; n++) last = await request(app).post('/api/v2/auth/login').send({ email, password: 'private-guess' });
    expect(last!.status).toBe(429); expect(JSON.stringify(last!.body)).not.toContain('private-guess');
  });
});