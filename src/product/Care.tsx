import { useEffect, useState } from 'react';
import { Check, Copy, Download, Edit3, Plus, Printer, Share2, Users } from 'lucide-react';
import { entityKinds, type AcceptInviteResponse, type Entity, type EntityKind, type InviteResponse, type QuestionData, type Scope, type SymptomData, type TaskData } from '../../shared/v2';
import { useProduct } from './context';
import { can, ConfirmButton, dataOf, Dialog, Empty, Field, FormActions, fromIST, istDate, istInput, Notice, Provenance, stamp, useAction } from './ui';

const kindLabels: Record<EntityKind, string> = { medicines: 'Medicines', intakes: 'Intake records', glucose: 'Glucose readings', meals: 'Meals', recipes: 'Recipes', documents: 'Source documents', questions: 'Questions', tasks: 'Tasks', symptoms: 'Symptom notes', lessons: 'Learning progress', reviews: 'Clarifications', appointments: 'Appointments', labs: 'Lab results' };
const intakeLabels = { taken: 'Taken', 'not-taken': 'Not taken', unsure: 'Unsure' };
function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function Care() {
  const { spaceId, snapshot } = useProduct();
  const [summary, setSummary] = useState(false);
  return <div className="stack" key={spaceId}>
    <header className="page-heading"><div><p className="eyebrow">HELP FROM SOMEONE YOU TRUST</p><h1>People & access</h1><p className="muted">Choose who can help and what they can see. No daily checklists required.</p></div></header>
    <Sharing/>
    <section className="panel"><div className="row"><div><h2>Taking someone to your appointment?</h2><p className="muted">Make a summary from records already here. There’s nothing extra to fill in.</p></div><button className="btn secondary" onClick={()=>setSummary(true)}>Prepare a summary</button></div></section>
    {summary && <Appointment onClose={()=>setSummary(false)}/>}
  </div>;
}

function CareWorkspace() {
  const { snapshot, busy, update, remove } = useProduct();
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).has('invite') ? 'sharing' : 'coordination');
  const [task, setTask] = useState<Entity | 'new' | null>(null);
  const [question, setQuestion] = useState<Entity | 'new' | null>(null);
  const [symptom, setSymptom] = useState(false);
  const [appointment, setAppointment] = useState(false);
  const [date, setDate] = useState(istDate());
  const action = useAction();
  const intakes = snapshot.entities.intakes.filter(e => dataOf<'intakes'>(e).date === date).sort((a, b) => dataOf<'intakes'>(a).scheduledTime.localeCompare(dataOf<'intakes'>(b).scheduledTime));
  const medicineName = (id: string) => { const medicine = snapshot.entities.medicines.find(e => e.id === id); return medicine ? dataOf<'medicines'>(medicine).name : 'Medicine identity not available in this shared view'; };
  return <div className="stack"><header className="page-heading"><div><p className="eyebrow">Shared, with permission</p><h1>Care circle</h1><p className="muted">Coordinate practical next steps and keep a factual handover. Every record retains its latest author.</p></div><button className="btn secondary" onClick={() => setAppointment(true)}><Download size={18} />Prepare appointment summary</button></header>
    <nav className="tabs" aria-label="Care views">{[['coordination', 'Tasks & questions'], ['symptoms', 'Symptom notes'], ['handover', 'Handover'], ['sharing', 'People & access']].map(([key, label]) => <button className={`btn ${tab === key ? 'primary' : 'ghost'}`} key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>{action.error && <Notice error>{action.error}</Notice>}
    {tab === 'coordination' && <div className="split"><section className="panel stack"><div className="row"><h2>Shared tasks</h2><button className="btn primary" disabled={busy || !can(snapshot, 'tasks')} onClick={() => setTask('new')}><Plus size={16} />Add task</button></div>{!can(snapshot, 'tasks', 'read') ? <Notice>Tasks have not been shared with you.</Notice> : !snapshot.entities.tasks.length ? <Empty>No shared tasks. Add a practical next step and a due date.</Empty> : [...snapshot.entities.tasks].sort((a, b) => dataOf<'tasks'>(a).dueDate.localeCompare(dataOf<'tasks'>(b).dueDate)).map(entity => { const d = dataOf<'tasks'>(entity); return <article className="panel stack" key={entity.id}><div className="row"><h3>{d.title}</h3><span className="chip">{d.status === 'done' ? 'Completed' : 'Open'}</span></div><p className="muted">Assigned to: {d.assignee || 'Unassigned'} · Due {d.dueDate}</p><Provenance entity={entity} /><div className="row"><button className="btn secondary" disabled={busy || action.pending || !can(snapshot, 'tasks')} onClick={() => void action.run(() => update(entity, { ...d, status: d.status === 'done' ? 'open' : 'done' }))}><Check size={16} />{d.status === 'done' ? 'Reopen' : 'Complete'}</button><button className="btn ghost" disabled={busy || !can(snapshot, 'tasks')} onClick={() => setTask(entity)}><Edit3 size={16} />Edit</button><ConfirmButton title="Delete task?" disabled={busy || !can(snapshot, 'tasks')} onConfirm={() => remove(entity)}>Delete this task from the shared space?</ConfirmButton></div></article>; })}</section>
    <section className="panel stack"><div className="row"><h2>Questions to bring</h2><button className="btn primary" disabled={busy || !can(snapshot, 'questions')} onClick={() => setQuestion('new')}><Plus size={16} />Add question</button></div>{!can(snapshot, 'questions', 'read') ? <Notice>Questions have not been shared with you.</Notice> : !snapshot.entities.questions.length ? <Empty>Keep questions here for your next conversation.</Empty> : snapshot.entities.questions.map(entity => <article className="panel stack" key={entity.id}><p>{dataOf<'questions'>(entity).text}</p><Provenance entity={entity} /><div className="row"><button className="btn secondary" disabled={busy || !can(snapshot, 'questions')} onClick={() => setQuestion(entity)}><Edit3 size={16} />Edit</button><ConfirmButton title="Delete question?" disabled={busy || !can(snapshot, 'questions')} onConfirm={() => remove(entity)}>Remove this question from the shared list?</ConfirmButton></div></article>)}</section></div>}
    {tab === 'symptoms' && <section className="panel stack"><div className="row"><div><h2>Symptom notes</h2><p className="muted">Record what you noticed and when. Notes do not establish a cause. This journal is not monitored for urgent care.</p></div><button className="btn primary" disabled={busy || !can(snapshot, 'symptoms')} onClick={() => setSymptom(true)}><Plus size={16} />Log symptom</button></div>{!can(snapshot, 'symptoms', 'read') ? <Notice>Symptom notes have not been shared with you.</Notice> : !snapshot.entities.symptoms.length ? <Empty>No symptom notes recorded.</Empty> : [...snapshot.entities.symptoms].sort((a, b) => dataOf<'symptoms'>(b).at.localeCompare(dataOf<'symptoms'>(a).at)).map(entity => <article className="panel" key={entity.id}><div className="row"><div><p>{dataOf<'symptoms'>(entity).text}</p><p className="muted">Observed {stamp(dataOf<'symptoms'>(entity).at)}</p></div><ConfirmButton title="Delete symptom note?" disabled={busy || !can(snapshot, 'symptoms')} onConfirm={() => remove(entity)}>Delete this recorded observation?</ConfirmButton></div><Provenance entity={entity} /></article>)}</section>}
    {tab === 'handover' && <section className="panel stack"><div><h2>Factual handover</h2><p className="muted">Recorded occurrences only. No entry means unknown, not “not taken”. Authors below are the latest writers, not necessarily the person who took the medicine.</p></div><Field label="Occurrence date · IST"><input type="date" required max={istDate()} value={date} onChange={e => setDate(e.target.value)} /></Field>{!can(snapshot, 'intakes', 'read') ? <Notice>Intake records have not been shared with you.</Notice> : !intakes.length ? <Empty>No intake records for this date.</Empty> : intakes.map(entity => { const d = dataOf<'intakes'>(entity); return <article className="panel" key={entity.id}><div className="row"><h3>{medicineName(d.medicineId)}</h3><span className="chip">{intakeLabels[d.status]}</span></div><p>{d.date} · {d.scheduledTime} IST</p>{d.reason && <p>Recorded context: {d.reason}</p>}<Provenance entity={entity} /></article>; })}</section>}
    {tab === 'sharing' && <Sharing />}
    {task && <TaskEditor entity={task === 'new' ? undefined : task} onClose={() => setTask(null)} />}{question && <QuestionEditor entity={question === 'new' ? undefined : question} onClose={() => setQuestion(null)} />}{symptom && <SymptomEditor onClose={() => setSymptom(false)} />}{appointment && <Appointment onClose={() => setAppointment(false)} />}
  </div>;
}

function Sharing() {
  const { me, snapshot, spaceId, request, refresh, notify, busy } = useProduct();
  const [label, setLabel] = useState('');
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get('invite') ?? '');
  const [accepted, setAccepted] = useState(false);
  const [copied, setCopied] = useState('');
  const action = useAction();
  const acceptAction = useAction();
  const owner = snapshot.space.role === 'owner';
  const inviteLink = invite ? `${window.location.origin}/?invite=${encodeURIComponent(invite.token)}` : '';
  useEffect(() => {
    // Remove the bearer token from the visible address once it is in the acceptance form.
    const url = new URL(window.location.href);
    if (url.searchParams.has('invite')) { url.searchParams.delete('invite'); window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash); }
  }, []);
  function toggle(kind: EntityKind, mode: 'read' | 'write', checked: boolean) {
    setScopes(previous => {
      const next = new Set(previous);
      if (checked) { next.add(`${kind}:${mode}`); if (mode === 'write') next.add(`${kind}:read`); }
      else { next.delete(`${kind}:${mode}`); if (mode === 'read') next.delete(`${kind}:write`); }
      return [...next];
    });
  }
  return <div className="stack"><section className="panel stack"><div><h2><Users size={22} aria-hidden="true" /> People & access</h2><p className="muted">Signed in as {me.user.name}. Sharing is specific to {snapshot.space.name}; a label does not verify a person’s identity or professional credentials.</p></div>{!owner ? <Notice>Only the owner manages invitations and access. Your permissions: {snapshot.space.scopes.join(', ')}.</Notice> : <>
    <form className="stack" onSubmit={async e => { e.preventDefault(); await action.run(async () => { const result = await request<InviteResponse>(`/spaces/${encodeURIComponent(spaceId)}/invitations`, 'POST', { label, scopes }); setInvite(result); setCopied(''); await refresh(); notify('Invitation created. Share the one-time link privately.'); }); }}><Field label="Invitation label"><input required maxLength={100} value={label} onChange={e => setLabel(e.target.value)} placeholder="A label you will recognize" /></Field><fieldset className="stack"><legend>Choose access for each record type</legend><p className="muted small">Write access includes reading, creating, editing and deleting that record type. Unchecking Read also removes Write.</p><div className="table-wrap"><table><thead><tr><th scope="col">Record type</th><th scope="col">Read</th><th scope="col">Write</th></tr></thead><tbody>{entityKinds.map(kind => <tr key={kind}><th scope="row">{kindLabels[kind]}</th><td><input type="checkbox" aria-label={`Read ${kindLabels[kind]}`} checked={scopes.includes(`${kind}:read`)} onChange={e => toggle(kind, 'read', e.target.checked)} /></td><td><input type="checkbox" aria-label={`Write ${kindLabels[kind]}`} checked={scopes.includes(`${kind}:write`)} onChange={e => toggle(kind, 'write', e.target.checked)} /></td></tr>)}</tbody></table></div></fieldset><p className="muted">The link is single-use, expires after 48 hours, and is not emailed automatically. Anyone holding it can accept the selected access while signed in.</p><button className="btn primary" disabled={busy || action.pending || !scopes.length || !!invite}><Share2 size={18} />{action.pending ? 'Creating…' : 'Create one-time invitation'}</button></form>
    {invite && <section className="panel stack" aria-label="New one-time invitation"><h3>Save this link now</h3><p>Expires {stamp(invite.expiresAt)}. The token is shown only after creation; it cannot be retrieved later.</p><Field label="Private one-time invitation link"><input readOnly value={inviteLink} onFocus={e => e.target.select()} /></Field><div className="row"><button className="btn primary" onClick={async () => { try { await navigator.clipboard.writeText(inviteLink); setCopied('Link copied. Share it only with the intended person.'); } catch { setCopied('Clipboard unavailable. Select the link above and copy it manually.'); } }}><Copy size={16} />Copy link</button><button className="btn secondary" onClick={() => { setInvite(null); setCopied(''); setLabel(''); setScopes([]); }}>I have saved it · hide link</button></div>{copied && <Notice>{copied}</Notice>}</section>}
    {action.error && <Notice error>{action.error}</Notice>}<h3>Current access</h3>{!snapshot.grants.length && <Empty>No companion access granted.</Empty>}{snapshot.grants.map(grant => <article className="panel" key={grant.id}><div className="row"><div><h3>{grant.name}</h3><p>{grant.label}</p><p className="small muted">Granted {stamp(grant.createdAt)}</p></div><ConfirmButton label="Revoke access" title={`Revoke access for ${grant.name}?`} disabled={busy} onConfirm={async () => { await request(`/spaces/${encodeURIComponent(spaceId)}/grants/${encodeURIComponent(grant.id)}`, 'DELETE'); await refresh(); notify('Access revoked.'); }}>Their access to this space will end. Existing downloaded copies cannot be recalled, and contributed records remain.</ConfirmButton></div><p className="small">{grant.scopes.join(', ')}</p></article>)}
    <h3>Outstanding invitations</h3>{!snapshot.invitations.length && <Empty>No outstanding invitations.</Empty>}{snapshot.invitations.map(invitation => <article className="panel" key={invitation.id}><div className="row"><div><h3>{invitation.label}</h3><p className="muted">Expires {stamp(invitation.expiresAt)}</p></div><ConfirmButton label="Cancel invitation" title="Cancel this invitation?" disabled={busy} onConfirm={async () => { await request(`/spaces/${encodeURIComponent(spaceId)}/invitations/${encodeURIComponent(invitation.id)}`, 'DELETE'); if (invite?.id === invitation.id) setInvite(null); await refresh(); notify('Invitation cancelled.'); }}>The unused link will no longer grant access.</ConfirmButton></div><p className="small">{invitation.scopes.join(', ')}</p></article>)}
    </>}</section>
    <section className="panel stack"><h2>Accept an invitation</h2><p className="muted">Paste a token or invitation link from someone you trust. Acceptance adds their shared space to this account, not to the currently selected patient record.</p><form className="stack" onSubmit={async e => { e.preventDefault(); await acceptAction.run(async () => { let value = token.trim(); if (value.includes('://')) { const url = new URL(value); if (url.origin !== window.location.origin) throw new Error('Use an invitation link from this application’s origin.'); value = url.searchParams.get('invite') ?? ''; } if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Enter the complete 64-character invitation token or its link.'); await request<AcceptInviteResponse>('/invitations/accept', 'POST', { token: value }); setToken(''); setAccepted(true); await refresh(); notify('Invitation accepted. Choose the shared space from the space selector.'); }); }}><Field label="Invitation token or link"><input autoComplete="off" spellCheck={false} required maxLength={2048} value={token} onChange={e => { setToken(e.target.value); setAccepted(false); }} /></Field><button className="btn primary" disabled={busy || acceptAction.pending || !token.trim()}>{acceptAction.pending ? 'Accepting…' : 'Accept invitation'}</button></form>{acceptAction.error && <Notice error>{acceptAction.error}</Notice>}{accepted && <Notice>Invitation accepted. Select the newly shared space in the account’s space selector. <button className="btn ghost" onClick={() => window.location.reload()}>Reload account spaces</button></Notice>}</section>
  </div>;
}

function TaskEditor({ entity, onClose }: { entity?: Entity; onClose: () => void }) {
  const { create, update, busy } = useProduct();
  const [d, setD] = useState<TaskData>(entity ? dataOf<'tasks'>(entity) : { title: '', assignee: '', dueDate: istDate(), status: 'open' });
  const action = useAction();
  return <Dialog title={entity ? 'Edit task' : 'Add shared task'} onClose={onClose} busy={busy || action.pending}><form className="stack" onSubmit={async e => { e.preventDefault(); if (await action.run(() => entity ? update(entity, d) : create('tasks', d))) onClose(); }}><Field label="Task"><input autoFocus required maxLength={500} value={d.title} onChange={e => setD({ ...d, title: e.target.value })} /></Field><Field label="Assignee (optional)" hint="A coordination label only; this does not invite or notify someone."><input maxLength={200} value={d.assignee} onChange={e => setD({ ...d, assignee: e.target.value })} /></Field><Field label="Due date"><input type="date" required value={d.dueDate} onChange={e => setD({ ...d, dueDate: e.target.value })} /></Field><Field label="Status"><select value={d.status} onChange={e => setD({ ...d, status: e.target.value as TaskData['status'] })}><option value="open">Open</option><option value="done">Completed</option></select></Field>{action.error && <Notice error>{action.error}</Notice>}<FormActions busy={busy || action.pending} onClose={onClose} /></form></Dialog>;
}

function QuestionEditor({ entity, onClose }: { entity?: Entity; onClose: () => void }) {
  const { create, update, busy } = useProduct();
  const [text, setText] = useState(entity ? dataOf<'questions'>(entity).text : '');
  const action = useAction();
  return <Dialog title={entity ? 'Edit question' : 'Add a question'} onClose={onClose} busy={busy || action.pending}><form className="stack" onSubmit={async e => { e.preventDefault(); const data: QuestionData = { text }; if (await action.run(() => entity ? update(entity, data) : create('questions', data))) onClose(); }}><Field label="Question to bring"><textarea autoFocus required rows={5} maxLength={4000} value={text} onChange={e => setText(e.target.value)} /></Field>{action.error && <Notice error>{action.error}</Notice>}<FormActions busy={busy || action.pending} onClose={onClose} /></form></Dialog>;
}

function SymptomEditor({ onClose }: { onClose: () => void }) {
  const { create, busy } = useProduct();
  const [text, setText] = useState('');
  const [at, setAt] = useState(istInput());
  const action = useAction();
  return <Dialog title="Log a symptom observation" onClose={onClose} busy={busy || action.pending}><form className="stack" onSubmit={async e => { e.preventDefault(); if (await action.run(async () => { const time = fromIST(at); if (Date.parse(time) > Date.now()) throw new Error('Choose a time that has already occurred.'); return create('symptoms', { text, at: time } satisfies SymptomData); })) onClose(); }}><Field label="What did you notice?"><textarea autoFocus required rows={4} maxLength={4000} value={text} onChange={e => setText(e.target.value)} /></Field><Field label="Observed at · IST"><input required type="datetime-local" max={istInput()} value={at} onChange={e => setAt(e.target.value)} /></Field>{action.error && <Notice error>{action.error}</Notice>}<FormActions busy={busy || action.pending} onClose={onClose} label="Save observation" /></form></Dialog>;
}

function Appointment({ onClose }: { onClose: () => void }) {
  const { snapshot } = useProduct();
  const [from, setFrom] = useState(istDate());
  const [to, setTo] = useState(istDate());
  const [copy, setCopy] = useState('');
  const author = (e: Entity) => `Latest writer: ${e.author.name} (${e.author.role}), ${stamp(e.updatedAt)}`;
  const lines: string[] = [`APPOINTMENT PREPARATION — ${snapshot.space.name}`, `Prepared ${stamp(new Date().toISOString())}`, `Observation dates: ${from} to ${to} inclusive, IST`, 'Patient-reported records. Not a clinical interpretation. Missing records mean unknown.', 'Only data accessible to this account are included.', '', 'MEDICINE RECORDS (current snapshot)'];
  const list = (kind: EntityKind, entries: string[]) => lines.push(...(!can(snapshot, kind, 'read') ? ['Not shared with this account.'] : entries.length ? entries : ['No records in this view.']), '');
  list('medicines', snapshot.entities.medicines.map(e => { const d = dataOf<'medicines'>(e); return `${d.name} | ${d.ingredient} | ${d.strength || 'strength unknown'} | ${d.form} | ${d.route} | ${d.status}\nReported instructions: ${d.instructions || 'not entered'}\nSchedule: ${d.times.join(', ') || 'no times'} IST; weekdays (Sun=0): ${d.days.join(', ')}; ${d.startDate} to ${d.endDate || 'no end date'}\nSource: ${d.source}\n${author(e)}`; }));
  lines.push('INTAKE RECORDS (selected dates)');
  list('intakes', snapshot.entities.intakes.filter(e => { const d = dataOf<'intakes'>(e); return d.date >= from && d.date <= to; }).sort((a, b) => { const x = dataOf<'intakes'>(a), y = dataOf<'intakes'>(b); return `${x.date}${x.scheduledTime}`.localeCompare(`${y.date}${y.scheduledTime}`); }).map(e => { const d = dataOf<'intakes'>(e); const medicine = snapshot.entities.medicines.find(m => m.id === d.medicineId); return `${d.date} ${d.scheduledTime} IST | ${medicine ? dataOf<'medicines'>(medicine).name : 'Medicine identity unavailable'} | ${intakeLabels[d.status]}${d.reason ? ` | ${d.reason}` : ''}\n${author(e)}`; }));
  lines.push('SYMPTOM OBSERVATIONS (selected dates; no causality inferred)');
  list('symptoms', snapshot.entities.symptoms.filter(e => { const date = istDate(dataOf<'symptoms'>(e).at); return date >= from && date <= to; }).map(e => `${stamp(dataOf<'symptoms'>(e).at)} | ${dataOf<'symptoms'>(e).text}\n${author(e)}`));
  lines.push('GLUCOSE OBSERVATIONS (selected dates; no target range inferred)');
  list('glucose', snapshot.entities.glucose.filter(e => { const date = istDate(dataOf<'glucose'>(e).measuredAt); return date >= from && date <= to; }).map(e => { const d = dataOf<'glucose'>(e); return `${stamp(d.measuredAt)} | ${d.value} ${d.unit} | ${d.context}\n${author(e)}`; }));
  lines.push('CLARIFICATION NOTES (patient-reported, not clinical signoff)');
  list('reviews', snapshot.entities.reviews.map(e => { const d = dataOf<'reviews'>(e); return `${d.title} | ${d.status}\n${d.question}\n${d.resolution || 'No clarification recorded'}\n${author(e)}`; }));
  lines.push('QUESTIONS (current list)'); list('questions', snapshot.entities.questions.map(e => `${dataOf<'questions'>(e).text}\n${author(e)}`));
  lines.push('TASKS (current list)'); list('tasks', snapshot.entities.tasks.map(e => { const d = dataOf<'tasks'>(e); return `${d.title} | ${d.status} | Due ${d.dueDate} | ${d.assignee || 'Unassigned'}\n${author(e)}`; }));
  const text = lines.join('\n');
  const invalid = !from || !to || from > to;
  return <Dialog title="Prepare an appointment summary" onClose={onClose}><div className="stack"><p className="muted no-print">Review the factual preview before downloading. The report contains private health information. No source files, inaccessible collections or inferred causes are included.</p><div className="form-grid no-print"><Field label="Observations from · IST"><input required type="date" max={to} value={from} onChange={e => { setFrom(e.target.value); setCopy(''); }} /></Field><Field label="Observations through · IST"><input required type="date" min={from} max={istDate()} value={to} onChange={e => { setTo(e.target.value); setCopy(''); }} /></Field></div>{invalid ? <Notice error>Choose a valid date range.</Notice> : <><div className="no-print"><Field label="Summary preview"><textarea readOnly rows={18} value={text} /></Field></div><div className="p-print-report"><h1>Appointment Ready</h1><pre>{text}</pre></div></>}{copy && <Notice>{copy}</Notice>}<div className="modal-actions"><button className="btn secondary" onClick={onClose}>Close</button><button className="btn secondary" disabled={invalid} onClick={async () => { try { await navigator.clipboard.writeText(text); setCopy('Summary copied.'); } catch { setCopy('Clipboard unavailable. Select and copy the preview manually.'); } }}><Copy size={16} />Copy</button><button className="btn secondary" disabled={invalid} onClick={() => window.print()}><Printer size={16}/>Print / PDF</button><button className="btn primary" disabled={invalid} onClick={() => downloadText(text, `appointment-${from}-to-${to}.txt`)}><Download size={16} />Download text</button></div></div></Dialog>;
}