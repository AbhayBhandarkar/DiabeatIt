/** Chronological view across record kinds. Pure functions shared by the patient app, the clinician view and AI prompts. */
import type { Entity, EntityCollections, AppointmentData, LabData, MedicineData, IntakeData, GlucoseData, SymptomData, QuestionData } from './v2';

export type TimelineKind = 'appointment' | 'lab' | 'medicine' | 'intake' | 'glucose' | 'symptom' | 'question';
export interface TimelineEvent { ref: string; id: string; kind: TimelineKind; date: string; at: string; title: string; detail: string; upcoming: boolean }
type Collections = Partial<Pick<EntityCollections, 'appointments' | 'labs' | 'medicines' | 'intakes' | 'glucose' | 'symptoms' | 'questions'>>;

const IST_OFFSET = 330 * 60000;
export const istDay = (iso: string) => new Date(Date.parse(iso) + IST_OFFSET).toISOString().slice(0, 10);
export const refOf = (kind: TimelineKind, id: string) => `${kind.slice(0, 3)}-${id.replace(/-/g, '').slice(0, 6)}`;
const d = <T>(e: Entity) => e.data as unknown as T;
export const toMgdl = (g: Pick<GlucoseData, 'value' | 'unit'>) => g.unit === 'mg/dL' ? g.value : Math.round(g.value * 18.0182);

export function buildTimeline(c: Collections, today: string, fromDate = '0000-01-01'): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const push = (kind: TimelineKind, e: Entity, date: string, at: string, title: string, detail: string) => {
    if (date >= fromDate) events.push({ ref: refOf(kind, e.id), id: e.id, kind, date, at, title, detail, upcoming: date > today });
  };
  const medicineNames = new Map((c.medicines ?? []).map(e => [e.id, d<MedicineData>(e).name]));
  for (const e of c.appointments ?? []) {
    const a = d<AppointmentData>(e);
    const detail = [a.reason && `Reason: ${a.reason}`, a.changes && `Changes: ${a.changes}`, a.notes && `Notes: ${a.notes}`, a.followUp && `Follow-up: ${a.followUp}`].filter(Boolean).join(' · ');
    push('appointment', e, a.date, `${a.date}T09:00:00+05:30`, `${a.clinician}${a.specialty ? ` · ${a.specialty}` : ''}${a.facility ? ` · ${a.facility}` : ''}`, detail);
  }
  for (const e of c.labs ?? []) {
    const l = d<LabData>(e);
    push('lab', e, l.takenOn, `${l.takenOn}T08:00:00+05:30`, `${l.name}: ${l.value}${l.unit ? ` ${l.unit}` : ''}`, l.notes);
  }
  for (const e of c.medicines ?? []) {
    const m = d<MedicineData>(e);
    const schedule = `${m.strength ? `${m.strength} · ` : ''}${m.times.join(', ') || 'no set times'}${m.instructions ? ` · ${m.instructions}` : ''}`;
    push('medicine', e, m.startDate, `${m.startDate}T07:00:00+05:30`, `Started ${m.name}${m.ingredient && m.ingredient !== m.name ? ` (${m.ingredient})` : ''}`, schedule);
    if (m.status === 'archived') push('medicine', e, m.endDate ?? istDay(e.updatedAt), e.updatedAt, `Stopped ${m.name}`, 'Marked as no longer taken');
  }
  for (const e of c.intakes ?? []) {
    const i = d<IntakeData>(e);
    if (i.status === 'taken') continue;
    push('intake', e, i.date, `${i.date}T${i.scheduledTime}:00+05:30`, `${i.status === 'unsure' ? 'Unsure about' : 'Missed'} ${medicineNames.get(i.medicineId) ?? 'a medicine'} at ${i.scheduledTime}`, i.reason);
  }
  for (const e of c.glucose ?? []) {
    const g = d<GlucoseData>(e);
    push('glucose', e, istDay(g.measuredAt), g.measuredAt, `Glucose ${g.value} ${g.unit}`, g.context);
  }
  for (const e of c.symptoms ?? []) {
    const s = d<SymptomData>(e);
    push('symptom', e, istDay(s.at), s.at, 'Symptom noted', s.text);
  }
  for (const e of c.questions ?? []) push('question', e, istDay(e.createdAt), e.createdAt, 'Question for the doctor', d<QuestionData>(e).text);
  return events.sort((a, b) => b.at.localeCompare(a.at) || a.ref.localeCompare(b.ref));
}

export interface GlucoseStats { count: number; min: number; max: number; mean: number; byContext: { context: string; count: number; mean: number }[] }
export function glucoseStats(glucose: Entity[], fromDate = '0000-01-01'): GlucoseStats | null {
  const values = glucose.map(e => d<GlucoseData>(e)).filter(g => istDay(g.measuredAt) >= fromDate);
  if (!values.length) return null;
  const mg = values.map(toMgdl);
  const groups = new Map<string, number[]>();
  values.forEach((g, i) => groups.set(g.context, [...(groups.get(g.context) ?? []), mg[i]]));
  const mean = (a: number[]) => Math.round(a.reduce((s, v) => s + v, 0) / a.length);
  return { count: mg.length, min: Math.min(...mg), max: Math.max(...mg), mean: mean(mg), byContext: [...groups].map(([context, v]) => ({ context, count: v.length, mean: mean(v) })) };
}

export function intakeStats(intakes: Entity[], fromDate = '0000-01-01') {
  const rows = intakes.map(e => d<IntakeData>(e)).filter(i => i.date >= fromDate);
  return { taken: rows.filter(r => r.status === 'taken').length, missed: rows.filter(r => r.status === 'not-taken').length, unsure: rows.filter(r => r.status === 'unsure').length };
}

/** Compact, citation-ready text handed to a language model. Contains no account identifiers. */
export function timelinePrompt(c: Collections & { meals?: Entity[] }, today: string, fromDate: string): { text: string; refs: Set<string> } {
  const events = buildTimeline(c, today, fromDate).slice(0, 160);
  const g = glucoseStats(c.glucose ?? [], fromDate), i = intakeStats(c.intakes ?? [], fromDate);
  const active = (c.medicines ?? []).map(e => ({ e, m: d<MedicineData>(e) })).filter(x => x.m.status === 'active');
  const lines = [
    `Today (IST): ${today}. Records from ${fromDate}.`,
    `Active medicines: ${active.map(x => `[${refOf('medicine', x.e.id)}] ${x.m.name} ${x.m.strength} at ${x.m.times.join('/') || 'unspecified times'}`).join('; ') || 'none recorded'}.`,
    `Medicine reports: ${i.taken} taken, ${i.missed} missed, ${i.unsure} unsure.`,
    g ? `Glucose (mg/dL): ${g.count} readings, range ${g.min}-${g.max}, average ${g.mean}; ${g.byContext.map(x => `${x.context} avg ${x.mean} (n=${x.count})`).join(', ')}.` : 'Glucose: no readings recorded.',
    'Records (newest first):',
    ...events.map(e => `[${e.ref}] ${e.date}${e.upcoming ? ' (upcoming)' : ''} ${e.kind}: ${e.title}${e.detail ? ` — ${e.detail}` : ''}`),
  ];
  return { text: lines.join('\n').slice(0, 24000), refs: new Set([...events.map(e => e.ref), ...active.map(x => refOf('medicine', x.e.id))]) };
}
