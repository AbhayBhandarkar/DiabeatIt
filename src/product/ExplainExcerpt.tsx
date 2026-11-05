import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { LabelExplainResult } from '../../shared/ai';
import { ai } from './ai';
import { Notice, useAction } from './ui';

/** Plain-language rewrite of one official label excerpt. Uses only the excerpt itself. */
export default function ExplainExcerpt({ medicine, section, text }: { medicine: string; section: string; text: string }) {
  const [result, setResult] = useState<LabelExplainResult | null>(null);
  const action = useAction();
  if (text.trim().length < 20) return null;
  return <div className="explain">
    {!result && <button type="button" className="btn ghost" disabled={action.pending} onClick={() => void action.run(async () => setResult(await ai.labelExplain({ medicine: medicine.slice(0, 160), section: section.slice(0, 80), text: text.slice(0, 6000) })))}><Sparkles size={16} />{action.pending ? 'Explaining…' : 'Explain in simple words'}</button>}
    {action.error && <Notice error>{action.error}</Notice>}
    {result && <div className="explain-result"><p className="ai-badge"><Sparkles size={14} />Simple words · AI draft from this excerpt only</p><p>{result.summary}</p>{result.keyPoints.length > 0 && <ul>{result.keyPoints.map(p => <li key={p}>{p}</li>)}</ul>}{result.askPharmacist.length > 0 && <><h5>Ask your pharmacist</h5><ul>{result.askPharmacist.map(p => <li key={p}>{p}</li>)}</ul></>}</div>}
  </div>;
}
