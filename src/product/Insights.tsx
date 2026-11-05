import { useEffect, useRef, useState } from 'react';
import { BookOpen, ExternalLink, Filter, Search, ShieldCheck } from 'lucide-react';
import type { DrugLabel, LabelSections, LabelsResponse, MedicineSearchResponse } from '../../shared/v2';
import { useProduct } from './context';
import { Empty, errorText, Field, Loading, Notice } from './ui';
import { referenceName } from '../../shared/medicineNames';
import MedicineComparison from './MedicineComparison';
import ExplainExcerpt from './ExplainExcerpt';

const sections: { key: keyof LabelSections; title: string }[] = [
  { key: 'adverse_reactions', title: 'Adverse reactions' },
  { key: 'warnings', title: 'Warnings' },
  { key: 'drug_interactions', title: 'Interactions' },
  { key: 'indications_and_usage', title: 'Indications' },
];
function labelDate(value: string | null) { return !value ? 'Not supplied' : /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value; }

export default function Insights() { const { spaceId } = useProduct(); return <InsightsWorkspace key={spaceId} />; }

function InsightsWorkspace() {
  const { request } = useProduct();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [labels, setLabels] = useState<LabelsResponse | null>(null);
  const [references, setReferences] = useState<MedicineSearchResponse | null>(null);
  const [labelsError, setLabelsError] = useState('');
  const [referencesError, setReferencesError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);
  function reset() {
    sequence.current++; setLoading(false); setSubmitted(''); setLabels(null); setReferences(null); setSelected(null); setLabelsError(''); setReferencesError('');
  }
  async function search() {
    const id = ++sequence.current;
    const term = query.trim();
    setSubmitted(term); setLoading(true); setLabels(null); setReferences(null); setSelected(null); setLabelsError(''); setReferencesError('');
    // The context request API has no AbortSignal. Generation guards discard out-of-order and unmounted responses.
    const [labelResult, referenceResult] = await Promise.allSettled([
      request<LabelsResponse>(`/knowledge/labels?q=${encodeURIComponent(term)}`),
      request<MedicineSearchResponse>(`/knowledge/medicines?q=${encodeURIComponent(term)}`),
    ]);
    if (id !== sequence.current) return;
    if (labelResult.status === 'fulfilled') setLabels(labelResult.value); else setLabelsError(errorText(labelResult.reason));
    if (referenceResult.status === 'fulfilled') setReferences(referenceResult.value); else setReferencesError(errorText(referenceResult.reason));
    setLoading(false);
  }
  const product = labels?.results.find(label => label.id === selected);
  return <div className="stack"><header className="page-heading"><div><p className="eyebrow">Evidence, not inference</p><h1>Medicine insights</h1><p className="muted">Look up product-label evidence and original references. No personal interaction screening or medicine recommendation is performed.</p></div><BookOpen size={32} aria-hidden="true" /></header>
    <MedicineComparison/>
    <section className="panel stack" aria-label="Reference search"><form className="stack" onSubmit={e => { e.preventDefault(); void search(); }}><Field label="Medicine name" hint="For example, paracetamol. Check your pack if several products appear."><input className="search-field" type="search" required minLength={2} maxLength={100} pattern="[a-zA-Z0-9][a-zA-Z0-9 .\-]*" value={query} onChange={e => { reset(); setQuery(e.target.value); }} placeholder="What medicine would you like to understand?" /></Field><button className="btn primary" disabled={loading || query.trim().length < 2} type="submit"><Search size={18} />{loading ? 'Finding medicine information…' : 'Find side effects & warnings'}</button></form><p className="muted small">Only the search name is sent to the reference providers—not your private health record.</p></section>
    {submitted && referenceName(submitted).explanation && <Notice>{referenceName(submitted).explanation} <a href={referenceName(submitted).sourceUrl} target="_blank" rel="noreferrer">Name reference</a></Notice>}
    {submitted && referenceName(submitted).searched === 'acetaminophen' && <section className="panel stack" aria-label="Paracetamol plain-language reference"><p className="eyebrow">PARACETAMOL · A PLAIN-LANGUAGE START</p><h2>What should I know?</h2><p>Paracetamol is used for pain and fever. Taking more than directed, including through two products containing it, can cause serious liver harm.</p><p>Side effects are uncommon when used correctly. Serious reactions can include an allergic reaction or liver problems. This is not the complete list and does not tell whether it is suitable for you.</p><p><strong>Taking other medicines?</strong> Tell your pharmacist about the whole list, including cold-and-flu products and warfarin. These can require particular attention; don’t judge the combination from brand names alone.</p><a className="btn secondary" href="https://www.nhs.uk/medicines/paracetamol-for-adults/" target="_blank" rel="noreferrer">Read NHS medicine information<ExternalLink size={16}/></a><p className="small muted">Original summary of NHS general guidance, checked 4 November 2026. Not a prescribing instruction or personal interaction assessment. For suspected overdose or severe symptoms, seek urgent local medical help rather than waiting for the app.</p></section>}
    {loading && <Loading>Searching product labels and references for “{submitted}”…</Loading>}
    {!submitted && <Empty>Enter the exact product or ingredient name to begin. The app does not automatically search your medicine list.</Empty>}
    {!!submitted && !loading && <>
      <section className="panel stack" aria-label="Product label matches"><div><h2>Product labels for “{submitted}”</h2><p className="muted">US product-label coverage only. Confirm brand, generic name, manufacturer and route before reading a result; a similarly named product may not be yours.</p></div>
        {labelsError && <Notice error>Product labels unavailable: {labelsError} Submit the search again to retry.</Notice>}
        {labels && <><p className="small muted">{labels.source} · {labels.limitations}</p>{!labels.results.length ? <Empty>No exact product label matches returned. This is a coverage gap, not evidence of safety or absence of interactions. Try the exact brand or generic name on the packaging.</Empty> : <><p className="small">{labels.results.length} returned product records. Select one to view its source excerpts.</p><div className="card-grid">{labels.results.map(label => <article className="panel stack" key={label.id}><h3>{label.title}</h3><ProductIdentity label={label} /><button className={`btn ${selected === label.id ? 'primary' : 'secondary'}`} aria-pressed={selected === label.id} onClick={() => setSelected(label.id)}>{selected === label.id ? 'Selected product' : 'View this product label'}</button></article>)}</div></>}</>}
      </section>
      {product && <LabelEvidence key={product.id} label={product} />}
      <section className="panel stack" aria-label="Original references"><div><h2>Original references</h2><p className="muted">DailyMed search references are separate from the selected openFDA product. Check each document’s identity; these are not a matched or personalized interaction assessment.</p></div>
        {referencesError && <Notice error>DailyMed references unavailable: {referencesError} Submit the search again to retry.</Notice>}
        {references && <><p className="small muted">{references.source} · {references.limitations}</p>{!references.results.length ? <Empty>No DailyMed references returned for this search.</Empty> : references.results.map(reference => <details className="panel" key={reference.id}><summary>{reference.title}</summary><div className="stack"><p>Published date: {labelDate(reference.published)}</p><p className="small muted">DailyMed set ID: {reference.id}</p><a className="btn secondary" href={reference.url} target="_blank" rel="noreferrer">Read original reference <ExternalLink size={16} /></a></div></details>)}</>}
      </section>
    </>}
  </div>;
}

function ProductIdentity({ label }: { label: DrugLabel }) {
  return <dl className="stack"><div><dt className="muted small">Brand</dt><dd>{label.brand.join(', ') || 'Not supplied'}</dd></div><div><dt className="muted small">Generic</dt><dd>{label.generic.join(', ') || 'Not supplied'}</dd></div><div><dt className="muted small">Manufacturer</dt><dd>{label.manufacturer.join(', ') || 'Not supplied'}</dd></div><div><dt className="muted small">Route</dt><dd>{label.route.join(', ') || 'Not supplied'}</dd></div><div><dt className="muted small">Region / source label date</dt><dd>{label.region} · {labelDate(label.updated)}</dd></div></dl>;
}

function LabelEvidence({ label }: { label: DrugLabel }) {
  const [section, setSection] = useState<keyof LabelSections>('adverse_reactions');
  const [filter, setFilter] = useState('');
  const entries = label.sections[section];
  const shown = entries.filter(text => text.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
  return <section className="panel stack" aria-label="Selected product evidence"><div className="row"><div><p className="eyebrow">Selected product · source excerpts</p><h2>{label.title}</h2></div><a className="btn secondary" href={label.sourceUrl} target="_blank" rel="noreferrer">Original source <ExternalLink size={16} /></a></div><ProductIdentity label={label} />
    <Notice><ShieldCheck size={18} aria-hidden="true" />Label evidence describes this product, not whether it is suitable for you. Excerpts are capped at four strings of 6,000 characters per section; missing text does not mean no risk. Read the original source for complete context.</Notice>
    <nav className="tabs" aria-label="Label sections">{sections.map(item => <button key={item.key} className={`btn ${section === item.key ? 'primary' : 'ghost'}`} aria-pressed={section === item.key} onClick={() => { setSection(item.key); setFilter(''); }}>{item.title}</button>)}</nav>
    <Field label="Filter text within this section" hint="Local text matching only; no request or AI interpretation."><input type="search" className="search-field" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find words in the returned excerpts" /></Field><h3>{sections.find(item => item.key === section)?.title}</h3>
    {!entries.length ? <Empty>This section was not supplied in the returned label. Consult the original reference; no absence of risk is implied.</Empty> : !shown.length ? <Empty>No returned excerpt contains “{filter}”. Clear the filter to read the section.</Empty> : <><p className="muted small"><Filter size={14} aria-hidden="true" /> {shown.length} of {entries.length} returned excerpts shown</p>{shown.map((text, index) => <article className="panel" key={`${section}-${index}`}><h4>Source excerpt {entries.indexOf(text) + 1}</h4><p className="p-source-excerpt">{text}</p><ExplainExcerpt medicine={label.title} section={sections.find(item => item.key === section)?.title ?? section} text={text} /></article>)}</>}
  </section>;
}