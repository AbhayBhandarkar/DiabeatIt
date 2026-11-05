/**
 * AI endpoints, all under /api/v2/ai and all behind account sign-in.
 * Each endpoint validates input, calls runAi() with a fixed prompt, and validates the output schema.
 * Nothing here writes records: the patient reviews every AI draft before saving it.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Database } from '../../db';
import { intakeToday, type EntityCollections, type Entity, type User } from '../../../shared/v2';
import { imageRequest, keepKnownRefs, labelRequest, mythRequest, summaryRequest, userPrompts, type TimelineSummaryResult } from '../../../shared/ai';
import { evidenceCards, evidenceById } from '../../../shared/evidence';
import { timelinePrompt } from '../../../shared/timeline';
import { accessSpace, entityColumns, entityOut } from '../storage';
import { ApiError } from '../validation';
import { capabilities, checkImage, runAi } from './provider';

export const summaryKinds = ['medicines', 'intakes', 'glucose', 'appointments', 'labs', 'symptoms', 'questions', 'meals'] as const;
type SummaryCollections = Pick<EntityCollections, typeof summaryKinds[number]>;

export async function loadCollections(db: Database, spaceId: string, kinds: readonly string[]): Promise<SummaryCollections> {
  const { rows } = await db.query<Entity>(`SELECT ${entityColumns} FROM v2_entities WHERE space_id=$1 AND kind=ANY($2::text[]) ORDER BY created_at,id`, [spaceId, kinds]);
  return Object.fromEntries(summaryKinds.map(k => [k, rows.filter(r => r.kind === k).map(entityOut)])) as SummaryCollections;
}

/** Summarise records; citations that do not point at a supplied record are removed. */
export async function summarise(collections: SummaryCollections, fromDate: string, audience: 'clinician' | 'patient'): Promise<TimelineSummaryResult & { refs: string[] }> {
  const { text, refs } = timelinePrompt(collections, intakeToday(), fromDate);
  const result = await runAi('timelineSummary', userPrompts.timelineSummary(text, audience), { maxTokens: 1800 });
  return { ...keepKnownRefs(result, refs), refs: [...refs] };
}

export function createAiRouter(db: Database) {
  const router = Router();
  const limit = rateLimit({ windowMs: 60000, limit: 12, keyGenerator: (_req, res) => (res.locals.user as User).id, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Please wait a minute before asking the assistant again.', code: 'RATE_LIMITED' } });
  router.get('/ai/capabilities', (_req, res) => { const c = capabilities(); res.json({ ...c, foodVision: c.features.foodPhoto }); });
  router.use('/ai', limit);

  router.post('/ai/food-photo', async (req, res) => {
    const { image } = imageRequest.parse(req.body);
    const result = await runAi('foodPhoto', userPrompts.foodPhoto(), { image: checkImage(image) });
    res.json({ ...result, provider: capabilities().provider, estimated: true, requiresConfirmation: true });
  });

  router.post('/ai/prescription-scan', async (req, res) => {
    const { image } = imageRequest.parse(req.body);
    const result = await runAi('prescriptionScan', userPrompts.prescriptionScan(), { image: checkImage(image), maxTokens: 1800 });
    res.json({ ...result, requiresConfirmation: true });
  });

  router.post('/ai/timeline-summary', async (req, res) => {
    const { spaceId, fromDate } = summaryRequest.parse(req.body);
    const space = await accessSpace(db, (res.locals.user as User).id, spaceId);
    const readable = summaryKinds.filter(k => space.scopes.includes(`${k}:read`));
    if (!readable.length) throw new ApiError(403, 'FORBIDDEN', 'No shared records are available to summarise.');
    const from = fromDate ?? new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
    res.json({ ...await summarise(await loadCollections(db, spaceId, readable), from, 'patient'), fromDate: from, generatedAt: new Date().toISOString() });
  });

  router.post('/ai/myth-check', async (req, res) => {
    const { claim } = mythRequest.parse(req.body);
    const result = await runAi('mythCheck', userPrompts.mythCheck(claim, evidenceCards), { maxTokens: 700 });
    const evidence = result.evidenceIds.map(id => evidenceById.get(id)).filter(c => c !== undefined);
    res.json({ ...result, verdict: evidence.length || result.verdict === 'not-covered' ? result.verdict : 'not-covered', evidence });
  });

  router.post('/ai/label-explain', async (req, res) => {
    const body = labelRequest.parse(req.body);
    const result = await runAi('labelExplain', userPrompts.labelExplain(body), { maxTokens: 900 });
    res.json(result);
  });
    return router;
}
