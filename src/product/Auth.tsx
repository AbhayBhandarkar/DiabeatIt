import { useState, type FormEvent } from 'react';
import { ArrowUpRight, ShieldCheck, Users, Eye, EyeOff, Stethoscope, Sparkles, QrCode } from 'lucide-react';
import { request } from './context';
import { Field } from './ui';
import { DesktopQrLogin } from './DeviceLogin';
import type { MeResponse, RegisterResponse } from '../../shared/v2';

type Mode = 'login' | 'register' | 'recover' | 'phone';
export default function Auth({ onAuth }: { onAuth: (me: MeResponse, codes?: string[]) => void }) {
  const [mode, setMode] = useState<Mode>('register'); const [pending, setPending] = useState(false); const [error, setError] = useState(''); const [show, setShow] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (pending) return; setPending(true); setError(''); const f = new FormData(e.currentTarget);
    try {
      const email = String(f.get('email')); const password = String(f.get('password'));
      if (mode === 'recover') { await request('/auth/recover', 'POST', { email, recoveryCode: String(f.get('recoveryCode')).trim(), newPassword: password }); setMode('login'); setError('Password updated. Sign in with your new password.'); }
      else { const response = await request<RegisterResponse>(`/auth/${mode}`, 'POST', mode === 'register' ? { email, password, name: String(f.get('name')), consent: true } : { email, password }); onAuth(response, response.recoveryCodes); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in.'); } finally { setPending(false); }
  }
  const tabs: [Mode, string][] = [['register', 'Get started'], ['login', 'Sign in'], ['phone', 'Use my phone']];
  return <div className="product-auth">
    <aside className="auth-aside">
      <a className="product-brand" href="/about"><img src="/icon.svg" alt="" /><span>diabeat<span>IT</span></span></a>
      <div>
        <p className="auth-kicker">YOUR HEALTH. YOUR PEOPLE. YOUR PACE.</p>
        <h1>A clearer day<br />starts here.</h1>
        <p>Medicines, meals, visits and the people who help — in one calm place. Built for real routines in India, not perfect ones.</p>
        <div className="auth-features">
          <span><Sparkles />Snap a prescription or a plate — AI drafts it, you confirm</span>
          <span><Stethoscope />One timeline any doctor can read in a minute</span>
          <span><Users />Family can help, only with what you share</span>
          <span><ShieldCheck />Every fact links to its official source</span>
        </div>
      </div>
      <small>Records and education support — not a replacement for your care team. <a href="/about">How DiabeatIT works</a></small>
    </aside>
    <main className="auth-form">
      <div className="auth-tabs">{tabs.map(([m, label]) => <button key={m} aria-pressed={mode === m} className={mode === m ? 'active' : ''} onClick={() => { setMode(m); setError(''); }}>{m === 'phone' && <QrCode size={16} />}{label}</button>)}</div>
      {mode === 'phone' ? <><p className="eyebrow">NO PASSWORD ON THIS COMPUTER</p><h2>Scan with your phone.</h2><p className="muted">Already signed in on your phone? Use it as your key.</p><DesktopQrLogin onAuth={me => onAuth(me)} /></> : <>
        <p className="eyebrow">WELCOME TO YOUR SPACE</p>
        <h2>{mode === 'register' ? 'Make room for better care.' : mode === 'login' ? 'Good to have you back.' : 'Recover your account.'}</h2>
        <p className="muted">{mode === 'register' ? 'Start with an empty, private workspace. Add only what you want to keep track of.' : mode === 'recover' ? 'Use one of the recovery codes saved when you registered.' : 'Your records and shared spaces will be here.'}</p>
        <form onSubmit={submit}>
          {mode === 'register' && <Field label="Your name"><input name="name" autoComplete="name" required maxLength={100} /></Field>}
          <Field label="Email address"><input name="email" type="email" autoComplete="email" required maxLength={254} /></Field>
          {mode === 'recover' && <Field label="Recovery code"><input name="recoveryCode" autoComplete="off" required minLength={64} maxLength={64} /></Field>}
          <Field label={mode === 'recover' ? 'New password' : 'Password'} hint={mode !== 'login' ? 'Use at least 12 characters.' : ''}><div className="password-field"><input aria-label={mode === 'recover' ? 'New password' : 'Password'} name="password" type={show ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 12} maxLength={256} /><button type="button" className="icon-btn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field>
          {mode === 'register' && <label className="toggle-row"><input type="checkbox" required /><span>I agree to store my records for personal tracking. I understand that clinical screening, emergency monitoring, and professional consultation are not provided by this installation.</span></label>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="btn primary" disabled={pending}>{pending ? 'Please wait…' : mode === 'register' ? 'Create my account' : mode === 'login' ? 'Sign in' : 'Reset password'}<ArrowUpRight size={18} /></button>
        </form>
        {mode === 'login' && <button className="btn ghost" onClick={() => setMode('recover')}>Use a recovery code</button>}
        <p className="small muted">Email is an account identifier, not a verified identity. Use test records only on this pilot installation.</p>
      </>}
    </main>
  </div>;
}
