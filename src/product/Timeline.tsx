import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { CalendarClock, CalendarPlus, FlaskConical, Pill, Activity, MessageCircleQuestion, Stethoscope, Share2, Sparkles, Copy, Trash2, ExternalLink, AlertCircle, ArrowUpRight } from 'lucide-react';
import { buildTimeline, glucoseStats, type TimelineEvent, type TimelineKind } from '../../shared/timeline';
import type { AppointmentData, ClinicianLink, ClinicianLinkCreated, Entity, LabData } from '../../shared/v2';
import { useProduct } from './context';
import { ai, type AiSource } from './ai';
import { QrImage, SummaryView } from './Summary';
import { ConfirmButton, Dialog, Field, FormActions, Notice, can, dataOf, istDate, useAction } from './ui';
import type { TimelineSummaryResult } from '../../shared/ai';

export const kindMeta: Record<TimelineKind, { label: string; Icon: typeof Pill }> = {
  appointment: { label: 'Visit', Icon: Stethoscope }, lab: { label: 'Test result', Icon: FlaskConical }, medicine: { label: 'Medicine', Icon: Pill },
  intake: { label: 'Dose', Icon: AlertCircle }, glucose: { label: 'Glucose', Icon: Activity }, symptom: { label: 'Symptom', Icon: MessageCircleQuestion }, question: { label: 'Question', Icon: MessageCircleQuestion },
};
const filters: { id: string; label: string; kinds: TimelineKind[] }[] = [
  { id: 'key', label: 'Key events', kinds: ['appointment', 'lab', 'medicine', 'intake', 'symptom', 'question'] }, { id: 'visits', label: 'Visits', kinds: ['appointment'] }, { id: 'labs', label: 'Test results', kinds: ['lab'] },
  { id: 'meds', label: 'Medicines', kinds: ['medicine', 'intake'] }, { id: 'glucose', label: 'Glucose', kinds: ['glucose'] }, { id: 'notes', label: 'Symptoms & questions', kinds: ['symptom', 'question'] }, { id: 'all', label: 'Everything', kinds: [] },
];
export const labPresets: [string, string][] = [['HbA1c', '%'], ['Fasting glucose', 'mg/dL'], ['Post-meal glucose', 'mg/dL'], ['LDL cholesterol', 'mg/dL'], ['Triglycerides', 'mg/dL'], ['Creatinine', 'mg/dL'], ['eGFR', 'mL/min/1.73m²'], ['Urine albumin (UACR)', 'mg/g'], ['Blood pressure (systolic)', 'mmHg'], ['Weight', 'kg']];
const specialties = ['Diabetologist', 'Endocrinologist', 'General physician', 'Cardiologist', 'Nephrologist', 'Ophthalmologist', 'Podiatrist', 'Dietitian', 'Other'];
const monthLabel = (date: string) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
const dayLabel = (date: string) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const monthsAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return istDate(d); };

export function TimelineList({ events, highlight, actions }: { events: TimelineEvent[]; highlight?: string; actions?: (e: TimelineEvent) => ReactNode }) {
  const groups = useMemo(() => { const m = new Map<string, TimelineEvent[]>(); for (const e of events) { const k = monthLabel(e.date); m.set(k, [...(m.get(k) ?? []), e]); } return [...m]; }, [events]);
  if (!events.length) return <div className="no-data"><CalendarClock /><p>Nothing recorded for this view yet.</p></div>;
  return <ol className="timeline">{groups.map(([month, items]) => <li key={month} className="timeline-month"><h3>{month}</h3><ol>{items.map(e => { const { Icon, label } = kindMeta[e.kind]; return <li key={e.ref + e.at} id={`ev-${e.ref}`} className={`timeline-event kind-${e.kind}${highlight === e.ref ? ' highlighted' : ''}${e.upcoming ? ' upcoming' : ''}`}>
    <span className="timeline-dot" aria-hidden="true"><Icon size={16} /></span>
    <div className="timeline-card"><div className="timeline-meta"><span>{dayLabel(e.date)}</span><span className="chip">{e.upcoming ? 'Upcoming visit' : label}</span><code className="ref-code">{e.ref}</code></div><strong>{e.title}</strong>{e.detail && <p>{e.detail}</p>}{actions?.(e)}</div>
  </li>; })}</ol></li>)}</ol>;
}

export default function Timeline() {
  const { snapshot, create, remove, busy, request, spaceId, notify } = useProduct();
  const [filter, setFilter] = useState('key');
  const [dialog, setDialog] = useState<'' | 'visit' | 'lab' | 'share'>('');
  const [summary, setSummary] = useState<(TimelineSummaryResult & { generatedAt: string; source: AiSource }) | null>(null);
  const [highlight, setHighlight] = useState('');
  const [labName, setLabName] = useState(labPresets[0][0]);
  const summarize = useAction();
  const today = istDate();
  const events = useMemo(() => buildTimeline(snapshot.entities, today), [snapshot, today]);
  const shown = filters.find(f => f.id === filter)!.kinds;
  const visible = shown.length ? events.filter(e => shown.includes(e.kind)) : events;
  const upcoming = events.filter(e => e.kind === 'appointment' && e.upcoming).at(-1);
  const hba1c = snapshot.entities.labs.map(e => dataOf<'labs'>(e)).filter(l => /a1c/i.test(l.name)).sort((a, b) => b.takenOn.localeCompare(a.takenOn));
  const stats = glucoseStats(snapshot.entities.glucose, monthsAgo(1));
  const entityById = new Map<string, Entity>([...snapshot.entities.appointments, ...snapshot.entities.labs].map(e => [e.id, e]));
  const owner = snapshot.space.role === 'owner';

  function jump(ref: string) { setFilter('all'); setHighlight(ref); requestAnimationFrame(() => document.getElementById(`ev-${ref}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })); }
  async function saveVisit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const s = (k: string) => String(f.get(k) ?? '').trim();
    const data: AppointmentData = { date: s('date'), clinician: s('clinician'), specialty: s('specialty'), facility: s('facility'), reason: s('reason'), notes: s('notes'), changes: s('changes'), ...(s('followUp') ? { followUp: s('followUp') } : {}) };
    if (await create('appointments', data)) setDialog('');
  }
  async function saveLab(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const s = (k: string) => String(f.get(k) ?? '').trim();
    const data: LabData = { name: s('name') === 'Other' ? s('otherName') : s('name'), value: Number(s('value')), unit: s('unit'), takenOn: s('takenOn'), notes: s('notes') };
    if (await create('labs', data)) setDialog('');
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">YOUR CARE STORY</p><h1>Timeline</h1><p className="muted">Every visit, test and change in one place — so any doctor can catch up in a minute.</p></div>
      <div className="heading-actions">{can(snapshot, 'appointments') && <button className="btn secondary" onClick={() => setDialog('visit')}><CalendarPlus size={18} />Add a visit</button>}{can(snapshot, 'labs') && <button className="btn secondary" onClick={() => setDialog('lab')}><FlaskConical size={18} />Add a test result</button>}{owner && <button className="btn primary" onClick={() => setDialog('share')}><Share2 size={18} />Share with my doctor</button>}</div></div>

    <div className="insight-cards">
      <article className="insight-card"><CalendarClock /><span>Next visit</span>{upcoming ? <><strong>{dayLabel(upcoming.date)}</strong><p>{upcoming.title}</p></> : <><strong>—</strong><p>No upcoming visit recorded</p></>}</article>
      <article className="insight-card"><FlaskConical /><span>Latest HbA1c</span>{hba1c[0] ? <><strong>{hba1c[0].value}<small>{hba1c[0].unit}</small></strong><p>{dayLabel(hba1c[0].takenOn)}{hba1c[1] ? ` · previous ${hba1c[1].value}${hba1c[1].unit}` : ''}</p></> : <><strong>—</strong><p>Add it from your lab report</p></>}</article>
      <article className="insight-card"><Activity /><span>Glucose · last 30 days</span>{stats ? <><strong>{stats.mean}<small>mg/dL avg</small></strong><p>{stats.count} readings · {stats.min}–{stats.max}</p></> : <><strong>—</strong><p>No readings this month</p></>}</article>
    </div>

    <section className="panel ai-panel">
      <div className="page-heading"><div><p className="eyebrow"><Sparkles size={14} /> PREPARE FOR YOUR VISIT</p><h2>Your last six months, summarised</h2><p className="muted">A short, factual summary of your own records, with every point linked to its source. Bring it to your appointment or share it with your doctor.</p></div>
        <button className="btn primary" disabled={summarize.pending || !events.length} onClick={() => void summarize.run(async () => setSummary(await ai.timelineSummary(snapshot, monthsAgo(6))))}><Sparkles size={18} />{summarize.pending ? 'Reading your records…' : summary ? 'Refresh summary' : 'Create summary'}</button></div>
      {!events.length && <p className="muted">Add a visit or a test result first.</p>}
      {summarize.error && <Notice error>{summarize.error}</Notice>}
      {summary && <SummaryView summary={summary} source={summary.source} onRef={jump} audience="patient" />}
    </section>

    <section className="panel">
      <div className="filter-chips" role="group" aria-label="Filter timeline">{filters.map(f => <button key={f.id} type="button" className="filter-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}</div>
      <TimelineList events={visible} highlight={highlight} actions={e => { const entity = entityById.get(e.id); return entity && can(snapshot, entity.kind) ? <div className="timeline-actions"><ConfirmButton label="Remove" title="Remove this record?" onConfirm={() => remove(entity)}>This removes the record from your timeline. An audit entry is kept.</ConfirmButton></div> : null; }} />
    </section>

    {dialog === 'visit' && <Dialog title="Add a doctor visit" onClose={() => setDialog('')} busy={busy}><form onSubmit={saveVisit}><div className="form-grid">
      <Field label="Date"><input name="date" type="date" required defaultValue={today} /></Field>
      <Field label="Doctor’s name"><input name="clinician" required maxLength={160} placeholder="Dr. Mehta" /></Field>
      <Field label="Speciality"><select name="specialty" defaultValue="Diabetologist">{specialties.map(s => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Hospital or clinic"><input name="facility" maxLength={200} /></Field>
      <Field label="Why you went" wide><input name="reason" maxLength={1000} placeholder="Three-month review" /></Field>
      <Field label="What changed (in your words)" wide hint="e.g. Metformin increased to twice a day"><textarea name="changes" maxLength={2000} /></Field>
      <Field label="Other notes" wide><textarea name="notes" maxLength={4000} /></Field>
      <Field label="Next follow-up (optional)"><input name="followUp" type="date" min={today} /></Field>
    </div><FormActions busy={busy} onClose={() => setDialog('')} label="Save visit" /></form></Dialog>}

    {dialog === 'lab' && <Dialog title="Add a test result" onClose={() => setDialog('')} busy={busy}><form onSubmit={saveLab}><div className="form-grid">
      <Field label="Test"><select name="name" value={labName} onChange={e => setLabName(e.target.value)}>{labPresets.map(([n]) => <option key={n}>{n}</option>)}<option>Other</option></select></Field>
      {labName === 'Other' && <Field label="Test name"><input name="otherName" required maxLength={120} /></Field>}
      <Field label="Result"><input name="value" type="number" step="any" min="0" required inputMode="decimal" /></Field>
      <Field label="Unit"><input name="unit" key={labName} defaultValue={labPresets.find(([n]) => n === labName)?.[1] ?? ''} maxLength={40} /></Field>
      <Field label="Test date"><input name="takenOn" type="date" required max={today} defaultValue={today} /></Field>
      <Field label="Notes" wide><textarea name="notes" maxLength={1000} /></Field>
    </div><Notice>Copy the number and unit exactly as printed on your lab report. DiabeatIT does not judge results as good or bad.</Notice><FormActions busy={busy} onClose={() => setDialog('')} label="Save result" /></form></Dialog>}

    {dialog === 'share' && <ShareDialog onClose={() => setDialog('')} request={request} spaceId={spaceId} notify={notify} />}
  </>;
}

function ShareDialog({ onClose, request, spaceId, notify }: { onClose: () => void; request: ReturnType<typeof useProduct>['request']; spaceId: string; notify: (m: string) => void }) {
  const [links, setLinks] = useState<ClinicianLink[] | null>(null);
  const [created, setCreated] = useState<ClinicianLinkCreated | null>(null);
  const action = useAction();
  const load = () => request<{ links: ClinicianLink[] }>(`/spaces/${spaceId}/clinician-links`).then(r => setLinks(r.links));
  useEffect(() => { void load().catch(() => setLinks([])); }, [spaceId]);
  const url = created ? `${location.origin}/doctor#${created.token}` : '';
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    await action.run(async () => { setCreated(await request<ClinicianLinkCreated>(`/spaces/${spaceId}/clinician-links`, 'POST', { label: String(f.get('label')).trim(), days: Number(f.get('days')), fromDate: String(f.get('fromDate')) })); await load(); });
  }
  return <Dialog title="Share your timeline with a doctor" onClose={onClose} busy={action.pending}>
    {!created ? <form onSubmit={submit} className="stack">
      <p>Your doctor scans a code or opens a link to see a <strong>read-only</strong> timeline with medicines, test results, visits, glucose readings, symptoms and questions. No account is needed. You can withdraw it at any time.</p>
      <div className="form-grid"><Field label="Who is it for?"><input name="label" required maxLength={100} placeholder="Dr. Mehta, Apollo Clinic" /></Field>
        <Field label="Link works for"><select name="days" defaultValue="7">{[1, 3, 7, 14, 30].map(d => <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'}</option>)}</select></Field>
        <Field label="Include records from" wide><input name="fromDate" type="date" required defaultValue={monthsAgo(6)} max={istDate()} /></Field></div>
      {action.error && <Notice error>{action.error}</Notice>}
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={action.pending}><Share2 size={18} />{action.pending ? 'Creating…' : 'Create doctor link'}</button></div>
    </form> : <div className="share-result">
      <QrImage value={url} label={`QR code for ${created.label}`} />
      <div className="stack"><h3>Ready for {created.label}</h3><p className="muted">Ask your doctor to scan this code, or send the link privately. It stops working on {new Date(created.expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' })}. The link is shown only now.</p>
        <div className="link-box"><input readOnly value={url} aria-label="Doctor link" onFocus={e => e.currentTarget.select()} /></div>
        <div className="row"><button className="btn secondary" onClick={() => void navigator.clipboard?.writeText(url).then(() => notify('Doctor link copied.'), () => notify('Copy failed — select the link and copy it.'))}><Copy size={18} />Copy link</button><a className="btn ghost" href={url} target="_blank" rel="noreferrer"><ExternalLink size={18} />Preview what the doctor sees</a></div>
      </div>
    </div>}
    <h3 className="section-title">Active doctor links</h3>
    {links === null ? <p className="muted">Loading…</p> : links.length ? links.map(l => <div className="journal-row" key={l.id}><div><strong>{l.label}</strong><p className="muted small">Records from {l.fromDate} · until {new Date(l.expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' })} · {l.lastViewedAt ? `last opened ${new Date(l.lastViewedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}` : 'not opened yet'}</p></div><button className="btn danger" onClick={() => void action.run(async () => { await request(`/spaces/${spaceId}/clinician-links/${l.id}`, 'DELETE'); await load(); notify('Doctor link withdrawn.'); })}><Trash2 size={16} />Withdraw</button></div>) : <p className="muted">No active links.</p>}
    <a className="home-link" href="/about#doctors" target="_blank" rel="noreferrer">How doctor sharing protects you<ArrowUpRight size={16} /></a>
  </Dialog>;
}
