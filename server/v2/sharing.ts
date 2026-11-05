/**
 * Two sharing flows that start from a phone the patient is already signed in on:
 *  - Device sign-in: a desktop shows a QR code; the signed-in phone scans it and approves by number matching.
 *  - Clinician links: a read-only, time-limited timeline view a doctor opens without an account.
 */
import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../db';
import type { ClinicianLink, ClinicianLinkCreated, ClinicianView, MeResponse, QrDetails, QrPollResponse, QrStartResponse, User } from '../../shared/v2';
import { ApiError, dateSchema, idSchema, tokenSchema } from './validation';
import { SESSION_MS, hashToken, newToken, setSessionCookie } from './security';
import { accessSpace, iso } from './storage';
import { loadCollections, summarise, summaryKinds } from './ai/routes';

const QR_MS = 2 * 60000;
const limiter = (limit: number, message: string) => rateLimit({ windowMs: 60000, limit, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: message, code: 'RATE_LIMITED' } });

export function describeDevice(req: Request): string {
  const ua = req.get('user-agent') ?? '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'A browser';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'an unknown system';
  return `${browser} on ${os}`;
}

/** Routes that must work before sign-in. Mount BEFORE the session middleware. */
export function createPublicSharingRouter(db: Database, me: (user: User) => Promise<MeResponse>) {
  const router = Router();
  router.post('/device-login/start', limiter(10, 'Too many sign-in codes requested. Wait a minute.'), async (req, res) => {
    await db.query(`DELETE FROM v2_qr_logins WHERE expires_at < NOW() - INTERVAL '10 minutes'`);
    const id = randomUUID(), secret = newToken(), match = String(randomInt(10, 100)), expiresAt = new Date(Date.now() + QR_MS);
    await db.query('INSERT INTO v2_qr_logins(id,secret_hash,match,device,expires_at) VALUES($1,$2,$3,$4,$5)', [id, hashToken(secret), match, describeDevice(req), expiresAt]);
    const body: QrStartResponse = { id, secret, match, expiresAt: expiresAt.toISOString() };
    res.status(201).json(body);
  });
  router.post('/device-login/poll', limiter(90, 'Too many checks. Wait a minute.'), async (req, res) => {
    const { id, secret } = z.object({ id: idSchema, secret: tokenSchema }).strict().parse(req.body);
    const row = (await db.query<{ approved_by: string | null; denied: boolean; consumed_at: string | null; expires_at: string }>('SELECT approved_by,denied,consumed_at,expires_at FROM v2_qr_logins WHERE id=$1 AND secret_hash=$2', [id, hashToken(secret)])).rows[0];
    let body: QrPollResponse = { status: 'expired' };
    if (row?.denied) body = { status: 'denied' };
    else if (row && !row.consumed_at && Date.parse(iso(row.expires_at)) > Date.now()) {
      if (!row.approved_by) body = { status: 'pending' };
      else {
        const token = newToken();
        // Consume once and create the desktop session in the same statement.
        const { rows } = await db.query<User>(`WITH used AS (
          UPDATE v2_qr_logins SET consumed_at=NOW() WHERE id=$1 AND secret_hash=$2 AND consumed_at IS NULL AND approved_by IS NOT NULL AND NOT denied AND expires_at>NOW() RETURNING approved_by
        ), session AS (
          INSERT INTO v2_sessions(token_hash,account_id,expires_at,auth_version) SELECT $3,a.id,$4,a.auth_version FROM v2_accounts a JOIN used u ON u.approved_by=a.id
        ) SELECT a.id,a.name,a.email FROM v2_accounts a JOIN used u ON u.approved_by=a.id`, [id, hashToken(secret), hashToken(token), new Date(Date.now() + SESSION_MS)]);
        if (rows[0]) { setSessionCookie(res, token); body = { status: 'approved', me: await me(rows[0]) }; }
      }
    }
    res.json(body);
  });

  const viewLimit = limiter(30, 'Too many views from this connection. Wait a minute.');
  async function link(token: unknown) {
    const parsed = tokenSchema.safeParse(token);
    const row = parsed.success ? (await db.query<{ id: string; space_id: string; label: string; from_date: string | Date; expires_at: string; owner: string }>(`SELECT l.id,l.space_id,l.label,l.from_date,l.expires_at,a.name AS owner FROM v2_clinician_links l JOIN v2_spaces s ON s.id=l.space_id JOIN v2_accounts a ON a.id=s.owner_id WHERE l.token_hash=$1 AND l.expires_at>NOW()`, [hashToken(parsed.data)])).rows[0] : undefined;
    if (!row) throw new ApiError(404, 'LINK_UNAVAILABLE', 'This shared record has expired or was withdrawn by the patient.');
    return { ...row, fromDate: typeof row.from_date === 'string' ? row.from_date.slice(0, 10) : iso(row.from_date).slice(0, 10) };
  }
  router.post('/clinician/view', viewLimit, async (req, res) => {
    const l = await link(req.body?.token);
    const entities = await loadCollections(db, l.space_id, summaryKinds);
    await db.query(`WITH seen AS (UPDATE v2_clinician_links SET last_viewed_at=NOW() WHERE id=$1 RETURNING id,space_id) INSERT INTO v2_audit(space_id,actor_id,action,entity_id) SELECT space_id,id,'clinician_link.viewed',id FROM seen`, [l.id]);
    const body: ClinicianView = { patientName: l.owner, label: l.label, fromDate: l.fromDate, expiresAt: iso(l.expires_at), generatedAt: new Date().toISOString(), entities };
    res.json(body);
  });
  router.post('/clinician/summary', limiter(6, 'Please wait a minute before generating another summary.'), async (req, res) => {
    const l = await link(req.body?.token);
    res.json({ ...await summarise(await loadCollections(db, l.space_id, summaryKinds), l.fromDate, 'clinician'), fromDate: l.fromDate, generatedAt: new Date().toISOString() });
  });
  return router;
}

const createLink = z.object({ label: z.string().trim().min(1).max(100), days: z.number().int().min(1).max(30), fromDate: dateSchema }).strict();
const linkOut = (r: { id: string; label: string; from_date: string | Date; expires_at: string; created_at: string; last_viewed_at: string | null }): ClinicianLink => ({ id: r.id, label: r.label, fromDate: typeof r.from_date === 'string' ? r.from_date.slice(0, 10) : iso(r.from_date).slice(0, 10), expiresAt: iso(r.expires_at), createdAt: iso(r.created_at), lastViewedAt: r.last_viewed_at ? iso(r.last_viewed_at) : null });

/** Routes for a signed-in account. Mount AFTER the session middleware. */
export function createAccountSharingRouter(db: Database) {
  const router = Router();
  router.get('/device-login/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const row = (await db.query<{ device: string; match: string; created_at: string; expires_at: string }>('SELECT device,match,created_at,expires_at FROM v2_qr_logins WHERE id=$1 AND approved_by IS NULL AND NOT denied AND consumed_at IS NULL AND expires_at>NOW()', [id])).rows[0];
    if (!row) throw new ApiError(404, 'CODE_EXPIRED', 'This sign-in code has expired. Ask the computer for a new one.');
    const choices = new Set([row.match]);
    while (choices.size < 3) choices.add(String(randomInt(10, 100)));
    const body: QrDetails = { id, device: row.device, createdAt: iso(row.created_at), expiresAt: iso(row.expires_at), choices: [...choices].sort(() => randomInt(3) - 1) };
    res.json(body);
  });
  router.post('/device-login/:id/approve', limiter(10, 'Too many approvals. Wait a minute.'), async (req, res) => {
    const id = idSchema.parse(req.params.id), user = res.locals.user as User;
    const { match } = z.object({ match: z.string().regex(/^\d{2}$/) }).strict().parse(req.body);
    const { rows } = await db.query<{ ok: boolean }>(`UPDATE v2_qr_logins SET approved_by=CASE WHEN match=$3 THEN $2::uuid END, denied=(match<>$3)
      WHERE id=$1 AND approved_by IS NULL AND NOT denied AND consumed_at IS NULL AND expires_at>NOW() RETURNING (match=$3) AS ok`, [id, user.id, match]);
    if (!rows[0]) throw new ApiError(404, 'CODE_EXPIRED', 'This sign-in code has expired. Ask the computer for a new one.');
    if (!rows[0].ok) throw new ApiError(409, 'MATCH_FAILED', 'That number did not match, so the sign-in was blocked. Start again on the computer.');
    await db.query(`INSERT INTO v2_audit(space_id,actor_id,action,entity_id) SELECT id,$1,'device.signed_in',$2 FROM v2_spaces WHERE owner_id=$1`, [user.id, id]);
    res.json({ ok: true });
  });
  router.post('/device-login/:id/deny', async (req, res) => {
    await db.query('UPDATE v2_qr_logins SET denied=TRUE WHERE id=$1 AND approved_by IS NULL', [idSchema.parse(req.params.id)]);
    res.json({ ok: true });
  });

  router.get('/spaces/:spaceId/clinician-links', async (req, res) => {
    const spaceId = idSchema.parse(req.params.spaceId);
    await accessSpace(db, (res.locals.user as User).id, spaceId, 'owner');
    const { rows } = await db.query<Parameters<typeof linkOut>[0]>('SELECT id,label,from_date,expires_at,created_at,last_viewed_at FROM v2_clinician_links WHERE space_id=$1 AND expires_at>NOW() ORDER BY created_at DESC', [spaceId]);
    res.json({ links: rows.map(linkOut) });
  });
  router.post('/spaces/:spaceId/clinician-links', async (req, res) => {
    const spaceId = idSchema.parse(req.params.spaceId), user = res.locals.user as User, body = createLink.parse(req.body);
    await accessSpace(db, user.id, spaceId, 'owner');
    const id = randomUUID(), token = newToken();
    const { rows } = await db.query<Parameters<typeof linkOut>[0]>(`WITH created AS (
      INSERT INTO v2_clinician_links(id,space_id,token_hash,label,from_date,created_by,expires_at) SELECT $1,id,$3,$4,$5,$6,$7 FROM v2_spaces WHERE id=$2 AND owner_id=$6 RETURNING *
    ), audit AS (INSERT INTO v2_audit(space_id,actor_id,action,entity_id) SELECT space_id,$6,'clinician_link.created',id FROM created)
    SELECT id,label,from_date,expires_at,created_at,last_viewed_at FROM created`, [id, spaceId, hashToken(token), body.label, body.fromDate, user.id, new Date(Date.now() + body.days * 86400000)]);
    if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Space not found.');
    const created: ClinicianLinkCreated = { ...linkOut(rows[0]), token };
    res.status(201).json(created);
  });
  router.delete('/spaces/:spaceId/clinician-links/:linkId', async (req, res) => {
    const spaceId = idSchema.parse(req.params.spaceId), linkId = idSchema.parse(req.params.linkId), user = res.locals.user as User;
    await accessSpace(db, user.id, spaceId, 'owner');
    const { rows } = await db.query<{ id: string }>(`WITH gone AS (DELETE FROM v2_clinician_links WHERE id=$1 AND space_id=$2 RETURNING id,space_id),
      audit AS (INSERT INTO v2_audit(space_id,actor_id,action,entity_id) SELECT space_id,$3,'clinician_link.revoked',id FROM gone) SELECT id FROM gone`, [linkId, spaceId, user.id]);
    if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Link not found.');
    res.json({ ok: true });
  });
  return router;
}
