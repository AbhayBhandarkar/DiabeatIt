/**
 * Client entry point for every AI feature.
 *
 * By default each call goes to the server endpoint (/api/v2/ai/...), which uses the configured provider.
 * An on-device runtime can take over by registering an adapter before or after the app loads:
 *
 *   window.diabeatitOnDeviceAi = { name: 'My phone model', supports: f => true, complete: async ({ system, user, image }) => '{...json...}' };
 *
 * The adapter receives the exact system prompt and user turn the server would send, returns raw text,
 * and the app validates it with the same schemas. If the adapter throws or returns invalid JSON,
 * the call falls back to the server automatically.
 */
import { aiPrompts, aiSchemas, extractJson, fitToSchema, keepKnownRefs, userPrompts, type AiCapabilities, type AiFeature, type AiResultMap, type LabelExplainResult, type MythCheckResult, type TimelineSummaryResult } from '../../shared/ai';
import { evidenceById, evidenceCards, type EvidenceCard } from '../../shared/evidence';
import { timelinePrompt } from '../../shared/timeline';
import { intakeToday, type SnapshotResponse } from '../../shared/v2';
import { request } from './context';

export interface OnDeviceAi {
  name: string;
  supports(feature: AiFeature): boolean | Promise<boolean>;
  /** image is a data: URL (JPEG) when the feature is visual. Return the model's raw reply text. */
  complete(input: { feature: AiFeature; system: string; user: string; image?: string }): Promise<string>;
}
declare global { interface Window { diabeatitOnDeviceAi?: OnDeviceAi } }

export type AiSource = { engine: 'on-device' | 'server'; name: string };
type WithSource<T> = T & { source: AiSource };

async function onDevice<F extends AiFeature>(feature: F, user: string, image?: string): Promise<WithSource<AiResultMap[F]> | null> {
  const adapter = window.diabeatitOnDeviceAi;
  try {
    if (!adapter || !(await adapter.supports(feature))) return null;
    const raw = await adapter.complete({ feature, system: aiPrompts[feature], user, image });
    const parsed = (aiSchemas[feature] as unknown as { parse(v: unknown): AiResultMap[F] }).parse(fitToSchema(extractJson(raw)));
    return { ...parsed, source: { engine: 'on-device', name: adapter.name } };
  } catch { return null; }
}
const server = (name = 'Server') => ({ engine: 'server' as const, name });

export const ai = {
  capabilities: () => request<AiCapabilities & { foodVision: boolean }>('/ai/capabilities'),
  onDeviceName: () => window.diabeatitOnDeviceAi?.name ?? null,

  async foodPhoto(image: string) {
    return await onDevice('foodPhoto', userPrompts.foodPhoto(), image) ?? { ...await request<AiResultMap['foodPhoto']>('/ai/food-photo', 'POST', { image, consent: true }), source: server() };
  },
  async prescriptionScan(image: string) {
    return await onDevice('prescriptionScan', userPrompts.prescriptionScan(), image) ?? { ...await request<AiResultMap['prescriptionScan']>('/ai/prescription-scan', 'POST', { image, consent: true }), source: server() };
  },
  async timelineSummary(snapshot: SnapshotResponse, fromDate: string): Promise<WithSource<TimelineSummaryResult & { generatedAt: string }>> {
    const { text, refs } = timelinePrompt(snapshot.entities, intakeToday(), fromDate);
    const local = await onDevice('timelineSummary', userPrompts.timelineSummary(text, 'patient'));
    if (local) return { ...keepKnownRefs(local, refs), source: local.source, generatedAt: new Date().toISOString() };
    return { ...await request<TimelineSummaryResult & { generatedAt: string }>('/ai/timeline-summary', 'POST', { spaceId: snapshot.space.id, fromDate }), source: server() };
  },
  async mythCheck(claim: string): Promise<WithSource<MythCheckResult & { evidence: EvidenceCard[] }>> {
    const local = await onDevice('mythCheck', userPrompts.mythCheck(claim, evidenceCards));
    if (local) {
      const evidence = local.evidenceIds.map(id => evidenceById.get(id)).filter((c): c is EvidenceCard => !!c);
      return { ...local, verdict: evidence.length || local.verdict === 'not-covered' ? local.verdict : 'not-covered', evidence };
    }
    return { ...await request<MythCheckResult & { evidence: EvidenceCard[] }>('/ai/myth-check', 'POST', { claim }), source: server() };
  },
  async labelExplain(body: { medicine: string; section: string; text: string }): Promise<WithSource<LabelExplainResult>> {
    return await onDevice('labelExplain', userPrompts.labelExplain(body)) ?? { ...await request<LabelExplainResult>('/ai/label-explain', 'POST', body), source: server() };
  },
};

/** Downscale any photo to a JPEG data URL the endpoints accept (max 1280px, under 2 MB). */
export async function photoToDataUrl(file: File, maxSide = 1280): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error('Choose a photo (JPEG, PNG or HEIC) up to 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.82);
    if (data.length > 2700000) throw new Error('This photo is too large. Try a closer crop.');
    return data;
  } catch (e) { throw e instanceof Error && e.message.startsWith('This photo') ? e : new Error('This photo could not be read. Try another one.'); }
  finally { URL.revokeObjectURL(url); }
}
