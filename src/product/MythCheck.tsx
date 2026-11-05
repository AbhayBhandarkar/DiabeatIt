import { useState, type FormEvent } from 'react';
import { ShieldQuestion, Sparkles, ExternalLink, CheckCircle2, XCircle, CircleHelp, CircleDot } from 'lucide-react';
import type { MythCheckResult } from '../../shared/ai';
import { mythExamples, type EvidenceCard } from '../../shared/evidence';
import { ai, type AiSource } from './ai';
import { Notice, useAction } from './ui';

const verdicts = {
  myth: { label: 'Myth', Icon: XCircle }, 'partly-true': { label: 'Partly true', Icon: CircleDot },
  supported: { label: 'Supported by evidence', Icon: CheckCircle2 }, 'not-covered': { label: 'Not in our evidence library', Icon: CircleHelp },
} as const;

export default function MythCheck() {
  const [claim, setClaim] = useState('');
  const [result, setResult] = useState<(MythCheckResult & { evidence: EvidenceCard[]; source: AiSource }) | null>(null);
  const action = useAction();
  async function check(text: string, e?: FormEvent) {
    e?.preventDefault(); setClaim(text); setResult(null);
    if (text.trim().length >= 3) await action.run(async () => setResult(await ai.mythCheck(text.trim())));
  }
  const v = result ? verdicts[result.verdict] : null;
  return <section className="panel myth-check" aria-labelledby="myth-title">
    <div className="myth-head"><span className="myth-icon"><ShieldQuestion size={26} /></span><div><p className="eyebrow">HEARD SOMETHING?</p><h2 id="myth-title">Check a diabetes claim</h2><p className="muted">Type what a relative, a video or a forward told you. The answer uses only our library of reviewed public-health sources.</p></div></div>
    <form className="myth-form" onSubmit={e => void check(claim, e)}><input aria-label="Claim to check" value={claim} maxLength={300} placeholder="e.g. Karela juice can replace my tablets" onChange={e => setClaim(e.target.value)} /><button className="btn primary" disabled={action.pending || claim.trim().length < 3}><Sparkles size={18} />{action.pending ? 'Checking…' : 'Check'}</button></form>
    <div className="row example-chips">{mythExamples.map(x => <button type="button" key={x} className="filter-chip" disabled={action.pending} onClick={() => void check(x)}>{x}</button>)}</div>
    {action.error && <Notice error>{action.error}</Notice>}
    {result && v && <div className={`myth-result verdict-${result.verdict}`} role="status">
      <p className="verdict"><v.Icon size={20} />{v.label}</p>
      <h3>{result.headline}</h3><p>{result.explanation}</p>
      {result.evidence.map(c => <a key={c.id} className="evidence-card" href={c.url} target="_blank" rel="noreferrer"><span><strong>{c.topic}</strong><span className="muted small">{c.source}</span></span><ExternalLink size={16} /></a>)}
      {result.talkToDoctor && <Notice>Before changing any medicine or diet, talk with your doctor.</Notice>}
      <p className="muted small">AI-written explanation, grounded in the linked sources. {result.source.engine === 'on-device' ? `Ran on this device (${result.source.name}).` : ''}</p>
    </div>}
  </section>;
}
