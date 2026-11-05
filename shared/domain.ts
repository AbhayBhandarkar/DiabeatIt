import { z } from 'zod';

export type Role = 'patient' | 'companion' | 'professional';
export type IntakeStatus = 'taken' | 'not-taken' | 'unsure' | 'snoozed';
export type Medicine = { id: string; name: string; ingredient: string; strength: string; instructions: string; time: string; active: boolean; source: string };
export type Glucose = { id: string; value: number; unit: 'mg/dL' | 'mmol/L'; measuredAt: string; context: string; source: string; author: string };
export type Intake = { id: string; medicineId: string; date: string; status: IntakeStatus; reason: string; at: string; author: string };
export type Meal = { id: string; foodId: string; portions: number; at: string; meal: string; author: string };
export type Review = { id: string; title: string; description: string; status: 'submitted' | 'reviewing' | 'clarification' | 'resolved'; note: string; createdAt: string; resolvedAt?: string; author: string };
export type Document = { id: string; name: string; mime: string; data: string; at: string; author: string };
export type Audit = { id: string; at: string; actor: string; action: string };
export type State = {
  profile: { name: string; age: number; city: string; language: 'en' | 'hi' };
  medicines: Medicine[]; glucose: Glucose[]; intakes: Intake[]; meals: Meal[]; reviews: Review[]; documents: Document[];
  permissions: { active: boolean; glucose: boolean; medicines: boolean; meals: boolean; documents: boolean };
  plan: { version: number; approvedAt: string; approvedBy: string; acknowledged: boolean; note: string };
  completedLessons: string[]; questions: string[]; audit: Audit[];
};
export type Snapshot = { state: State; version: number; role: Role };
const text = z.string().trim().min(1).max(1000);
const id = z.string().min(1).max(100);
const date = z.string().datetime({ offset: true });
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('glucose.add'), value: z.number().finite().positive(), unit: z.enum(['mg/dL', 'mmol/L']), measuredAt: date, context: z.enum(['Fasting', 'Before meal', 'After meal', 'Bedtime', 'Other']) }),
  z.object({ type: z.literal('glucose.delete'), id }),
  z.object({ type: z.literal('intake.record'), medicineId: id, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(['taken', 'not-taken', 'unsure', 'snoozed']), reason: z.string().max(300).default('') }),
  z.object({ type: z.literal('meal.add'), foodId: id, portions: z.number().min(0.25).max(10), meal: z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack']), at: date }),
  z.object({ type: z.literal('meal.delete'), id }),
  z.object({ type: z.literal('review.add'), title: text, description: text }),
  z.object({ type: z.literal('review.update'), id, status: z.enum(['reviewing', 'clarification', 'resolved']), note: text }),
  z.object({ type: z.literal('plan.publish'), note: text }),
  z.object({ type: z.literal('plan.acknowledge') }),
  z.object({ type: z.literal('document.add'), name: z.string().min(1).max(150), mime: z.enum(['application/pdf', 'image/png', 'image/jpeg']), data: z.string().min(1).max(2800000) }),
  z.object({ type: z.literal('document.delete'), id }),
  z.object({ type: z.literal('permissions.update'), active: z.boolean(), glucose: z.boolean(), medicines: z.boolean(), meals: z.boolean(), documents: z.boolean() }),
  z.object({ type: z.literal('lesson.complete'), id }),
  z.object({ type: z.literal('question.add'), text }),
  z.object({ type: z.literal('profile.update'), name: z.string().trim().min(1).max(60), language: z.enum(['en', 'hi']) }),
]);
export type Action = z.infer<typeof actionSchema>;
export const actors: Record<Role, string> = { patient: 'Meena · patient', companion: 'Arjun · companion', professional: 'Dr. Kavya · fictional reviewer' };
export function mgdl(g: Pick<Glucose, 'value' | 'unit'>) { return g.unit === 'mmol/L' ? g.value * 18.0182 : g.value; }
export function indiaDate(value = new Date()) { return value.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); }
export class DomainError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function authorize(state: State, role: Role, action: Action) {
  const t = action.type;
  if (t === 'review.update' || t === 'plan.publish') { if (role !== 'professional') throw new DomainError('Only the fictional reviewer can perform this demo action.', 403); return; }
  if (role === 'professional') throw new DomainError('Reviewer access is limited to review and plan publication.', 403);
  if (role === 'patient') return;
  if (!state.permissions.active) throw new DomainError('Companion access has been revoked.', 403);
  const permission = t.startsWith('glucose.') ? 'glucose' : t.startsWith('meal.') ? 'meals' : t.startsWith('document.') ? 'documents' : t.startsWith('intake.') || t === 'review.add' ? 'medicines' : null;
  if (!permission || !state.permissions[permission]) throw new DomainError('The patient has not shared this capability.', 403);
}
export function visibleState(state: State, role: Role): State {
  const s = structuredClone(state);
  if (role !== 'companion') return s;
  const p = s.permissions;
  if (!p.active) throw new DomainError('Companion access has been revoked.', 403);
  if (!p.glucose) s.glucose = [];
  if (!p.meals) s.meals = [];
  if (!p.medicines) { s.medicines = []; s.intakes = []; s.reviews = []; s.plan = { version: 0, approvedAt: '', approvedBy: '', acknowledged: false, note: 'Not shared' }; }
  if (!p.documents) s.documents = [];
  s.questions = []; s.audit = []; s.completedLessons = [];
  return s;
}
export function reduceState(original: State, role: Role, input: unknown, now = new Date(), makeId = () => crypto.randomUUID()): State {
  const a = actionSchema.parse(input); authorize(original, role, a);
  const s = structuredClone(original); const at = now.toISOString(); const author = actors[role];
  const future = (time: string) => { if (new Date(time).getTime() > now.getTime() + 60000) throw new DomainError('Measurement or meal time cannot be in the future.'); };
  switch (a.type) {
    case 'glucose.add': {
      future(a.measuredAt); const n = mgdl(a);
      if (n < 20 || n > 600) throw new DomainError('Please verify the value and unit. This log accepts 20–600 mg/dL (about 1.2–33.3 mmol/L); it is not a safety range.');
      s.glucose.unshift({ ...a, id: makeId(), source: 'Manual entry', author }); break;
    }
    case 'glucose.delete': s.glucose = s.glucose.filter(g => g.id !== a.id); break;
    case 'intake.record': {
      if (!s.medicines.some(m => m.id === a.medicineId && m.active)) throw new DomainError('Medicine is not on the active demo plan.');
      if (a.date !== indiaDate(now)) throw new DomainError('Intake recording is limited to today in India time.');
      s.intakes = s.intakes.filter(i => !(i.date === a.date && i.medicineId === a.medicineId));
      s.intakes.unshift({ ...a, id: makeId(), at, author }); break;
    }
    case 'meal.add': future(a.at); s.meals.unshift({ ...a, id: makeId(), author }); break;
    case 'meal.delete': s.meals = s.meals.filter(m => m.id !== a.id); break;
    case 'review.add': s.reviews.unshift({ id: makeId(), title: a.title, description: a.description, status: 'submitted', note: '', createdAt: at, author }); break;
    case 'review.update': {
      const r = s.reviews.find(r => r.id === a.id); if (!r) throw new DomainError('Review not found.', 404);
      if (r.status === 'resolved') throw new DomainError('Resolved reviews are immutable. Create a new review for further concerns.');
      r.status = a.status; r.note = a.note; if (a.status === 'resolved') r.resolvedAt = at; break;
    }
    case 'plan.publish':
      if (s.reviews.some(r => r.status !== 'resolved')) throw new DomainError('Resolve all outstanding demo reviews before publishing.');
      s.plan = { version: s.plan.version + 1, approvedAt: at, approvedBy: author, acknowledged: false, note: a.note }; break;
    case 'plan.acknowledge': s.plan.acknowledged = true; break;
    case 'document.add':
      if (s.documents.length >= 10) throw new DomainError('Demo document limit reached. Remove a document first.');
      s.documents.unshift({ ...a, id: makeId(), at, author }); break;
    case 'document.delete': s.documents = s.documents.filter(d => d.id !== a.id); break;
    case 'permissions.update': s.permissions = { active: a.active, glucose: a.glucose, medicines: a.medicines, meals: a.meals, documents: a.documents }; break;
    case 'lesson.complete': if (!s.completedLessons.includes(a.id)) s.completedLessons.push(a.id); break;
    case 'question.add': if (s.questions.length >= 30) throw new DomainError('Please include remaining questions in your appointment discussion.'); s.questions.push(a.text); break;
    case 'profile.update': s.profile.name = a.name; s.profile.language = a.language; break;
  }
  s.audit.unshift({ id: makeId(), at, actor: author, action: a.type + (a.type === 'review.update' ? ` → ${a.status}: ${a.note}` : a.type === 'plan.publish' ? ` → version ${s.plan.version}: ${a.note}` : a.type === 'intake.record' ? ` → ${a.medicineId}: ${a.status}${a.reason ? ` (${a.reason})` : ''}` : '') });
  return s;
}