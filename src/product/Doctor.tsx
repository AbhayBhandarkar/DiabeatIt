import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Printer, ShieldCheck, Pill, FlaskConical, Activity, MessageCircleQuestion, Clock3, Stethoscope, Moon, Sun } from 'lucide-react';
import { buildTimeline, glucoseStats, intakeStats, toMgdl } from '../../shared/timeline';
import { overlappingIngredients } from '../../shared/medicineNames';
import type { ClinicianView, GlucoseData, LabData, MedicineData, QuestionData } from '../../shared/v2';
import type { TimelineSummaryResult } from '../../shared/ai';
import { request } from './context';
import { SummaryView } from './Summary';
import { TimelineList } from './Timeline';
import { Notice, istDate } from './ui';
import './product.css';
import './patient-polish.css';
import './theme.css';

const d = <T,>(e: { data: Record<string, unknown> }) => e.data as unknown as T;
const fmt = (iso: string, time = false) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', ...(time ? { timeStyle: 'short' } : {}) });

export default function DoctorView() {
  const token = useMemo(() => location.hash.slice(1), []);
  const [view, setView] = useState<ClinicianView | null>(null);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<(TimelineSummaryResult & { generatedAt: string }) | null>(null);
  const [pending, setPending] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [highlight, setHighlight] = useState('');
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => { document.title = 'Shared patient timeline · DiabeatIT'; void request<ClinicianView>('/clinician/view', 'POST', { token }).then(setView).catch(e => setError(e instanceof Error ? e.message : 'This link could not be opened.')); }, [token]);

  if (error) return <div className="product-loading doctor-state"><img src="/icon.svg" alt="" /><h1>Link unavailable</h1><p>{error}</p><p className="muted">Ask the patient to create a new link from their DiabeatIT timeline.</p></div>;
  if (!view) return <div className="product-loading"><img src="/icon.svg" alt="" /><h1>Opening shared timeline…</h1></div>;

  const today = istDate();
  const events = buildTimeline(view.entities, today, view.fromDate);
  const meds = view.entities.medicines.map(e => ({ e, m: d<MedicineData>(e) }));
  const active = meds.filter(x => x.m.status === 'active'), stopped = meds.filter(x => x.m.status === 'archived');
  const overlaps = overlappingIngredients(active.map(x => ({ id: x.e.id, name: x.m.name, ingredient: x.m.ingredient })));
  const labs = view.entities.labs.map(e => d<LabData>(e)).filter(l => l.takenOn >= view.fromDate);
  const labGroups = [...labs.reduce((m, l) => m.set(l.name, [...(m.get(l.name) ?? []), l]), new Map<string, LabData[]>())].map(([name, rows]) => ({ name, rows: rows.sort((a, b) => b.takenOn.localeCompare(a.takenOn)) }));
  const g = glucoseStats(view.entities.glucose, view.fromDate), adherence = intakeStats(view.entities.intakes, view.fromDate);
  const questions = view.entities.questions.map(e => d<QuestionData>(e).text);
  const readings = view.entities.glucose.map(e => d<GlucoseData>(e)).filter(r => r.measuredAt.slice(0, 10) >= view.fromDate).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  function jump(ref: string) { setHighlight(ref); document.getElementById(`ev-${ref}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  async function generate() {
    setPending(true); setSummaryError('');
    try { setSummary(await request<TimelineSummaryResult & { generatedAt: string }>('/clinician/summary', 'POST', { token })); }
    catch (e) { setSummaryError(e instanceof Error ? e.message : 'Summary unavailable.'); }
    finally { setPending(false); }
  }

  return <div className="product-shell doctor-shell">
    <header className="doctor-bar"><a className="product-brand" href="/about"><img src="/icon.svg" alt="" /><span>diabeat<span>IT</span></span></a><span className="doctor-badge"><Stethoscope size={16} />Clinician view · read-only</span><div className="row"><button className="icon-btn" aria-label="Switch colour theme" onClick={() => setDark(!dark)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button><button className="btn secondary" onClick={() => print()}><Printer size={18} />Print</button></div></header>
    <main className="product-main doctor-main">
      <div className="page-heading"><div><p className="doctor-for">Shared by the patient for {view.label}</p><h1>{view.patientName}</h1><p className="muted"><Clock3 size={16} /> Records from {fmt(view.fromDate)} · opened {fmt(view.generatedAt, true)} IST · link valid until {fmt(view.expiresAt)}</p></div></div>
      <Notice>All information is patient-reported in DiabeatIT and has not been verified by a clinician. Glucose values are copied from the patient’s meter; doses are as the patient recorded them.</Notice>
      {overlaps.map(o => <Notice error key={o.ingredient}>Same active ingredient in {o.products.length} active products: <strong>{o.ingredient}</strong> — {o.products.map(p => p.name).join(' and ')}. Ingredients as entered by the patient; please confirm.</Notice>)}

      <div className="insight-cards">
        <article className="insight-card"><Pill /><span>Active medicines</span><strong>{active.length}</strong><p>{stopped.length} stopped in record</p></article>
        <article className="insight-card"><Activity /><span>Glucose (mg/dL)</span>{g ? <><strong>{g.mean}<small>avg</small></strong><p>{g.count} readings · range {g.min}–{g.max}</p></> : <><strong>—</strong><p>No readings in range</p></>}</article>
        <article className="insight-card"><ShieldCheck /><span>Dose reports</span><strong>{adherence.taken}<small>taken</small></strong><p>{adherence.missed} missed · {adherence.unsure} unsure</p></article>
      </div>

      <section className="panel ai-panel">
        <div className="page-heading"><div><p className="eyebrow"><Sparkles size={14} /> 30-SECOND BRIEFING</p><h2>AI summary of this timeline</h2><p className="muted">Factual summary of the shared records. Every statement cites the record it came from.</p></div><button className="btn primary" disabled={pending} onClick={() => void generate()}><Sparkles size={18} />{pending ? 'Summarising…' : summary ? 'Regenerate' : 'Generate summary'}</button></div>
        {summaryError && <Notice error>{summaryError}</Notice>}
        {summary && <SummaryView summary={summary} onRef={jump} audience="clinician" />}
      </section>

      <div className="doctor-grid">
        <section className="panel"><h2><Pill size={20} />Medicines</h2>{active.length ? <div className="table-wrap"><table><thead><tr><th>Medicine</th><th>Strength</th><th>Times</th><th>Since</th></tr></thead><tbody>{active.map(({ e, m }) => <tr key={e.id}><td><strong>{m.name}</strong>{m.ingredient && m.ingredient !== m.name && <><br /><span className="muted small">{m.ingredient}</span></>}{m.instructions && <><br /><span className="muted small">{m.instructions}</span></>}</td><td>{m.strength || '—'}</td><td>{m.times.join(', ') || '—'}</td><td>{m.startDate}</td></tr>)}</tbody></table></div> : <p className="muted">No active medicines recorded.</p>}
          {stopped.length > 0 && <p className="muted small">Stopped: {stopped.map(x => x.m.name).join(', ')}</p>}</section>
        <section className="panel"><h2><FlaskConical size={20} />Test results</h2>{labGroups.length ? <div className="table-wrap"><table><thead><tr><th>Test</th><th>Latest</th><th>Earlier</th></tr></thead><tbody>{labGroups.map(({ name, rows }) => <tr key={name}><td><strong>{name}</strong></td><td>{rows[0].value} {rows[0].unit}<br /><span className="muted small">{rows[0].takenOn}</span></td><td className="small">{rows.slice(1, 4).map(r => `${r.value} (${r.takenOn})`).join(' · ') || '—'}</td></tr>)}</tbody></table></div> : <p className="muted">No test results in range.</p>}</section>
        <section className="panel"><h2><Activity size={20} />Glucose readings</h2>{readings.length ? <GlucoseStrip readings={readings} /> : <p className="muted">No readings in range.</p>}{g && <p className="muted small">{g.byContext.map(c => `${c.context}: avg ${c.mean} (n=${c.count})`).join(' · ')}</p>}</section>
        <section className="panel"><h2><MessageCircleQuestion size={20} />Patient’s questions</h2>{questions.length ? <ul className="question-list">{questions.map(q => <li key={q}>{q}</li>)}</ul> : <p className="muted">No questions recorded.</p>}</section>
      </div>

      <section className="panel"><h2>Timeline</h2><TimelineList events={events} highlight={highlight} /></section>
      <p className="muted small doctor-foot">DiabeatIT shares records only with the patient’s permission. This view is logged in the patient’s activity history. Do not forward this link.</p>
    </main>
  </div>;
}

function GlucoseStrip({ readings }: { readings: GlucoseData[] }) {
  const data = readings.slice(-40), values = data.map(toMgdl);
  const min = Math.max(0, Math.min(...values) - 20), max = Math.max(...values) + 20;
  const x = (i: number) => data.length === 1 ? 300 : 40 + i / (data.length - 1) * 540, y = (v: number) => 15 + (max - v) / (max - min || 1) * 130;
  return <svg viewBox="0 0 600 170" className="glucose-plot" role="img" aria-label={`${data.length} glucose readings in mg/dL`}>
    {[0, 1, 2].map(i => <g key={i}><line x1="40" x2="590" y1={15 + i * 65} y2={15 + i * 65} stroke="currentColor" opacity=".12" /><text x="0" y={20 + i * 65} fontSize="12" fill="currentColor">{Math.round(max - (max - min) * i / 2)}</text></g>)}
    <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--p-primary)" strokeWidth="2" opacity=".5" />
    {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="4.5" fill="var(--p-primary)"><title>{data[i].value} {data[i].unit} · {data[i].context} · {fmt(data[i].measuredAt, true)}</title></circle>)}
  </svg>;
}
