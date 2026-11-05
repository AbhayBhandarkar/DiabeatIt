import { useEffect, useState } from 'react';
import { ArrowRight, ScanText, Camera, CalendarClock, Users, ShieldQuestion, Pill, QrCode, Stethoscope, ShieldCheck, Lock, Sparkles, Check, Minus, Moon, Sun, Smartphone } from 'lucide-react';
import { QrImage } from './Summary';
import './landing.css';

const features = [
  { Icon: ScanText, title: 'Snap a prescription', text: 'AI reads the medicines and timings. You check each line, then it becomes your schedule — no typing.' },
  { Icon: Camera, title: 'Photograph a meal', text: 'AI suggests what is on the plate. Nutrition then comes from public food databases, not guesses.' },
  { Icon: CalendarClock, title: 'One care timeline', text: 'Visits, lab results, medicine changes, glucose and symptoms on one line — across every doctor you see.' },
  { Icon: Stethoscope, title: '30-second doctor briefing', text: 'Share a read-only link by QR. The doctor gets a cited summary of exactly what you recorded.' },
  { Icon: Users, title: 'Family care circle', text: 'Children and carers can help, but only with the records you choose. Every action is logged.' },
  { Icon: Pill, title: 'Medicine insights', text: 'See when two products share an ingredient, and read official label sections in simple words.' },
  { Icon: ShieldQuestion, title: 'Myth check', text: 'Heard that karela cures diabetes? Check it against reviewed public-health sources in seconds.' },
  { Icon: QrCode, title: 'Phone-as-key sign-in', text: 'Open DiabeatIT on a computer by scanning a code with your phone. No password typed on shared PCs.' },
];
const compare: [string, boolean | 'part', boolean | 'part', boolean][] = [
  ['Logs glucose and medicines', true, true, true],
  ['Reads prescriptions from a photo', false, 'part', true],
  ['Cross-doctor timeline with cited AI summary for clinicians', false, false, true],
  ['Family access with per-record permissions and audit trail', 'part', false, true],
  ['Flags the same ingredient in two products', 'part', false, true],
  ['Every health fact links to its public source', false, 'part', true],
  ['AI can run on the phone itself (partner on-device models)', false, false, true],
];
const Mark = ({ v }: { v: boolean | 'part' }) => v === true ? <Check aria-label="Yes" className="yes" /> : v === 'part' ? <span className="part">Partly</span> : <Minus aria-label="No" className="no" />;

export default function Landing() {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; document.title = 'DiabeatIT · Everyday diabetes care for India'; }, [dark]);
  return <div className="site">
    <header className="site-nav"><a className="site-brand" href="/about"><img src="/icon.svg" alt="" /><span>diabeat<b>IT</b></span></a>
      <nav aria-label="Site"><a href="#features">Features</a><a href="#doctors">For doctors</a><a href="#ai">AI & safety</a><a href="#plans">Plans</a></nav>
      <div className="site-nav-actions"><button className="site-icon" aria-label="Switch colour theme" onClick={() => setDark(!dark)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button><a className="site-btn primary" href="/">Open the app<ArrowRight size={18} /></a></div></header>

    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="site-kicker"><Sparkles size={16} />Built for people with diabetes aged 40–65 and their families</p>
          <h1>Diabetes care that fits <em>real life</em> in India.</h1>
          <p className="lead">Prescriptions from three doctors, a cupboard of strips, and relatives full of advice. DiabeatIT turns it into one calm routine and one timeline any doctor can read in a minute.</p>
          <div className="hero-cta"><a className="site-btn primary" href="/">Start free<ArrowRight size={18} /></a><a className="site-btn ghost" href="#features">See how it works</a></div>
          <ul className="hero-points"><li><Check size={18} />Works on any phone browser — add it to your home screen</li><li><Check size={18} />Light and dark mode, large text</li><li><Check size={18} />AI drafts, you confirm. It never changes a dose.</li></ul>
        </div>
        <div className="hero-visual" aria-hidden="true"><img className="hero-phone back" src="/site/phone-timeline.png" alt="" /><img className="hero-phone front" src="/site/phone-today.png" alt="" /></div>
      </section>

      <section className="stats" aria-label="Why it matters">
        <div><strong>101 million</strong><span>people in India live with diabetes; another 136 million have prediabetes.</span><small>ICMR–INDIAB, Lancet Diabetes & Endocrinology, 2023</small></div>
        <div><strong>3+ doctors</strong><span>is common for an older adult — diabetologist, cardiologist, GP — each with a separate paper prescription.</span><small>Our design research assumption</small></div>
        <div><strong>1 minute</strong><span>is the goal for a doctor to understand what changed since the last visit, with sources.</span><small>DiabeatIT product target</small></div>
      </section>

      <section id="features" className="site-section"><p className="site-kicker">EVERYTHING IN ONE PLACE</p><h2>Less logging. More understanding.</h2>
        <div className="feature-grid">{features.map(({ Icon, title, text }) => <article key={title} className="feature"><span className="feature-icon"><Icon size={22} /></span><h3>{title}</h3><p>{text}</p></article>)}</div></section>

      <section id="doctors" className="site-section split-section">
        <div><p className="site-kicker">FOR DOCTORS AND CLINICS</p><h2>The whole story, before the patient sits down.</h2>
          <ol className="site-steps"><li><b>1</b><span>The patient taps <em>Share with my doctor</em> and chooses how long the link works (1–30 days).</span></li><li><b>2</b><span>The doctor scans the QR code. No app or account needed.</span></li><li><b>3</b><span>A read-only view shows medicines, test trends, glucose, missed doses and questions — plus an AI briefing where every line cites its record.</span></li></ol>
          <p className="fine"><Lock size={16} />Links are random, expire automatically, can be withdrawn at any time, and every opening is recorded in the patient’s activity history.</p></div>
        <img className="site-shot" src="/site/desktop-doctor.png" alt="Clinician view with medicines, test results, glucose plot and AI briefing" loading="lazy" />
      </section>

      <section className="site-section"><p className="site-kicker">HOW WE’RE DIFFERENT</p><h2>Not another logging app.</h2>
        <div className="compare-wrap"><table className="compare"><thead><tr><th>Capability</th><th>Typical tracker apps</th><th>Coaching programmes</th><th>DiabeatIT</th></tr></thead><tbody>{compare.map(([label, a, b, c]) => <tr key={label}><td>{label}</td><td><Mark v={a} /></td><td><Mark v={b} /></td><td><Mark v={c} /></td></tr>)}</tbody></table></div>
        <p className="fine">Comparison is by category of product, based on our review of publicly described features; it is not a claim about any specific brand.</p></section>

      <section id="ai" className="site-section split-section reverse">
        <img className="site-shot" src="/site/desktop-timeline.png" alt="Patient timeline with an AI summary citing record IDs" loading="lazy" />
        <div><p className="site-kicker">AI THAT KNOWS ITS PLACE</p><h2>AI drafts. You decide. Your doctor decides.</h2>
          <ul className="site-list"><li><ShieldCheck size={20} /><span><b>Five narrow jobs only:</b> read a prescription, identify foods, summarise your timeline, check a myth against sources, rewrite a label in simple words.</span></li>
            <li><ShieldCheck size={20} /><span><b>Strict output checks:</b> every reply must match a fixed schema or it is discarded. Citations that do not point to a real record are removed.</span></li>
            <li><ShieldCheck size={20} /><span><b>Never clinical:</b> no diagnosis, no dose changes, no glucose predictions. Photos are not stored.</span></li>
            <li><Smartphone size={20} /><span><b>On-device ready:</b> the same prompts and checks run with small vision and text models on the phone, so records need not leave it.</span></li></ul></div>
      </section>

      <section id="plans" className="site-section"><p className="site-kicker">SUSTAINABLE BY DESIGN</p><h2>Free for patients. Paid by those who save time.</h2>
        <div className="plans">
          <article><h3>Patient</h3><p className="price">Free</p><ul><li>All tracking, timeline and learning</li><li>Doctor links and family circle</li><li>Fair-use AI drafts</li></ul></article>
          <article className="featured"><h3>Family Plus</h3><p className="price">₹99<small>/month</small></p><ul><li>Unlimited AI scans and summaries</li><li>Up to 5 carers, shared reminders</li><li>Priority support in Indian languages</li></ul></article>
          <article><h3>Clinic</h3><p className="price">₹1,499<small>/doctor/month</small></p><ul><li>Patient briefings inbox</li><li>Printable visit summaries</li><li>Pharmacist and educator seats</li></ul></article>
        </div>
        <p className="fine">Proposed pricing for the pilot. The core app runs on free-tier infrastructure today.</p></section>

      <section className="site-cta"><div><h2>Try it on your phone now.</h2><p>Scan to open DiabeatIT, then use <em>Share → Add to Home Screen</em> to install it like an app.</p><a className="site-btn primary" href="/">Open DiabeatIT<ArrowRight size={18} /></a></div><QrImage value={location.origin + '/'} label="QR code to open DiabeatIT on your phone" size={180} /></section>
    </main>
    <footer className="site-foot"><p>DiabeatIT supports records, education and communication. It is not a medical device and does not replace your doctor, pharmacist or emergency services (India: 112).</p><p>Health information sources: NIDDK, NCCIH, MedlinePlus, DailyMed, openFDA, Open Food Facts, USDA FoodData Central.</p></footer>
  </div>;
}
