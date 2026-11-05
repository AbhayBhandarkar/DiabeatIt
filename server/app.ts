import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { DomainError, reduceState, visibleState, actionSchema, type Role } from '../shared/domain';
import { foods, lessons } from '../shared/content';
import { seed } from '../shared/seed';
import type { Database, SessionRow } from './db';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export function createApp(db: Database, accountRouter?: express.Router) {
  const app = express(); app.disable('x-powered-by');
  // Hosted behind one reverse proxy (Render); needed so rate limits key on the client address.
  if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"], fontSrc: ["'self'"], objectSrc: ["'none'"], upgradeInsecureRequests: null } }, crossOriginEmbedderPolicy: false }));
  app.use('/api', rateLimit({ windowMs: 60000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests. Please try again in a minute.' } }));
  app.use(express.json({ limit: '3mb' })); app.use(cookieParser());
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const allowed = process.env.APP_ORIGIN || 'http://127.0.0.1:5173';
      const origin = req.get('origin');
      const localAllowed = process.env.NODE_ENV !== 'production' && origin === 'http://127.0.0.1:3001';
      if ((origin && origin !== allowed && !localAllowed) || req.get('x-diabeatit-client') !== 'web') return res.status(403).json({ error: 'Request origin or client header rejected.' });
    }
    next();
  });
  if (accountRouter) app.use('/api/v2', accountRouter);
  app.get('/api/health', async (_req, res) => { await db.query('SELECT 1'); res.json({ status: 'ok', mode: accountRouter ? 'account-workspaces' : 'legacy-test', clinicalScreening: false, realPatientUse: false }); });
  if (accountRouter) app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.post('/api/demo', rateLimit({ windowMs: 60000, limit: 30, message: { error: 'Too many demo starts from this connection. Please try again in a minute.' } }), async (_req, res) => {
    if (process.env.DEMO_ENABLED === 'false') return res.status(503).json({ error: 'Demo sessions are disabled. Real-patient operation is not available.' });
    const token = randomBytes(32).toString('hex');
    await db.query('DELETE FROM demo_sessions WHERE expires_at < NOW()');
    await db.query('INSERT INTO demo_sessions(token_hash, state, expires_at) VALUES ($1, $2, $3)', [hash(token), JSON.stringify(seed()), new Date(Date.now() + 7 * 86400000).toISOString()]);
    res.cookie('diabeatit_session', token, { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true', sameSite: 'strict', maxAge: 7 * 86400000, path: '/' });
    res.status(201).json({ ok: true });
  });
  app.use('/api', async (req, res, next) => {
    const token: unknown = req.cookies.diabeatit_session;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return res.status(401).json({ error: 'Start a fictional demo to continue.' });
    const key = hash(token);
    const { rows } = await db.query<SessionRow>('SELECT state, version, role FROM demo_sessions WHERE token_hash=$1 AND expires_at>NOW()', [key]);
    if (!rows[0]) return res.status(401).json({ error: 'This demo session expired. Start a new one.' });
    res.locals.session = rows[0]; res.locals.key = key; next();
  });
  app.get('/api/state', (_req, res) => {
    const { state, version, role } = res.locals.session as SessionRow;
    const visible = visibleState(state, role);
    // Documents are fetched separately after authorization; do not send binary content in state.
    visible.documents = visible.documents.map(d => ({ ...d, data: '' }));
    res.json({ state: visible, version, role });
  });
  app.post('/api/role', async (req, res) => {
    const role = z.enum(['patient', 'companion', 'professional']).parse(req.body.role);
    const session = res.locals.session as SessionRow;
    if (role === 'companion' && !session.state.permissions.active) throw new DomainError('Companion access has been revoked.', 403);
    // Explicitly demo-only role simulation, never real identity or professional verification.
    await db.query('UPDATE demo_sessions SET role=$1, version=version+1 WHERE token_hash=$2', [role, res.locals.key]);
    res.json({ ok: true });
  });
  app.post('/api/actions', async (req, res) => {
    const { state, version, role } = res.locals.session as SessionRow;
    const expected = z.number().int().positive().parse(req.body.version);
    if (expected !== version) throw new DomainError('A newer update is available. Refresh and try again; your change was not saved.', 409);
    if (state.audit.length >= 2000) throw new DomainError('This demo has reached its event limit. Export it and reset to continue.');
    const action = actionSchema.parse(req.body.action);
    if (action.type === 'meal.add' && !foods.some(f => f.id === action.foodId)) throw new DomainError('Choose a food in the curated demo catalog.');
    if (action.type === 'lesson.complete' && !lessons.some(l => l.id === action.id)) throw new DomainError('Lesson not found.');
    if (action.type === 'document.add') {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(action.data)) throw new DomainError('Invalid document encoding.');
      const bytes = Buffer.from(action.data, 'base64');
      if (bytes.length > 2 * 1024 * 1024) throw new DomainError('Use a file smaller than 2 MB.');
      const valid = action.mime === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : action.mime === 'image/png' ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' : bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
      if (!valid) throw new DomainError('The file contents do not match the selected PDF, PNG, or JPEG format.');
    }
    const next = reduceState(state, role, action);
    const result = await db.query<{ version: number }>('UPDATE demo_sessions SET state=$1, version=version+1 WHERE token_hash=$2 AND version=$3 RETURNING version', [JSON.stringify(next), res.locals.key, version]);
    if (!result.rows.length) throw new DomainError('Another update arrived. Refresh and try again.', 409);
    res.json({ ok: true, version: result.rows[0].version });
  });
  app.get('/api/documents/:id', (req, res) => {
    const session = res.locals.session as SessionRow;
    const s = visibleState(session.state, session.role); const d = s.documents.find(d => d.id === req.params.id);
    if (!d) throw new DomainError('Document not found or not shared.', 404);
    res.set('Content-Disposition', `attachment; filename="document.${d.mime === 'application/pdf' ? 'pdf' : d.mime === 'image/png' ? 'png' : 'jpg'}"`);
    res.type(d.mime).send(Buffer.from(d.data, 'base64'));
  });
  app.get('/api/export', (_req, res) => {
    const session = res.locals.session as SessionRow;
    if (session.role !== 'patient') throw new DomainError('Only the patient can export the full record.', 403);
    res.attachment('diabeatit-fictional-record.json').json({ mode: 'Fictional demo — not medical advice', exportedAt: new Date().toISOString(), ...session.state });
  });
  app.post('/api/reset', async (_req, res) => {
    if ((res.locals.session as SessionRow).role !== 'patient') throw new DomainError('Only the patient can reset the demo.', 403);
    await db.query('UPDATE demo_sessions SET state=$1, version=version+1 WHERE token_hash=$2', [JSON.stringify(seed()), res.locals.key]); res.json({ ok: true });
  });
  app.delete('/api/session', async (_req, res) => {
    if ((res.locals.session as SessionRow).role !== 'patient') throw new DomainError('Only the patient can delete this demo.', 403);
    await db.query('DELETE FROM demo_sessions WHERE token_hash=$1', [res.locals.key]); res.clearCookie('diabeatit_session', { path: '/' }); res.json({ ok: true });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use(express.static(path.resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
    if (err instanceof DomainError) return res.status(err.status).json({ error: err.message });
    const e = err as { status?: number; type?: string };
    if (e.status === 413) return res.status(413).json({ error: 'Upload too large. Maximum document size is 2 MB.' });
    if (e.status === 400) return res.status(400).json({ error: 'Invalid request body.' });
    console.error('Request failed:', err instanceof Error ? err.name : 'UnknownError');
    res.status(500).json({ error: 'The server could not save this change. Please try again.' });
  });
  return app;
}