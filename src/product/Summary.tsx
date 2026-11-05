import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Sparkles, ShieldCheck, AlertTriangle, HelpCircle, Cpu } from 'lucide-react';
import type { TimelineSummaryResult } from '../../shared/ai';
import type { AiSource } from './ai';

/** Renders a QR code locally (no network) as an accessible image. */
export function QrImage({ value, label, size = 220 }: { value: string; label: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#14112b', light: '#ffffff' } }).then(url => { if (live) setSrc(url); });
    return () => { live = false; };
  }, [value, size]);
  return <div className="qr-frame" style={{ width: size + 24 }}>{src ? <img src={src} width={size} height={size} alt={label} /> : <div style={{ width: size, height: size }} aria-hidden="true" />}</div>;
}

const kindIcon = { overview: Sparkles };
export function SummaryView({ summary, source, onRef, audience }: { summary: TimelineSummaryResult & { generatedAt?: string }; source?: AiSource | null; onRef?: (ref: string) => void; audience: 'patient' | 'clinician' }) {
  const Icon = kindIcon.overview;
  return <section className="ai-summary" aria-label="AI summary">
    <div className="ai-summary-head"><span className="ai-badge"><Icon size={16} />AI draft</span>{source && <span className="muted small"><Cpu size={14} /> {source.engine === 'on-device' ? `On-device · ${source.name}` : 'Server model'}{summary.generatedAt ? ` · ${new Date(summary.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}` : ''}</span>}</div>
    <p className="ai-overview">{summary.overview}</p>
    {summary.sections.map(s => <div className="ai-section" key={s.heading}><h3>{s.heading}</h3><ul>{s.points.map((p, i) => <li key={i}><span>{p.text}</span>{p.refs.length > 0 && <span className="ref-chips">{p.refs.map(r => <button type="button" key={r} className="ref-chip" onClick={() => onRef?.(r)} aria-label={`Show source record ${r}`}>{r}</button>)}</span>}</li>)}</ul></div>)}
    <div className="ai-columns">
      {summary.questionsForVisit.length > 0 && <div><h3><HelpCircle size={18} />{audience === 'clinician' ? 'Questions the patient may raise' : 'Questions to ask'}</h3><ul>{summary.questionsForVisit.map(q => <li key={q}>{q}</li>)}</ul></div>}
      {summary.dataGaps.length > 0 && <div><h3><AlertTriangle size={18} />Missing information</h3><ul>{summary.dataGaps.map(q => <li key={q}>{q}</li>)}</ul></div>}
    </div>
    <p className="ai-disclaimer"><ShieldCheck size={16} />{audience === 'clinician' ? 'Generated from patient-reported records. Each point links to its source record; verify before clinical use. No diagnosis or recommendation is made.' : 'Made only from what you recorded. Each point links to its record. It does not diagnose or advise — your doctor decides.'}</p>
  </section>;
}
