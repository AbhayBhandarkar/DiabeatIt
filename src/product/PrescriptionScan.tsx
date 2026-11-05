import { useEffect, useState } from 'react';
import { Camera, ScanText, Sparkles, Check } from 'lucide-react';
import type { PrescriptionScanResult } from '../../shared/ai';
import type { MedicineData } from '../../shared/v2';
import { useProduct } from './context';
import { ai, photoToDataUrl, type AiSource } from './ai';
import { Dialog, Field, Notice, istDate } from './ui';

const slotTimes = { morning: '08:00', afternoon: '14:00', evening: '18:00', night: '21:00' } as const;
type Draft = PrescriptionScanResult['medicines'][number] & { include: boolean; times: string[] };
const addDays = (date: string, days: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

export default function PrescriptionScan({ onClose }: { onClose: () => void }) {
  const { create } = useProduct();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [image, setImage] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<(PrescriptionScanResult & { source: AiSource }) | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  useEffect(() => { void ai.capabilities().then(c => setAvailable(c.features.prescriptionScan || !!ai.onDeviceName())).catch(() => setAvailable(!!ai.onDeviceName())); }, []);
  const edit = (i: number, patch: Partial<Draft>) => setDrafts(ds => ds.map((d, j) => j === i ? { ...d, ...patch } : d));

  async function read() {
    setBusy(true); setError('');
    try {
      const r = await ai.prescriptionScan(image); setResult(r);
      setDrafts(r.medicines.map(m => ({ ...m, include: m.confidence !== 'low', times: m.timing.map(t => slotTimes[t]) })));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read this photo.'); } finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError('');
    const today = istDate(); let saved = 0;
    for (const d of drafts.filter(x => x.include)) {
      const data: MedicineData = {
        name: d.name.trim(), ingredient: d.ingredient.trim() || 'Not entered', strength: d.strength.trim(), form: d.form.trim() || 'Tablet', route: 'Oral',
        instructions: [d.withFood !== 'unspecified' ? `${d.withFood === 'with' ? 'With' : d.withFood === 'before' ? 'Before' : 'After'} food` : '', d.durationDays ? `for ${d.durationDays} days` : ''].filter(Boolean).join(', '),
        times: [...new Set(d.times)].sort(), days: [0, 1, 2, 3, 4, 5, 6], startDate: today, ...(d.durationDays ? { endDate: addDays(today, d.durationDays - 1) } : {}), status: 'active',
        source: `Prescription photo${result?.prescriber ? ` · ${result.prescriber}` : ''}${result?.date ? ` · ${result.date}` : ''} · read by AI, checked by me`.slice(0, 500),
      };
      if (await create('medicines', data)) saved++; else break;
    }
    setBusy(false);
    if (saved === drafts.filter(x => x.include).length) onClose();
  }

  return <Dialog title="Scan a prescription" onClose={onClose} busy={busy}>
    {!result ? <div className="stack">
      <p>Take a clear photo of the prescription or the medicine strip. AI reads the names and timings; <strong>you check every line before anything is saved.</strong></p>
      <Field label="Open camera or choose a photo"><input type="file" accept="image/*" capture="environment" disabled={busy} onChange={async e => { const f = e.target.files?.[0]; if (!f) return; setError(''); try { setImage(await photoToDataUrl(f, 1600)); } catch (err) { setError(err instanceof Error ? err.message : 'Photo unavailable.'); } }} /></Field>
      {image && <img className="meal-photo" src={image} alt="Prescription photo preview" />}
      {available === false && <Notice>Prescription reading is not connected on this installation. You can still add medicines by hand.</Notice>}
      {available && <label className="toggle-row"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Send this photo to the AI service to read it. The photo is not stored by DiabeatIT. Cover any information you don’t want to share.</span></label>}
      {error && <Notice error>{error}</Notice>}
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!image || !consent || busy || !available} onClick={() => void read()}><ScanText size={18} />{busy ? 'Reading the prescription…' : 'Read with AI'}</button></div>
    </div> : <div className="stack">
      <Notice>AI can misread handwriting. Compare each line with the paper. Times are suggestions from words like “1-0-1” or “after dinner” — change them to match what your doctor said.</Notice>
      {!drafts.length && <p>No medicines could be read. Try a sharper photo in good light.</p>}
      {drafts.map((d, i) => <article className={`scan-draft${d.include ? '' : ' excluded'}`} key={i}>
        <label className="toggle-row"><input type="checkbox" checked={d.include} onChange={e => edit(i, { include: e.target.checked })} /><span><strong>{d.name || 'Unreadable line'}</strong> <span className={`chip confidence-${d.confidence}`}>{d.confidence} confidence</span></span></label>
        <div className="form-grid">
          <Field label="Name on the prescription"><input value={d.name} maxLength={160} onChange={e => edit(i, { name: e.target.value })} /></Field>
          <Field label="Ingredient"><input value={d.ingredient} maxLength={200} placeholder="e.g. Metformin" onChange={e => edit(i, { ingredient: e.target.value })} /></Field>
          <Field label="Strength"><input value={d.strength} maxLength={120} onChange={e => edit(i, { strength: e.target.value })} /></Field>
          <Field label="Form"><input value={d.form} maxLength={60} onChange={e => edit(i, { form: e.target.value })} /></Field>
        </div>
        <fieldset><legend>When</legend><div className="row">{(Object.entries(slotTimes) as [keyof typeof slotTimes, string][]).map(([slot, time]) => <label className="chip" key={slot}><input type="checkbox" checked={d.times.includes(time)} onChange={e => edit(i, { times: e.target.checked ? [...d.times, time] : d.times.filter(t => t !== time) })} />{slot[0].toUpperCase() + slot.slice(1)} · {time}</label>)}</div></fieldset>
      </article>)}
      <p className="muted small"><Sparkles size={14} /> {result.source.engine === 'on-device' ? `Read on this device by ${result.source.name}` : 'Read by the server AI model'}{result.limitations ? ` · ${result.limitations}` : ''}</p>
      {error && <Notice error>{error}</Notice>}
      <div className="modal-actions"><button type="button" className="btn secondary" disabled={busy} onClick={() => { setResult(null); setDrafts([]); }}><Camera size={18} />Try another photo</button><button type="button" className="btn primary" disabled={busy || !drafts.some(d => d.include && d.name.trim())} onClick={() => void save()}><Check size={18} />{busy ? 'Saving…' : `Add ${drafts.filter(d => d.include).length} to my medicines`}</button></div>
    </div>}
  </Dialog>;
}
