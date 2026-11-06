import { z } from 'zod';
import { allScopes, entityKinds, intakeToday, type EntityKind, type Scope } from '../../shared/v2';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
/** Reject reserved keys before a schema transform can discard them. Bound nesting without recursion. */
export function validateJsonStructure(input: unknown): void {
  const pending: [unknown, number][] = [[input, 0]]; let visited = 0;
  while (pending.length) {
    const [value, depth] = pending.pop()!;
    if (++visited > 10000 || depth > 20) throw new ApiError(400, 'VALIDATION_ERROR', 'Request structure is too complex.');
    if (value === null || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new ApiError(400, 'VALIDATION_ERROR', 'Unsupported request field.');
      pending.push([child, depth + 1]);
    }
  }
}
export const idSchema = z.uuid();
export const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const passwordSchema = z.string().min(12).max(256);
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
const text = (max = 200) => z.string().trim().min(1).max(max).refine(s => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s), 'Control characters are not allowed.');
const optionalText = (max = 2000) => z.string().trim().max(max).refine(s => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s));
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(`${s}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'Use a valid calendar date.');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const pastDate = dateSchema.refine(s => s <= intakeToday(), 'Future IST report dates are not allowed.');
export const auditQuerySchema = z.object({ before: z.string().refine(s => /^[1-9]\d{0,18}$/.test(s) && BigInt(s) <= 9223372036854775807n, 'Invalid audit cursor.').optional() }).strict();
export const entityPageSchema = z.object({
  kind: z.enum(entityKinds),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: idSchema.optional(),
}).strict();
const observedAt = z.iso.datetime({ offset: true }).refine(s => Date.parse(s) <= Date.now(), 'Future observations are not allowed.');
const amount = z.number().finite().min(0).max(100000);
const nutrition = { carbs: amount.nullable(), fiber: amount.nullable(), protein: amount.nullable(), kcal: amount.nullable() };
export const sourceUrl = z.url().max(2000).refine(s => {
  const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password && !u.port && ['world.openfoodfacts.org', 'fdc.nal.usda.gov', 'dailymed.nlm.nih.gov', 'api.fda.gov', 'www.accessdata.fda.gov'].includes(u.hostname);
}, 'Use an approved HTTPS reference URL.');
export const dataSchemas = {
  medicines: z.object({ name: text(), ingredient: text(), strength: optionalText(200), form: text(100), route: text(100), instructions: optionalText(4000), times: z.array(time).max(24).refine(a => new Set(a).size === a.length), days: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(a => new Set(a).size === a.length), startDate: dateSchema, endDate: dateSchema.optional(), status: z.enum(['active', 'archived']), source: text(500), stock: z.number().int().min(0).max(1000000).optional() }).strict().refine(d => !d.endDate || d.endDate >= d.startDate, 'End date precedes start date.'),
  intakes: z.object({ medicineId: idSchema, date: pastDate, scheduledTime: time, status: z.enum(['taken', 'not-taken', 'unsure']), reason: optionalText() }).strict(),
  glucose: z.object({ value: z.number().finite().positive(), unit: z.enum(['mg/dL', 'mmol/L']), measuredAt: observedAt, context: text(500) }).strict().refine(d => d.value <= (d.unit === 'mg/dL' ? 2000 : 111), 'Value exceeds the supported recording range; check the unit.'),
  meals: z.object({ name: text(), meal: text(100), at: observedAt, grams: amount, ...nutrition, source: text(500), sourceUrl: sourceUrl.optional(), foodId: text(200).optional() }).strict(),
  recipes: z.object({ name: text(), servings: z.number().int().min(1).max(1000), ingredients: z.array(z.object({ name: text(), grams: amount, ...nutrition, source: text(500) }).strict()).min(1).max(100), instructions: optionalText(10000) }).strict(),
  documents: z.object({ name: text(200).refine(s => !/[\/\\]/.test(s)), mime: z.enum(['application/pdf', 'image/png', 'image/jpeg']), base64: z.string().max(2796204).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }).strict(),
  questions: z.object({ text: text(4000) }).strict(),
  tasks: z.object({ title: text(500), assignee: optionalText(200), dueDate: dateSchema, status: z.enum(['open', 'done']) }).strict(),
  symptoms: z.object({ text: text(4000), at: observedAt }).strict(),
  lessons: z.object({ lessonId: text(200), completed: z.boolean(), position: z.number().finite().min(0).max(86400) }).strict(),
  reviews: z.object({ title: text(500), question: text(4000), status: z.enum(['open', 'resolved']), resolution: optionalText(4000) }).strict().refine(d => d.status !== 'resolved' || !!d.resolution, 'A coordination resolution is required.'),
  appointments: z.object({ date: dateSchema, clinician: text(160), specialty: optionalText(120), facility: optionalText(200), reason: optionalText(1000), notes: optionalText(4000), changes: optionalText(2000), followUp: dateSchema.optional() }).strict().refine(d => !d.followUp || d.followUp >= d.date, 'Follow-up precedes the appointment.'),
  labs: z.object({ name: text(120), value: z.number().finite().min(0).max(100000), unit: optionalText(40), takenOn: pastDate, notes: optionalText(1000) }).strict(),
} satisfies Record<EntityKind, z.ZodType>;
export const createEntitySchema = z.object({ kind: z.enum(entityKinds), data: z.record(z.string(), z.unknown()) }).strict();
export const updateEntitySchema = z.object({ version: z.number().int().positive(), data: z.record(z.string(), z.unknown()) }).strict();
export const deleteEntitySchema = z.object({ version: z.number().int().positive() }).strict();
export const registerSchema = z.object({ name: text(100), email: emailSchema, password: passwordSchema, consent: z.literal(true) }).strict();
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(256) }).strict();
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(256), newPassword: passwordSchema }).strict();
export const recoverSchema = z.object({ email: emailSchema, recoveryCode: tokenSchema, newPassword: passwordSchema }).strict();
export const deleteAccountSchema = z.object({ password: z.string().min(1).max(256), confirmation: z.literal('DELETE') }).strict();
export const acceptSchema = z.object({ token: tokenSchema }).strict();
export const inviteSchema = z.object({ label: text(100), scopes: z.array(z.enum(allScopes as [Scope, ...Scope[]])).min(1).max(allScopes.length).refine(a => new Set(a).size === a.length && a.every(s => !s.endsWith(':write') || a.includes(s.replace(':write', ':read') as Scope)), 'Write scopes require their matching read scope; no duplicates.') }).strict();

export function validateData(kind: EntityKind, input: unknown): { data: Record<string, unknown>; blob: string | null } {
  const max = kind === 'documents' ? 2800000 : 65536;
  if (Buffer.byteLength(JSON.stringify(input) ?? '') > max) throw new ApiError(413, 'DATA_TOO_LARGE', 'Record exceeds the supported size.');
  const parsed = dataSchemas[kind].parse(input);
  if (kind !== 'documents') return { data: parsed as unknown as Record<string, unknown>, blob: null };
  const doc = dataSchemas.documents.parse(parsed);
  const bytes = Buffer.from(doc.base64, 'base64');
  if (bytes.length > 2 * 1024 * 1024) throw new ApiError(413, 'DATA_TOO_LARGE', 'Documents must be at most 2 MB.');
  const valid = doc.mime === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : doc.mime === 'image/png' ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' : bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
  if (!valid || bytes.toString('base64') !== doc.base64) throw new ApiError(400, 'INVALID_DOCUMENT', 'File signature or encoding does not match the supported format.');
  return { data: { name: doc.name, mime: doc.mime, size: bytes.length }, blob: doc.base64 };
}