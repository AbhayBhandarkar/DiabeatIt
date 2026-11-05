import { useState, type FormEvent } from 'react';
import { ArrowRight, FileText, Upload, ShieldCheck, GitCompareArrows, Check, Clock3, Download, Trash2, MessageCircle, Plus, AlertCircle } from 'lucide-react';
import { useApp, formatDate, formatTime } from './api';
import { Badge, Notice, Modal, MedicineRow, SectionHeading, Submit, Empty } from './components';
export default function Medicines() {
  const { state, role, act, busy, navigate, notify } = useApp(); const [review, setReview] = useState(false); const [upload, setUpload] = useState(false); const [ack, setAck] = useState(false);
  const canEdit = role !== 'professional' && (role === 'patient' || state.permissions.medicines);
  const canDocs = role === 'patient' || (role === 'companion' && state.permissions.documents);
  async function requestReview(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); if (await act({ type: 'review.add', title: String(f.get('title')), description: String(f.get('description')) })) setReview(false); }
  async function uploadFile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const file = f.get('file') as File;
    if (file.size > 2*1024*1024) { notify('Use a PDF, PNG, or JPEG smaller than 2 MB.'); return; }
    try { const data = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = () => reject(new Error('Could not read the file.')); r.readAsDataURL(file); });
      if (await act({ type: 'document.add', name: file.name, mime: file.type as 'application/pdf', data })) setUpload(false);
    } catch { notify('Could not read this file. Try a different file.'); }
  }
  return <>
    <div className="page-title"><div><p className="eyebrow">LESS GUESSWORK. MORE CLARITY.</p><h1>Your medicines, together.</h1><p>Keep the source. Ask the question. Know which plan is current.</p></div>{canEdit && <button className="button primary" onClick={() => setReview(true)}><Plus size={18}/>Request clarification</button>}</div>
    <div className="notice-row"><Notice>Clinical interaction screening and OCR are not connected. This is a fictional reconciliation workflow, not a medicine safety check.</Notice></div>
    <section className="card change-map"><SectionHeading eyebrow="OUR SHARED PICTURE" title="Prescription Change Map"><Badge tone="amber"><GitCompareArrows size={13}/> DEMONSTRATION</Badge></SectionHeading><div className="comparison-grid"><div className="prescription-sheet"><span className="document-label"><FileText size={17}/> DEMO PRESCRIPTION A</span><h3>Existing recorded plan</h3><div className="rx-line"><strong>Metformin</strong><span>500 mg · ingredient confirmed in fixture</span></div><div className="rx-line"><strong>Atorvastatin</strong><span>10 mg · existing fictional entry</span></div><p className="caption">Illustrative structured fixture, not an uploaded or OCR-extracted prescription.</p></div><div className="comparison-link"><GitCompareArrows size={25}/><span>Compare<br/>the source</span></div><div className="prescription-sheet pending-sheet"><span className="document-label"><FileText size={17}/> DEMO PRESCRIPTION B</span><h3>New document to clarify</h3><div className="rx-line"><strong>Metformin-containing combination</strong><span>Strength and instructions need confirmation</span></div><Badge tone="amber">Possible shared ingredient</Badge><p className="caption">Replacement intent unknown. Not activated. No stop or continue decision has been made.</p></div></div><div className="card-foot"><ShieldCheck size={17}/> A missing medicine on a new prescription does not mean it was stopped.</div></section>
    <div className="content-grid"><div className="main-column"><section className="card"><SectionHeading eyebrow={`DOCUMENTED DEMO PLAN · VERSION ${state.plan.version}`} title="Current recorded routine"><Badge tone="green">{state.plan.acknowledged ? 'Acknowledged' : 'Needs acknowledgement'}</Badge></SectionHeading>{state.medicines.map(m => <MedicineRow key={m.id} medicine={m}/>)}<div className="plan-note"><strong>Plan note</strong><p>{state.plan.note}</p><small>{state.plan.approvedBy} · {formatDate(state.plan.approvedAt)}</small></div>{role === 'patient' && !state.plan.acknowledged && <button className="button primary" onClick={() => setAck(true)}>Read back & acknowledge<Check size={18}/></button>}</section>
    <section className="card"><SectionHeading title="Prescription documents">{canDocs && <button className="button secondary small" onClick={() => setUpload(true)}><Upload size={17}/>Upload</button>}</SectionHeading>{state.documents.length ? state.documents.map(d => <div className="document-row" key={d.id}><span className="icon-tile sand"><FileText/></span><div className="grow"><strong>{d.name}</strong><p>{formatDate(d.at)} · {d.author}</p><Badge>Not clinically reviewed · OCR unavailable</Badge></div><a className="icon-button" aria-label={`Download ${d.name}`} href={`/api/documents/${d.id}`}><Download size={20}/></a>{canDocs && <button className="icon-button" aria-label={`Remove ${d.name}`} onClick={() => { if (confirm('Remove this demo document?')) void act({ type: 'document.delete', id: d.id }); }}><Trash2 size={19}/></button>}</div>) : <Empty title={canDocs ? 'Keep the original close' : 'Documents are not shared'}>{canDocs ? 'Upload a fictional PDF or image. Documents stay private to this demo session.' : 'The patient controls document access in Care Circle.'}</Empty>}</section></div>
    <aside className="side-column"><section className="card"><SectionHeading title="Clarification requests"/>{state.reviews.map(r => <article className="review-mini" key={r.id}><Badge tone={r.status === 'resolved' ? 'green' : 'amber'}>{r.status.replace('clarification', 'Awaiting clarification')}</Badge><h3>{r.title}</h3><p>{r.description}</p>{r.note && <div className="review-answer"><MessageCircle size={16}/><p>{r.note}</p></div>}<small>{formatDate(r.createdAt)} · {r.author}</small></article>)}<button className="text-button" onClick={() => navigate('care')}>See care handover<ArrowRight size={17}/></button></section></aside></div>
    <section className="card"><SectionHeading title="Recent recording history"><Clock3 size={20}/></SectionHeading>{state.intakes.length ? <div className="timeline">{state.intakes.slice(0,12).map(i => <div key={i.id}><span className="timeline-dot"/><div><strong>{state.medicines.find(m=>m.id===i.medicineId)?.name} · {i.status.replace('-', ' ')}</strong><p>{formatDate(i.at)} {formatTime(i.at)} IST · {i.author}{i.reason && ` · ${i.reason}`}</p></div></div>)}</div> : <p className="muted">No intake events recorded yet. Unrecorded does not mean not taken.</p>}</section>
    {review && <Modal title="Request medication clarification" onClose={() => setReview(false)}><Notice>This goes to the fictional reviewer in your demo—not a real clinical service.</Notice><form onSubmit={requestReview}><label>What needs clarification?<input name="title" required maxLength={150} placeholder="e.g. Does my new prescription replace the old one?" autoFocus/></label><label>What should the reviewer know?<textarea name="description" rows={4} maxLength={1000} required placeholder="Include what is unclear. Do not enter real patient information."/></label><Submit>Submit demo request</Submit></form></Modal>}
    {upload && <Modal title="Upload a fictional prescription" onClose={() => setUpload(false)}><Notice tone="warning">Do not upload real patient records. No OCR or malware-scanning service is connected; this demo accepts only PDF, PNG, or JPEG files.</Notice><form onSubmit={uploadFile}><label>Document · maximum 2 MB<input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required/></label><label className="checkbox-label"><input type="checkbox" required/>This document contains fictional information only.</label><Submit>Upload document</Submit></form></Modal>}
    {ack && <Modal title="A little clarity check" onClose={() => setAck(false)}>
      <Badge>DEMO PLAN VERSION {state.plan.version}</Badge><p>{state.plan.note}</p>
      <form onSubmit={async e => {
        e.preventDefault();
        if (new FormData(e.currentTarget).get('understanding') !== 'current') {
          notify('It is okay to be unsure. Your acknowledgement was not recorded; request clarification.');
          return;
        }
        if (await act({ type: 'plan.acknowledge' })) setAck(false);
      }}>
        <label>Which plan is documented as current?
          <select name="understanding" required defaultValue="">
            <option value="" disabled>Choose an answer</option>
            <option value="current">Version {state.plan.version}, shown here</option>
            <option value="unsure">I’m unsure</option>
          </select>
        </label>
        <p className="caption">If unsure, close this check and request clarification. Acknowledgement is not a treatment instruction.</p>
        <label className="checkbox-label"><input type="checkbox" required/>I have read the fictional plan note and know I can ask for clarification.</label>
        <Submit>Acknowledge demo plan</Submit>
      </form>
    </Modal>}
  </>;
}