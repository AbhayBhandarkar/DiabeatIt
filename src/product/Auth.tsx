import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Eye, EyeOff, QrCode } from 'lucide-react';
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
  const tabs: [Mode, string][] = [['register', 'Get started'], ['login', 'Sign in'], ['phone', 'Phone sign-in']];
  return <div className="product-auth">
    <aside className="auth-aside">
      <a className="product-brand" href="/about"><img src="/icon.svg" alt="" /><span>diabeat<span>IT</span></span></a>
      <div className="auth-pitch">
        <h1>Your diabetes, organised.</h1>
        <p>Tablets from three doctors, readings on scraps of paper, a visit next month. DiabeatIT puts it on one page that you, your family and your doctor can follow.</p>
      </div>
      <figure className="auth-preview" aria-label="Example of a day in DiabeatIT">
        <div className="ap-head"><strong>Today</strong><span>Thu, 5 Nov</span></div>
        <div className="ap-row"><b>08:00</b><span>Telma 40<small>Telmisartan 40 mg</small></span><i className="ok">Taken</i></div>
        <div className="ap-row"><b>08:30</b><span>Glycomet SR 500<small>After breakfast</small></span><i className="ok">Taken</i></div>
        <div className="ap-row"><b>20:30</b><span>Glycomet SR 500<small>After dinner</small></span><i>Due</i></div>
        <div className="ap-split"><div><small>HbA1c</small><strong>8.4 → 7.3 %</strong></div><div><small>Next visit</small><strong>Dr Mehta, 3 Dec</strong></div></div>
        <figcaption>Example record</figcaption>
      </figure>
      <small>Not a substitute for your doctor. In an emergency, call 112. <a href="/about">About DiabeatIT</a></small>
    </aside>
    <main className="auth-form">
      <div className="auth-tabs">{tabs.map(([m, label]) => <button key={m} aria-pressed={mode === m} className={mode === m ? 'active' : ''} onClick={() => { setMode(m); setError(''); }}>{m === 'phone' && <QrCode size={16} />}{label}</button>)}</div>
      {mode === 'phone' ? <><h2>Sign in with your phone</h2><p className="muted">If DiabeatIT is open on your phone, you don’t need a password here.</p><DesktopQrLogin onAuth={me => onAuth(me)} /></> : <>
        <h2>{mode === 'register' ? 'Create your account' : mode === 'login' ? 'Welcome back' : 'Reset your password'}</h2>
        <p className="muted">{mode === 'register' ? 'Your account starts empty. Nothing is shared until you choose to.' : mode === 'recover' ? 'Use one of the recovery codes you saved when you signed up.' : 'Sign in with your email and password.'}</p>
        <form onSubmit={submit}>
          {mode === 'register' && <Field label="Your name"><input name="name" autoComplete="name" required maxLength={100} /></Field>}
          <Field label="Email address"><input name="email" type="email" autoComplete="email" required maxLength={254} /></Field>
          {mode === 'recover' && <Field label="Recovery code"><input name="recoveryCode" autoComplete="off" required minLength={64} maxLength={64} /></Field>}
          <Field label={mode === 'recover' ? 'New password' : 'Password'} hint={mode !== 'login' ? 'Use at least 12 characters.' : ''}><div className="password-field"><input aria-label={mode === 'recover' ? 'New password' : 'Password'} name="password" type={show ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 12} maxLength={256} /><button type="button" className="icon-btn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field>
          {mode === 'register' && <label className="toggle-row"><input type="checkbox" required /><span>I agree to store my records here. I understand DiabeatIT does not give medical advice or emergency help.</span></label>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="btn primary" disabled={pending}>{pending ? 'Please wait…' : mode === 'register' ? 'Create my account' : mode === 'login' ? 'Sign in' : 'Reset password'}<ArrowUpRight size={18} /></button>
        </form>
        {mode === 'login' && <button className="btn ghost" onClick={() => setMode('recover')}>Use a recovery code</button>}
        <p className="small muted">This is a pilot. Please use test records, not your real medical details.</p>
      </>}
    </main>
  </div>;
}
