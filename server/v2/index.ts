import { Router, type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../db';
import type { Entity, User, MeResponse, RegisterResponse, ExportResponse } from '../../shared/v2';
import { ApiError, idSchema, tokenSchema, registerSchema, loginSchema, changePasswordSchema, recoverSchema, deleteAccountSchema, createEntitySchema, updateEntitySchema, deleteEntitySchema, inviteSchema, acceptSchema, auditQuerySchema, entityPageSchema, validateData, validateJsonStructure } from './validation';
import { COOKIE, SESSION_MS, hashToken, newToken, hashPassword, verifyPassword, setSessionCookie, clearSessionCookie } from './security';
import { initializeV2, spacesFor, accessSpace, snapshot, auditFor, writeEntity, writePermission, entityColumns, entityOut, iso } from './storage';
import { createKnowledgeRouter } from './providers';
import { createAiRouter } from './ai/routes';
import { createPublicSharingRouter, createAccountSharingRouter, describeDevice } from './sharing';

type Credential = User & { password_hash: string; auth_version: number };
const badCredentials = () => new ApiError(401, 'INVALID_CREDENTIALS', 'The supplied credentials are not valid.');
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Record not found.');

/** Mount at /api/v2 AFTER JSON/cookies/origin checks and BEFORE legacy authentication. */
export async function createV2Router(db: Database, options = { initializeSchema: true }): Promise<Router> {
  if (options.initializeSchema) await initializeV2(db);
  const router = Router();
  const dummyPassword = await hashPassword(newToken());
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); validateJsonStructure(req.body); next(); });
  const authLimiter = rateLimit({ windowMs: 15 * 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many authentication attempts. Try again later.', code: 'RATE_LIMITED' } });
  const credentialLimiter = rateLimit({ windowMs: 15 * 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: req => hashToken(typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : 'invalid-email'),
    message: { error: 'Too many attempts for this account. Try again later.', code: 'RATE_LIMITED' } });
  router.use('/auth', authLimiter);
  const me = async (user: User): Promise<MeResponse> => {
    const spaces = await spacesFor(db, user.id); return { user, spaces, spaceId: spaces[0]?.id ?? null };
  };
  const credentials = async (email: string) => (await db.query<Credential>('SELECT id,name,email,password_hash,auth_version FROM v2_accounts WHERE email=$1', [email])).rows[0];

  router.post('/auth/register', credentialLimiter, async (req, res) => {
    const body = registerSchema.parse(req.body);
    const id = randomUUID(), spaceId = randomUUID(), token = newToken(), sessionId = randomUUID();
    const password = await hashPassword(body.password);
    const recoveryCodes = Array.from({ length: 8 }, newToken);
    // One SQL statement: account, blank space, recovery codes, session and audit all commit or roll back.
    const { rows } = await db.query<User>(`WITH account AS (
      INSERT INTO v2_accounts(id,name,email,password_hash) VALUES($1,$2,$3,$4) RETURNING id,name,email
    ), space AS (
      INSERT INTO v2_spaces(id,owner_id,name) SELECT $5,id,'My health space' FROM account RETURNING id,owner_id
    ), session AS (
      INSERT INTO v2_sessions(token_hash,account_id,expires_at,id,device) SELECT $6,id,$7,$9,$10 FROM account
    ), recovery AS (
      INSERT INTO v2_recovery_codes(token_hash,account_id) SELECT unnest($8::text[]),id FROM account
    ), audit AS (
      INSERT INTO v2_audit(space_id,actor_id,action) SELECT id,owner_id,'space.created' FROM space
    ) SELECT * FROM account`, [id, body.name, body.email, password, spaceId, hashToken(token), new Date(Date.now() + SESSION_MS), recoveryCodes.map(hashToken), sessionId, describeDevice(req)]);
    setSessionCookie(res, token);
    const response: RegisterResponse = { ...await me(rows[0]), recoveryCodes };
    res.status(201).json(response);
  });
  router.post('/auth/login', credentialLimiter, async (req, res) => {
    const body = loginSchema.parse(req.body);
    const account = await credentials(body.email);
    const valid = await verifyPassword(body.password, account?.password_hash ?? dummyPassword);
    if (!account || !valid) throw badCredentials();
    const token = newToken(), sessionId = randomUUID();
    const oldToken: unknown = req.cookies?.[COOKIE];
    const { rows } = await db.query<{ account_id: string }>(`WITH expired AS (DELETE FROM v2_sessions WHERE account_id=$1 AND (expires_at<=NOW() OR auth_version<>$5)),
      rotated AS (DELETE FROM v2_sessions WHERE token_hash=$6),
      candidate AS (SELECT id,auth_version FROM v2_accounts WHERE id=$1 AND password_hash=$4 AND auth_version=$5 FOR SHARE)
      INSERT INTO v2_sessions(token_hash,account_id,expires_at,auth_version,id,device) SELECT $2,id,$3,auth_version,$7,$8 FROM candidate RETURNING account_id`, [account.id, hashToken(token), new Date(Date.now() + SESSION_MS), account.password_hash, account.auth_version, typeof oldToken === 'string' ? hashToken(oldToken) : '', sessionId, describeDevice(req)]);
    if (!rows[0]) throw badCredentials();
    setSessionCookie(res, token);
    res.json(await me({ id: account.id, name: account.name, email: account.email }));
  });
  router.post('/auth/recover', credentialLimiter, async (req, res) => {
    const body = recoverSchema.parse(req.body);
    const nextPassword = await hashPassword(body.newPassword);
    // Row lock serializes recovery with password changes; consuming a code and rotating credentials are atomic.
    const { rows } = await db.query<{ id: string }>(`WITH account AS (
      SELECT id FROM v2_accounts WHERE email=$1 FOR UPDATE
    ), code AS (
      UPDATE v2_recovery_codes SET used_at=NOW() WHERE token_hash=$2 AND used_at IS NULL AND account_id IN (SELECT id FROM account) RETURNING account_id
    ), changed AS (
      UPDATE v2_accounts SET password_hash=$3,auth_version=auth_version+1 WHERE id IN (SELECT account_id FROM code) RETURNING id
    ), sessions AS (DELETE FROM v2_sessions WHERE account_id IN (SELECT id FROM changed)),
    audit AS (INSERT INTO v2_audit(space_id,actor_id,action) SELECT s.id,s.owner_id,'account.recovered' FROM v2_spaces s JOIN changed c ON c.id=s.owner_id)
    SELECT id FROM changed`, [body.email, hashToken(body.recoveryCode), nextPassword]);
    if (!rows[0]) throw badCredentials();
    clearSessionCookie(res); res.json({ ok: true });
  });
  router.use(createPublicSharingRouter(db, me));

  router.use(async (req, res, next) => {
    const token: unknown = req.cookies?.[COOKIE];
    if (!tokenSchema.safeParse(token).success) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const key = hashToken(token as string);
    const { rows } = await db.query<User>(`SELECT a.id,a.name,a.email FROM v2_sessions s JOIN v2_accounts a ON a.id=s.account_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW() AND s.auth_version=a.auth_version`, [key]);
    if (!rows[0]) throw new ApiError(401, 'UNAUTHENTICATED', 'This session has expired or been revoked. Sign in again.');
    res.locals.user = rows[0]; res.locals.sessionKey = key; next();
  });
  router.get('/me', async (_req, res) => { res.json(await me(res.locals.user as User)); });
  router.get('/auth/sessions', async (_req, res) => {
    const user = res.locals.user as User;
    await db.query('DELETE FROM v2_sessions WHERE account_id=$1 AND expires_at<=NOW()', [user.id]);
    const { rows } = await db.query<{ id: string; device: string; createdAt: string; expiresAt: string; current: boolean }>(`SELECT id,device,created_at AS "createdAt",expires_at AS "expiresAt",token_hash=$2 AS current
      FROM v2_sessions WHERE account_id=$1 AND auth_version=(SELECT auth_version FROM v2_accounts WHERE id=$1) ORDER BY created_at,id`, [user.id, res.locals.sessionKey]);
    res.json({ sessions: rows.map(row => ({ id: row.id, device: row.device, createdAt: iso(row.createdAt), expiresAt: iso(row.expiresAt), current: Boolean(row.current) })) });
  });
  router.delete('/auth/sessions/:sessionId', async (req, res) => {
    const sessionId = idSchema.parse(req.params.sessionId), user = res.locals.user as User;
    const { rows } = await db.query<{ token_hash: string }>('DELETE FROM v2_sessions WHERE id=$1 AND account_id=$2 RETURNING token_hash', [sessionId, user.id]);
    if (!rows[0]) throw notFound();
    const current = rows[0].token_hash === res.locals.sessionKey;
    if (current) clearSessionCookie(res);
    res.json({ ok: true, current });
  });
  router.post('/auth/sessions/revoke-others', async (_req, res) => {
    const user = res.locals.user as User;
    const { rows } = await db.query<{ id: string }>('DELETE FROM v2_sessions WHERE account_id=$1 AND token_hash<>$2 RETURNING id', [user.id, res.locals.sessionKey]);
    res.json({ ok: true, revoked: rows.length });
  });
  router.use(createAiRouter(db));
  router.post('/auth/logout', async (_req, res) => {
    await db.query('DELETE FROM v2_sessions WHERE token_hash=$1', [res.locals.sessionKey]);
    clearSessionCookie(res); res.json({ ok: true });
  });
  router.post('/auth/password', async (req, res) => {
    const body = changePasswordSchema.parse(req.body), user = res.locals.user as User;
    const account = await credentials(user.email);
    if (!account || !await verifyPassword(body.currentPassword, account.password_hash)) throw badCredentials();
    const password = await hashPassword(body.newPassword);
    const { rows } = await db.query<{ id: string }>(`WITH changed AS (
      UPDATE v2_accounts SET password_hash=$2,auth_version=auth_version+1 WHERE id=$1 AND password_hash=$3 AND auth_version=$4 RETURNING id
    ), sessions AS (DELETE FROM v2_sessions WHERE account_id IN (SELECT id FROM changed)),
    audit AS (INSERT INTO v2_audit(space_id,actor_id,action) SELECT s.id,s.owner_id,'account.password_changed' FROM v2_spaces s JOIN changed c ON c.id=s.owner_id)
    SELECT id FROM changed`, [user.id, password, account.password_hash, account.auth_version]);
    if (!rows[0]) throw badCredentials();
    clearSessionCookie(res); res.json({ ok: true });
  });
  router.delete('/account', authLimiter, async (req, res) => {
    const body = deleteAccountSchema.parse(req.body), user = res.locals.user as User;
    const account = await credentials(user.email);
    if (!account || !await verifyPassword(body.password, account.password_hash)) throw badCredentials();
    const { rows } = await db.query<{ id: string }>(`WITH deleted AS (
      DELETE FROM v2_accounts WHERE id=$1 AND password_hash=$2 AND auth_version=$3 RETURNING id
    ), audit AS (
      INSERT INTO v2_audit(space_id,actor_id,action,entity_id)
      SELECT g.space_id,d.id,'grant.account_deleted',g.id FROM v2_grants g JOIN deleted d ON d.id=g.account_id
      JOIN v2_spaces s ON s.id=g.space_id WHERE s.owner_id<>d.id
    ) SELECT id FROM deleted`, [user.id, account.password_hash, account.auth_version]);
    if (!rows[0]) throw badCredentials();
    clearSessionCookie(res); res.json({ ok: true });
  });

  // Independent per-account budgets: reads do not consume the mutation budget, and
  // rotating space IDs does not bypass it. Authentication/provider budgets stay separate.
  const spaceLimit = (limit: number) => rateLimit({ windowMs: 60000, limit,
    keyGenerator: (_req, res) => (res.locals.user as User).id,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many record requests. Try again shortly.', code: 'RATE_LIMITED' } });
  const readLimit = spaceLimit(240), writeLimit = spaceLimit(120);
  router.use('/spaces', (req, res, next) => (['GET', 'HEAD'].includes(req.method) ? readLimit : writeLimit)(req, res, next));

  router.get('/spaces/:spaceId', async (req, res) => {
    res.json(await snapshot(db, res.locals.user, idSchema.parse(req.params.spaceId)));
  });
  router.get('/spaces/:spaceId/entities', async (req, res) => {
    const id = idSchema.parse(req.params.spaceId), query = entityPageSchema.parse(req.query), user = res.locals.user as User;
    await accessSpace(db, user.id, id, `${query.kind}:read`);
    const limit = query.limit ?? 50;
    if (query.before) {
      const cursor = (await db.query('SELECT 1 FROM v2_entities WHERE space_id=$1 AND id=$2 AND kind=$3', [id, query.before, query.kind])).rows[0];
      if (!cursor) throw new ApiError(400, 'VALIDATION_ERROR', 'That page cursor is not in this collection.');
    }
    const { rows } = await db.query<Entity>(`SELECT ${entityColumns} FROM v2_entities WHERE space_id=$1 AND kind=$2
      AND ($3::uuid IS NULL OR (created_at, id) < (SELECT created_at, id FROM v2_entities WHERE space_id=$1 AND id=$3 AND kind=$2))
      ORDER BY created_at DESC, id DESC LIMIT $4`, [id, query.kind, query.before ?? null, limit + 1]);
    const page = rows.slice(0, limit).map(entityOut);
    res.json({ entities: page, nextBefore: rows.length > limit ? page.at(-1)!.id : null });
  });
  router.get('/spaces/:spaceId/export', async (req, res) => {
    const id = idSchema.parse(req.params.spaceId), user = res.locals.user as User;
    await accessSpace(db, user.id, id, 'owner');
    const response: ExportResponse = { ...await snapshot(db, user, id), exportedAt: new Date().toISOString(), format: 'diabeatit-v2', notice: 'Patient-reported records and coordination notes, not clinical clearance. Document metadata only; download files separately. Audit contains the latest 500 events; use the audit endpoint for earlier events.' };
    res.attachment('diabeatit-records.json').json(response);
  });
  router.get('/spaces/:spaceId/audit', async (req, res) => {
    const id = idSchema.parse(req.params.spaceId);
    const { before } = auditQuerySchema.parse(req.query);
    await accessSpace(db, res.locals.user.id, id, 'owner');
    const audit = await auditFor(db, id, before);
    res.json({ audit, nextBefore: audit.length === 500 ? audit.at(-1)!.id : null });
  });
  router.post('/spaces/:spaceId/entities', async (req, res) => {
    const id = idSchema.parse(req.params.spaceId), body = createEntitySchema.parse(req.body), user = res.locals.user as User;
    const space = await accessSpace(db, user.id, id, `${body.kind}:write`);
    const { data, blob } = validateData(body.kind, body.data);
    res.status(201).json(await writeEntity(db, user, space, body.kind, randomUUID(), data, blob));
  });
  router.put('/spaces/:spaceId/entities/:entityId', async (req, res) => {
    const id = idSchema.parse(req.params.spaceId), entityId = idSchema.parse(req.params.entityId), user = res.locals.user as User;
    const body = updateEntitySchema.parse(req.body);
    const space = await accessSpace(db, user.id, id);
    const existing = (await db.query<Pick<Entity, 'kind'>>('SELECT kind FROM v2_entities WHERE space_id=$1 AND id=$2', [id, entityId])).rows[0];
    if (!existing) throw notFound();
    await accessSpace(db, user.id, id, `${existing.kind}:write`);
    const { data, blob } = validateData(existing.kind, body.data);
    res.json(await writeEntity(db, user, space, existing.kind, entityId, data, blob, body.version));
  });
  router.delete('/spaces/:spaceId/entities/:entityId', async (req, res) => {
    const id = idSchema.parse(req.params.spaceId), entityId = idSchema.parse(req.params.entityId), user = res.locals.user as User;
    const { version } = deleteEntitySchema.parse(req.body);
    await accessSpace(db, user.id, id);
    const existing = (await db.query<Pick<Entity, 'kind'>>('SELECT kind FROM v2_entities WHERE space_id=$1 AND id=$2', [id, entityId])).rows[0];
    if (!existing) throw notFound();
    await accessSpace(db, user.id, id, `${existing.kind}:write`);
    const { rows } = await db.query<{ id: string }>(`WITH changed AS (
      DELETE FROM v2_entities WHERE id=$1 AND space_id=$2 AND version=$5 AND ${writePermission} RETURNING id,space_id,version
    ), audit AS (INSERT INTO v2_audit(space_id,actor_id,action,entity_id,version) SELECT space_id,$3,'entity.deleted',id,version FROM changed)
    SELECT id FROM changed`, [entityId, id, user.id, `${existing.kind}:write`, version]);
    if (!rows[0]) throw new ApiError(409, 'CONFLICT', 'The record or permission changed. Refresh before trying again.');
    res.json({ ok: true });
  });
  router.get('/spaces/:spaceId/documents/:docid', async (req, res) => {
    const id = idSchema.parse(req.params.spaceId), docId = idSchema.parse(req.params.docid);
    await accessSpace(db, res.locals.user.id, id, 'documents:read');
    const doc = (await db.query<{ mime: string; base64: string }>(`SELECT e.data->>'mime' AS mime,d.base64 FROM v2_entities e JOIN v2_documents d ON d.entity_id=e.id WHERE e.space_id=$1 AND e.id=$2 AND e.kind='documents'`, [id, docId])).rows[0];
    if (!doc) throw notFound();
    const ext = doc.mime === 'application/pdf' ? 'pdf' : doc.mime === 'image/png' ? 'png' : 'jpg';
    res.set({ 'Content-Disposition': `attachment; filename="document.${ext}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" });
    res.type(doc.mime).send(Buffer.from(doc.base64, 'base64'));
  });
  router.post('/spaces/:spaceId/invitations', async (req, res) => {
    const spaceId = idSchema.parse(req.params.spaceId), user = res.locals.user as User, body = inviteSchema.parse(req.body);
    await accessSpace(db, user.id, spaceId, 'owner');
    const token = newToken(), id = randomUUID(), expiresAt = new Date(Date.now() + 48 * 3600000).toISOString();
    const { rows } = await db.query<{ id: string }>(`WITH invite AS (
      INSERT INTO v2_invitations(id,space_id,token_hash,label,scopes,expires_at) SELECT $1,id,$3,$4,$5,$6 FROM v2_spaces WHERE id=$2 AND owner_id=$7 RETURNING id,space_id
    ), audit AS (INSERT INTO v2_audit(space_id,actor_id,action,entity_id) SELECT space_id,$7,'invitation.created',id FROM invite)
    SELECT id FROM invite`, [id, spaceId, hashToken(token), body.label, body.scopes, expiresAt, user.id]);
    if (!rows[0]) throw notFound();
    res.status(201).json({ id, token, expiresAt });
  });
  router.post('/invitations/accept', rateLimit({ windowMs: 60000, limit: 30, message: { error: 'Too many invitation attempts.', code: 'RATE_LIMITED' } }), async (req, res) => {
    const { token } = acceptSchema.parse(req.body), user = res.locals.user as User;
    const { rows } = await db.query<{ spaceId: string; grantId: string }>(`WITH accepted AS (
      UPDATE v2_invitations i SET consumed_at=NOW() FROM v2_spaces s
      WHERE i.space_id=s.id AND i.token_hash=$1 AND i.consumed_at IS NULL AND i.expires_at>NOW() AND s.owner_id<>$2
        AND NOT EXISTS(SELECT 1 FROM v2_grants g WHERE g.space_id=i.space_id AND g.account_id=$2)
      RETURNING i.space_id,i.label,i.scopes
    ), grant_row AS (
      INSERT INTO v2_grants(id,space_id,account_id,label,scopes) SELECT $3,space_id,$2,label,scopes FROM accepted RETURNING id,space_id
    ), audit AS (INSERT INTO v2_audit(space_id,actor_id,action,entity_id) SELECT space_id,$2,'invitation.accepted',id FROM grant_row)
    SELECT space_id AS "spaceId",id AS "grantId" FROM grant_row`, [hashToken(token), user.id, randomUUID()]);
    if (!rows[0]) throw new ApiError(409, 'INVITATION_UNAVAILABLE', 'Invitation is expired, used, revoked, or not applicable to this account.');
    res.status(201).json(rows[0]);
  });
  for (const resource of ['grants', 'invitations'] as const) {
    router.delete(`/spaces/:spaceId/${resource}/:recordId`, async (req, res) => {
      const id = idSchema.parse(req.params.spaceId), recordId = idSchema.parse(req.params.recordId), user = res.locals.user as User;
      await accessSpace(db, user.id, id, 'owner');
      const { rows } = await db.query<{ id: string }>(`WITH revoked AS (
        DELETE FROM v2_${resource} r WHERE r.id=$1 AND r.space_id=$2 ${resource === 'invitations' ? 'AND r.consumed_at IS NULL' : ''}
        AND EXISTS(SELECT 1 FROM v2_spaces WHERE id=$2 AND owner_id=$3) RETURNING id,space_id
      ), audit AS (INSERT INTO v2_audit(space_id,actor_id,action,entity_id) SELECT space_id,$3,'${resource === 'grants' ? 'grant' : 'invitation'}.revoked',id FROM revoked)
      SELECT id FROM revoked`, [recordId, id, user.id]);
      if (!rows[0]) throw notFound();
      res.json({ ok: true });
    });
  }
  router.use(createAccountSharingRouter(db));
  router.use(createKnowledgeRouter());
  router.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.', code: 'NOT_FOUND' }));
  const errors: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
    if (err instanceof ApiError) { res.status(err.status).json({ error: err.message, code: err.code }); return; }
    // Never reflect submitted values or database constraint detail (may contain secrets).
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid request. Check required fields, supported values, and formats.', code: 'VALIDATION_ERROR' }); return; }
    const code = (err as { code?: string })?.code;
    if (code === '23505') { res.status(409).json({ error: 'This account or record already exists.', code: 'CONFLICT' }); return; }
    if (code === '40001' || code === '40P01') { res.status(409).json({ error: 'A concurrent change prevented this request. Refresh and try again.', code: 'CONFLICT' }); return; }
    if (code === '23503') { res.status(409).json({ error: 'A referenced record is missing, belongs to another space, or is still in use.', code: 'REFERENCE_CONFLICT' }); return; }
    if (code === '23514' || code === '22P02') { res.status(400).json({ error: 'Record violates a storage constraint.', code: 'VALIDATION_ERROR' }); return; }
    res.status(500).json({ error: 'The request could not be completed.', code: 'INTERNAL_ERROR' });
  };
  router.use(errors);
  return router;
}

export default createV2Router;