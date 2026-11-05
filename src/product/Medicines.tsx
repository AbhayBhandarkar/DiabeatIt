import { useState, type FormEvent } from 'react';
import { Archive, Check, Clock3, Download, Edit3, FileUp, Link2, Pill, Plus, ScanText, X } from 'lucide-react';
import PrescriptionScan from './PrescriptionScan';
import type { DocumentData, DocumentMetadata, Entity, IntakeData, MedicineData, ReviewData } from '../../shared/v2';
import { useProduct } from './context';
import { can, ConfirmButton, dataOf, Dialog, Empty, Field, FormActions, istDate, istInput, Notice, Provenance, useAction, useClock } from './ui';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const unknownIdentity = /^(unknown|not known|not entered|unsure|n\/?a|unconfirmed|missing|not specified)$/i;
function identities(value: string) { return [...new Set(value.split(/[;,]/).map(v => v.trim().toLowerCase().replace(/\s+/g, ' ')).filter(v => v && !unknownIdentity.test(v)))]; }
const intakeLabels: Record<IntakeData['status'], string> = { taken: 'Taken', 'not-taken': 'Not taken', unsure: 'Unsure' };

export default function Medicines() { const { spaceId } = useProduct(); return <MedicineWorkspace key={spaceId} />; }

function MedicineWorkspace() {
  const { snapshot, busy, update, remove } = useProduct();
  const now = useClock();
  const today = istDate(now);
  const currentTime = istInput(now).slice(11);
  const day = new Date(`${today}T12:00:00+05:30`).getUTCDay();
  const [tab, setTab] = useState('today');
  const [scan, setScan] = useState(false);
  const [editor, setEditor] = useState<Entity | 'new' | null>(null);
  const [occurrence, setOccurrence] = useState<{ medicine?: Entity; time: string; date: string; existing?: Entity } | null>(null);
  const action = useAction();
  const medicines = snapshot.entities.medicines;
  const active = medicines.filter(e => dataOf<'medicines'>(e).status === 'active');
  const due = active.flatMap(entity => {
    const medicine = dataOf<'medicines'>(entity);
    if (!medicine.days.includes(day) || medicine.startDate > today || (medicine.endDate && medicine.endDate < today)) return [];
    return medicine.times.map(time => ({ entity, medicine, time, existing: snapshot.entities.intakes.find(i => { const d = dataOf<'intakes'>(i); return d.medicineId === entity.id && d.date === today && d.scheduledTime === time; }) }));
  }).sort((a, b) => a.time.localeCompare(b.time) || a.medicine.name.localeCompare(b.medicine.name));
  const write = can(snapshot, 'medicines');
  return <div className="stack">
    <header className="page-heading"><div><p className="eyebrow">Your medicine record</p><h1>Medicines</h1><p className="muted">Keep instructions, sources and what happened together. These are patient-reported records, not prescriptions.</p></div><div className="heading-actions"><button className="btn secondary" disabled={!write || busy} onClick={() => setScan(true)}><ScanText size={18} />Scan prescription</button><button className="btn primary" disabled={!write || busy} onClick={() => setEditor('new')}><Plus size={18} />Add medicine</button></div></header>{scan && <PrescriptionScan onClose={() => setScan(false)} />}
    <div className="card-grid"><div className="stat"><Pill aria-hidden="true" /><strong>{can(snapshot, 'medicines', 'read') ? active.length : '—'}</strong><span>Active records</span></div><div className="stat"><Clock3 aria-hidden="true" /><strong>{can(snapshot, 'medicines', 'read') ? due.length : '—'}</strong><span>Scheduled today · IST</span></div><div className="stat"><Check aria-hidden="true" /><strong>{can(snapshot, 'intakes', 'read') ? due.filter(d => d.existing).length : '—'}</strong><span>Occurrences with a record</span></div></div>
    <nav className="tabs" aria-label="Medicine views">{[['today', 'Today'], ['history', 'Intake history'], ['records', 'Medicine list'], ['map', 'Change Map'], ['documents', 'Source documents'], ['reviews', 'Clarifications']].map(([key, label]) => <button key={key} className={`btn ${tab === key ? 'primary' : 'ghost'}`} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {action.error && <Notice error>{action.error}</Notice>}
    {!can(snapshot, 'medicines', 'read') && ['today', 'records', 'map'].includes(tab) && <Notice>Medicine records have not been shared with this account.</Notice>}
    {tab === 'today' && <section className="panel stack" aria-label="Today's occurrences"><div><h2>Today’s occurrences</h2><p className="muted">{today} · Asia/Kolkata · Based only on entered days, dates and times. No time entered means no scheduled occurrence.</p></div>
      <p className="muted small">Report what actually happened, even if the scheduled time is later today. A schedule slot is not an actual intake timestamp or an instruction to take medicine.</p>
      {!can(snapshot, 'intakes', 'read') && <Notice>Intake records are not shared with you; statuses are unavailable.</Notice>}
      {!due.length && <Empty>No occurrences scheduled for today. Add or edit the reported schedule to see it here.</Empty>}
      {due.map(({ entity, medicine, time, existing }) => <article className="panel" key={`${entity.id}-${time}`}><div className="row"><div><span className="chip">{time} IST</span><h3>{medicine.name}</h3><p>{[medicine.strength, medicine.form, medicine.route].filter(Boolean).join(' · ')}</p>{medicine.instructions && <p>{medicine.instructions}</p>}</div><div className="stack"><span className="chip">{!can(snapshot, 'intakes', 'read') ? 'Status unavailable' : existing ? intakeLabels[dataOf<'intakes'>(existing).status] : time > currentTime ? 'Upcoming' : 'Not recorded'}</span><button className="btn secondary" disabled={busy || !can(snapshot, 'intakes') || !can(snapshot, 'intakes', 'read')} onClick={() => setOccurrence({ medicine: entity, time, date: today, existing })}>{existing ? 'Correct record' : 'Record'}</button></div></div>{existing && <><p className="muted">{dataOf<'intakes'>(existing).reason}</p><Provenance entity={existing} /></>}</article>)}
    </section>}
    {tab === 'history' && <section className="panel stack" aria-label="Intake history"><h2>Intake history</h2><p className="muted">Correct the reported status or context without changing the original occurrence. Archiving or editing a medicine schedule does not remove its history.</p>{!can(snapshot, 'intakes', 'read') ? <Notice>Intake records have not been shared with you.</Notice> : !snapshot.entities.intakes.length ? <Empty>No intake history recorded.</Empty> : [...snapshot.entities.intakes].sort((a, b) => { const x = dataOf<'intakes'>(a), y = dataOf<'intakes'>(b); return `${y.date} ${y.scheduledTime}`.localeCompare(`${x.date} ${x.scheduledTime}`); }).map(existing => {
      const d = dataOf<'intakes'>(existing), medicine = medicines.find(m => m.id === d.medicineId);
      return <article className="panel stack" key={existing.id}><h3>{medicine ? dataOf<'medicines'>(medicine).name : 'Medicine details not shared'}</h3><p>{d.date} · {d.scheduledTime} IST · {intakeLabels[d.status]}</p><p>{d.reason}</p><Provenance entity={existing} /><button className="btn secondary" disabled={busy || !can(snapshot, 'intakes')} onClick={() => setOccurrence({ medicine, time: d.scheduledTime, date: d.date, existing })}>Correct record</button></article>;
    })}</section>}
    {tab === 'records' && <section className="stack" aria-label="All medicines">{!medicines.length && <Empty>No medicines entered. Start with the name and instructions from your source.</Empty>}<div className="card-grid">{medicines.map(entity => { const d = dataOf<'medicines'>(entity); const hasIntakes = snapshot.entities.intakes.some(i => dataOf<'intakes'>(i).medicineId === entity.id); return <article className="panel stack" key={entity.id}><div className="row"><h2>{d.name}</h2><span className="chip">{d.status}</span></div><p>{d.ingredient} · {d.strength || 'Strength not entered'}</p><p className="muted">{d.form} · {d.route}</p>{d.instructions && <p>{d.instructions}</p>}<p>{d.times.length ? d.times.join(', ') + ' IST' : 'No times entered'} · {d.days.map(v => weekdays[v]).join(', ')}</p><p className="small">{d.startDate} → {d.endDate || 'No end date entered'} · Stock: {d.stock ?? 'unknown'}</p><p className="small">Reported source: {d.source}</p><Provenance entity={entity} /><div className="row"><button className="btn secondary" disabled={!write || busy || action.pending} onClick={() => setEditor(entity)}><Edit3 size={16} />Edit</button>{d.status === 'active' && <button className="btn ghost" disabled={!write || busy || action.pending} onClick={() => void action.run(() => update(entity, { ...d, status: 'archived' }))}><Archive size={16} />Archive record</button>}<ConfirmButton title="Delete medicine record?" disabled={!write || busy || action.pending || hasIntakes} onConfirm={() => remove(entity)}>Permanently delete this reported record? The service blocks deletion if any intake history refers to it. Archive instead to preserve the record.</ConfirmButton></div>{hasIntakes && <p className="muted small">Intake history exists. Archive rather than delete this record.</p>}</article>; })}</div><p className="muted small">Archiving removes a record from future schedules and preserves intake history; it does not instruct anyone to stop treatment.</p></section>}
    {tab === 'map' && <ChangeMap medicines={active} />}
    {tab === 'documents' && <Documents />}
    {tab === 'reviews' && <Clarifications />}
    {editor && <MedicineEditor entity={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />}
    {occurrence && <IntakeEditor {...occurrence} onClose={() => setOccurrence(null)} />}
  </div>;
}

function MedicineEditor({ entity, onClose }: { entity?: Entity; onClose: () => void }) {
  const { create, update, busy } = useProduct();
  const [d, setD] = useState<MedicineData>(() => entity ? { ...dataOf<'medicines'>(entity) } : { name: '', ingredient: '', strength: '', form: '', route: '', instructions: '', times: [], days: [0, 1, 2, 3, 4, 5, 6], startDate: istDate(), status: 'active', source: '' });
  const [stock, setStock] = useState(d.stock?.toString() ?? '');
  const action = useAction();
  const set = <K extends keyof MedicineData>(key: K, value: MedicineData[K]) => setD(previous => ({ ...previous, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    const { endDate, stock: _stock, ...rest } = d;
    const data: MedicineData = { ...rest, times: [...d.times].sort(), days: [...d.days].sort(), ...(endDate ? { endDate } : {}), ...(stock !== '' ? { stock: Number(stock) } : {}) };
    if (await action.run(() => entity ? update(entity, data) : create('medicines', data))) onClose();
  }
  return <Dialog title={entity ? 'Edit reported medicine' : 'Add reported medicine'} onClose={onClose} busy={busy || action.pending}><form onSubmit={submit} className="stack"><p className="muted">Copy the existing instructions; this form does not calculate or recommend doses.</p><div className="form-grid">
    <Field label="Medicine name"><input autoFocus required maxLength={200} value={d.name} onChange={e => set('name', e.target.value)} /></Field>
    <Field label="Ingredient(s)" hint="Use names confirmed on your source, separated by commas or semicolons. Enter Unknown if not established."><input required maxLength={200} value={d.ingredient} onChange={e => set('ingredient', e.target.value)} /></Field>
    <Field label="Strength (optional)"><input maxLength={200} value={d.strength} onChange={e => set('strength', e.target.value)} /></Field>
    <Field label="Form" hint="Enter Unknown if not established."><input required maxLength={100} value={d.form} onChange={e => set('form', e.target.value)} /></Field>
    <Field label="Route" hint="As written on the source; Unknown is allowed."><input required maxLength={100} value={d.route} onChange={e => set('route', e.target.value)} /></Field>
    <Field label="Status"><select value={d.status} onChange={e => set('status', e.target.value as MedicineData['status'])}><option value="active">Active record</option><option value="archived">Archived record</option></select></Field>
    <Field label="Reported instructions" wide><textarea maxLength={4000} rows={3} value={d.instructions} onChange={e => set('instructions', e.target.value)} /></Field>
    <Field label="Start date"><input type="date" required value={d.startDate} onChange={e => set('startDate', e.target.value)} /></Field>
    <Field label="End date (optional)"><input type="date" min={d.startDate} value={d.endDate ?? ''} onChange={e => set('endDate', e.target.value)} /></Field>
    <Field label="Source / provenance" hint="Identify the label, document, instructions or person you are reporting."><input required maxLength={500} value={d.source} onChange={e => set('source', e.target.value)} /></Field>
    <Field label="Stock count (optional)"><input type="number" min="0" max="1000000" step="1" value={stock} onChange={e => setStock(e.target.value)} /></Field>
  </div><fieldset><legend>Days of the week · IST</legend><div className="row">{weekdays.map((label, index) => <label key={label} className="chip"><input type="checkbox" checked={d.days.includes(index)} onChange={e => set('days', e.target.checked ? [...d.days, index] : d.days.filter(day => day !== index))} />{label}</label>)}</div>{!d.days.length && <Notice error>Select at least one day.</Notice>}</fieldset>
    <fieldset className="stack"><legend>Reported times · IST</legend>{!d.times.length && <p className="muted">No timed reminders or occurrences without an entered time.</p>}{d.times.map((time, index) => <div className="row" key={index}><Field label={`Time ${index + 1}`}><input type="time" required value={time} onChange={e => set('times', d.times.map((v, i) => i === index ? e.target.value : v))} /></Field><button type="button" className="icon-btn" aria-label={`Remove time ${index + 1}`} onClick={() => set('times', d.times.filter((_, i) => i !== index))}><X size={18} /></button></div>)}<button type="button" className="btn secondary" disabled={d.times.length >= 24} onClick={() => set('times', [...d.times, ''])}><Plus size={16} />Add time</button>{new Set(d.times).size !== d.times.length && <Notice error>Each time must be different.</Notice>}</fieldset>
    {action.error && <Notice error>{action.error}</Notice>}<FormActions busy={busy || action.pending} invalid={!d.days.length || new Set(d.times).size !== d.times.length} onClose={onClose} />
  </form></Dialog>;
}

function IntakeEditor({ medicine, date, time, existing, onClose }: { medicine?: Entity; date: string; time: string; existing?: Entity; onClose: () => void }) {
  const { create, update, snapshot, busy } = useProduct();
  const [status, setStatus] = useState<IntakeData['status']>(existing ? dataOf<'intakes'>(existing).status : 'unsure');
  const [reason, setReason] = useState(existing ? dataOf<'intakes'>(existing).reason : '');
  const action = useAction();
  const medicineId = existing ? dataOf<'intakes'>(existing).medicineId : medicine!.id;
  return <Dialog title={`${existing ? 'Correct' : 'Record'} · ${medicine ? dataOf<'medicines'>(medicine).name : 'Medicine details not shared'}`} onClose={onClose} busy={busy || action.pending}><form className="stack" onSubmit={async e => {
    e.preventDefault();
    // A refresh may have added this occurrence while the form was open. Update it, never create a duplicate.
    const target = existing ?? snapshot.entities.intakes.find(i => { const d = dataOf<'intakes'>(i); return d.medicineId === medicineId && d.date === date && d.scheduledTime === time; });
    const data: IntakeData = { medicineId, date, scheduledTime: time, status, reason };
    if (await action.run(() => target ? update(target, data) : create('intakes', data))) onClose();
  }}><p>{date} · {time} IST</p><Field label="What happened?"><select autoFocus value={status} onChange={e => setStatus(e.target.value as IntakeData['status'])}>{Object.entries(intakeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field><Field label="Reason or context (optional)"><textarea maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></Field>{action.error && <Notice error>{action.error}</Notice>}<FormActions busy={busy || action.pending} onClose={onClose} label="Save record" /></form></Dialog>;
}

function ChangeMap({ medicines }: { medicines: Entity[] }) {
  const groups = new Map<string, Entity[]>();
  for (const entity of medicines) for (const ingredient of identities(dataOf<'medicines'>(entity).ingredient)) groups.set(ingredient, [...(groups.get(ingredient) ?? []), entity]);
  const matches = [...groups].filter(([, records]) => records.length > 1);
  const missing = medicines.filter(e => { const ingredient = dataOf<'medicines'>(e).ingredient; return !identities(ingredient).length || ingredient.split(/[;,]/).some(v => unknownIdentity.test(v.trim())); });
  return <section className="panel stack"><div><p className="eyebrow">Entered identity comparison</p><h2>Change Map</h2><p className="muted">Exact shared ingredient names across active records, ignoring case and spacing. No synonym, brand, dose or interaction inference. This is not a clinical check.</p></div>{matches.length ? matches.map(([ingredient, entries]) => <article className="panel" key={ingredient}><h3><Link2 size={18} aria-hidden="true" /> {ingredient}</h3><span className="chip">Possible overlap</span>{entries.map(entity => <div key={entity.id}><p><strong>{dataOf<'medicines'>(entity).name}</strong> · {dataOf<'medicines'>(entity).strength || 'Strength unknown'}</p><p className="small">Entered source: {dataOf<'medicines'>(entity).source}</p><Provenance entity={entity} /></div>)}</article>) : <Empty>No exact shared names found in the entered identities. This does not rule out overlap.</Empty>}<h3>Missing or uncertain identities</h3>{missing.length ? missing.map(entity => <p key={entity.id}>{dataOf<'medicines'>(entity).name} · {dataOf<'medicines'>(entity).ingredient || 'Not entered'} · Source: {dataOf<'medicines'>(entity).source}</p>) : <p className="muted">No entries explicitly marked unknown. Entered identities have not been independently verified.</p>}</section>;
}

function Documents() {
  const { snapshot, spaceId, create, remove, busy } = useProduct();
  const action = useAction();
  if (!can(snapshot, 'documents', 'read')) return <Notice>Source documents have not been shared with you.</Notice>;
  async function upload(file?: File) {
    if (!file) return;
    await action.run(async () => {
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a file no larger than 2 MiB (2,097,152 bytes).');
      if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) throw new Error('Choose a PDF, PNG or JPEG file.');
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] ?? ''); reader.onerror = () => reject(new Error('The file could not be read. Try selecting it again.')); reader.onabort = () => reject(new Error('File reading was cancelled.')); reader.readAsDataURL(file); });
      return create('documents', { name: file.name, mime: file.type as DocumentData['mime'], base64 } satisfies DocumentData);
    });
  }
  return <section className="panel stack"><h2>Source documents</h2><p className="muted">Store the original source for later reference. Files are not read, interpreted or OCR-processed.</p><Field label="Upload PDF, PNG or JPEG · maximum 2 MiB"><input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy || action.pending || !can(snapshot, 'documents')} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void upload(file); }} /></Field>{action.pending && <p role="status"><FileUp size={18} /> Uploading…</p>}{action.error && <Notice error>{action.error}</Notice>}{!snapshot.entities.documents.length && <Empty>No source documents uploaded.</Empty>}{snapshot.entities.documents.map(entity => { const d = entity.data as unknown as DocumentMetadata; return <article className="panel" key={entity.id}><div className="row"><div><h3>{d.name}</h3><p className="muted small">{d.mime} · {(d.size / 1024).toFixed(1)} KiB</p></div><div className="row"><a className="btn secondary" href={`/api/v2/spaces/${encodeURIComponent(spaceId)}/documents/${encodeURIComponent(entity.id)}`} download><Download size={16} />Download</a><ConfirmButton title="Delete source document?" disabled={busy || !can(snapshot, 'documents')} onConfirm={() => remove(entity)}>This deletes the stored source file. Already downloaded copies are not removed.</ConfirmButton></div></div><Provenance entity={entity} /></article>; })}</section>;
}

function Clarifications() {
  const { snapshot, busy } = useProduct();
  const [editor, setEditor] = useState<Entity | 'new' | null>(null);
  if (!can(snapshot, 'reviews', 'read')) return <Notice>Clarification notes have not been shared with you.</Notice>;
  return <section className="panel stack"><div className="row"><div><h2>Clarifications</h2><p className="muted">Patient-recorded questions and external clarification notes, not clinical signoff.</p></div><button className="btn primary" disabled={busy || !can(snapshot, 'reviews')} onClick={() => setEditor('new')}><Plus size={16} />Add question</button></div>{!snapshot.entities.reviews.length && <Empty>No clarification questions recorded.</Empty>}{snapshot.entities.reviews.map(entity => { const d = dataOf<'reviews'>(entity); return <article className="panel" key={entity.id}><div className="row"><h3>{d.title}</h3><span className="chip">{d.status}</span></div><p>{d.question}</p>{d.resolution && <p><strong>Recorded clarification:</strong> {d.resolution}</p>}<Provenance entity={entity} /><button className="btn secondary" disabled={busy || !can(snapshot, 'reviews')} onClick={() => setEditor(entity)}>{d.status === 'open' ? 'Edit / record clarification' : 'Edit clarification'}</button></article>; })}{editor && <ReviewEditor entity={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />}</section>;
}

function ReviewEditor({ entity, onClose }: { entity?: Entity; onClose: () => void }) {
  const { create, update, busy } = useProduct();
  const [d, setD] = useState<ReviewData>(entity ? dataOf<'reviews'>(entity) : { title: '', question: '', status: 'open', resolution: '' });
  const action = useAction();
  return <Dialog title="Clarification note" onClose={onClose} busy={busy || action.pending}><form className="stack" onSubmit={async e => { e.preventDefault(); if (await action.run(() => entity ? update(entity, d) : create('reviews', d))) onClose(); }}><Field label="Title"><input autoFocus required maxLength={500} value={d.title} onChange={e => setD({ ...d, title: e.target.value })} /></Field><Field label="Question"><textarea required maxLength={4000} value={d.question} onChange={e => setD({ ...d, question: e.target.value })} /></Field><Field label="Coordination status"><select value={d.status} onChange={e => setD({ ...d, status: e.target.value as ReviewData['status'] })}><option value="open">Open</option><option value="resolved">Clarification recorded</option></select></Field><Field label="External clarification note" hint="When resolved, record what was clarified, by whom and when. This is your report, not professional approval."><textarea required={d.status === 'resolved'} maxLength={4000} value={d.resolution} onChange={e => setD({ ...d, resolution: e.target.value })} /></Field>{action.error && <Notice error>{action.error}</Notice>}<FormActions busy={busy || action.pending} onClose={onClose} /></form></Dialog>;
}