import { useEffect, useState, type FormEvent } from 'react';
import { Sun, Moon, Monitor, Download, KeyRound, LogOut, Trash2, CircleDollarSign, Bell, MonitorSmartphone } from 'lucide-react';
import { useProduct } from './context';
import { Dialog, Field, Notice, FormActions } from './ui';
import type { AccountSession, AccountSessionsResponse } from '../../shared/v2';

export default function Settings({ theme, setTheme, large, setLarge, remind, setRemind, onLogout }: { theme: string; setTheme: (s: string) => void; large: boolean; setLarge: (v: boolean) => void; remind: boolean; setRemind: (v: boolean) => void; onLogout: () => void }) {
  const { me, request, notify, spaceId, snapshot } = useProduct();
  const [modal, setModal] = useState<'password' | 'delete' | 'business' | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [sessions, setSessions] = useState<AccountSession[] | null>(null);
  const [sessionError, setSessionError] = useState('');

  async function loadSessions() {
    try { setSessions((await request<AccountSessionsResponse>('/auth/sessions')).sessions); setSessionError(''); }
    catch (e) { setSessionError(e instanceof Error ? e.message : 'Signed-in browsers could not be loaded.'); }
  }
  useEffect(() => { void loadSessions(); }, []);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true); setError('');
    const form = new FormData(e.currentTarget);
    try {
      if (modal === 'password') await request('/auth/password', 'POST', { currentPassword: form.get('password'), newPassword: form.get('newPassword') });
      else await request('/account', 'DELETE', { password: form.get('password'), confirmation: form.get('confirmation') });
      onLogout();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not complete request.'); }
    finally { setPending(false); }
  }
  async function toggleReminders(on: boolean) {
    if (!on) { setRemind(false); notify('Open-tab reminders are off.'); return; }
    if (!('Notification' in window)) { notify('This browser cannot show reminders.'); return; }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') { notify('Reminder permission was not granted. Nothing will appear in the background.'); return; }
    setRemind(true);
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    const installed = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    notify(ios && !installed
      ? 'On iPhone, add DiabeatIT to your Home Screen before a reminder can appear. It still only shows while the app stays open, and it does not record a dose.'
      : 'A reminder can appear while this tab stays open. It does not record a dose, and it stops if you close the tab.');
  }
  async function revoke(session: AccountSession) {
    try {
      await request(`/auth/sessions/${session.id}`, 'DELETE');
      if (session.current) onLogout();
      else { notify(`${session.device} was signed out.`); await loadSessions(); }
    } catch (e) { notify(e instanceof Error ? e.message : 'Could not sign out that browser.'); }
  }
  async function revokeOthers() {
    try {
      const result = await request<{ revoked: number }>('/auth/sessions/revoke-others', 'POST', {});
      notify(result.revoked ? `Signed out ${result.revoked} other browser${result.revoked === 1 ? '' : 's'}.` : 'No other browsers were signed in.');
      await loadSessions();
    } catch (e) { notify(e instanceof Error ? e.message : 'Could not sign out the other browsers.'); }
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">YOUR SPACE. YOUR CHOICES.</p><h1>Settings & privacy</h1></div><button className="btn secondary" onClick={async () => { try { await request('/auth/logout', 'POST'); onLogout(); } catch (e) { notify(String(e)); } }}><LogOut size={18} />Sign out</button></div>
    <div className="settings-layout">
      <section className="panel"><h2>Comfort comes first.</h2><p className="muted">Choose a view that feels right for you.</p><div className="preference-grid">{[{ id: 'light', label: 'Light', Icon: Sun }, { id: 'dark', label: 'Dark', Icon: Moon }, { id: 'system', label: 'System', Icon: Monitor }].map(({ id, label, Icon }) => <button key={id} className={`btn ${theme === id ? 'primary' : 'secondary'}`} aria-pressed={theme === id} onClick={() => setTheme(id)}><Icon size={20} />{label}</button>)}</div><label className="toggle-row"><span>Larger text</span><input type="checkbox" checked={large} onChange={e => setLarge(e.target.checked)} /></label><p className="small muted">Reduced-motion preferences are respected. Videos play only when you choose.</p><label className="toggle-row"><span><Bell size={18} /> Remind me in this open tab</span><input type="checkbox" checked={remind} onChange={e => void toggleReminders(e.target.checked)} /></label><p className="small muted">This can notify you about the next unrecorded dose only while this tab stays open. On iPhone, add DiabeatIT to your Home Screen first; a normal Safari tab cannot show it. It is not a background alarm, and it does not mark a dose as taken.</p></section>
      <section className="panel"><h2>Your account</h2><strong>{me.user.name}</strong><p className="muted">{me.user.email}</p><button className="btn secondary" onClick={() => { setError(''); setModal('password'); }}><KeyRound size={18} />Change password</button><p className="small muted">Use the recovery codes you saved at registration if you forget your password. Email-based password recovery is not connected.</p></section>
      <section className="panel"><h2>Signed-in browsers</h2><p className="muted">Each sign-in stays active for seven days. Sign out a browser you no longer use.</p>{sessionError && <Notice error>{sessionError}</Notice>}{sessions?.map(session => <div className="journal-row" key={session.id}><MonitorSmartphone size={18} /><div><strong>{session.device}</strong><p className="small muted">{session.current ? 'This browser' : 'Another browser'} · until {new Date(session.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</p></div><button className="btn ghost" onClick={() => void revoke(session)}>{session.current ? 'Sign out this browser' : 'Sign out that browser'}</button></div>)}{sessions && !sessions.length && <p className="muted">No active browsers were found.</p>}<button className="btn secondary" disabled={!sessions?.some(session => !session.current)} onClick={() => void revokeOthers()}>Sign out other browsers</button></section>
      <section className="panel"><h2>Your records belong to you.</h2><p className="muted">Download an account-owned workspace, manage sharing in Care, or delete your account.</p><div className="stack">{snapshot.space.role === 'owner' && <a className="btn secondary" href={`/api/v2/spaces/${spaceId}/export`}><Download size={18} />Export workspace</a>}<button className="btn danger" onClick={() => { setError(''); setModal('delete'); }}><Trash2 size={18} />Delete account</button></div><p className="small muted">Deletion removes owned workspaces and current database records. Previously downloaded copies and retained backups require their own retention controls. Record history can also be read one page at a time from the server.</p></section>
      <section className="panel"><h2>Connected capabilities</h2><div className="journal-row"><span>Account-owned records and care sharing</span><span className="chip">Available</span></div><div className="journal-row"><span>Food and medicine reference search</span><span className="chip">Online providers</span></div><div className="journal-row"><span>Open-tab dose reminder</span><span className="chip">{remind ? 'On in this tab' : 'Off'}</span></div><div className="journal-row"><span>Clinical interaction screening</span><span className="chip">Not connected</span></div><div className="journal-row"><span>CGM feeds and background alarms</span><span className="chip">Not connected</span></div><p className="small muted">Your entries are records, not prescriptions. Clinical decisions stay with your professional. Provider availability and geographic coverage vary.</p></section>
    </div>
    <section className="panel"><div className="page-heading"><div><p className="eyebrow">BUILT TO KEEP GETTING BETTER</p><h2>Sustainable care, without selling health data.</h2></div><button className="btn secondary" onClick={() => setModal('business')}><CircleDollarSign size={18} />Our approach</button></div></section>
    {modal && <Dialog title={modal === 'password' ? 'Change password' : modal === 'delete' ? 'Delete your account?' : 'A sustainable care model'} onClose={() => setModal(null)} busy={pending}>{modal === 'business' ? <><div className="card-grid"><article className="panel"><h3>Essential</h3><p>Core recording, access controls, and evidence-linked learning.</p></article><article className="panel"><h3>Family coordination</h3><p>Future optional subscription for additional coordination tools. No billing is active.</p></article><article className="panel"><h3>Care organizations</h3><p>Potential clinic licensing and separately scoped professional services after appropriate onboarding.</p></article></div><Notice>No sale of patient data. No paid medicine ranking. Identified concerns, access revocation, and basic data controls should not be hidden behind a paywall.</Notice></> : <form onSubmit={save}>{modal === 'delete' && <Notice error>This removes your account and all workspaces you own. Shared records belonging to other people are not deleted. Export anything you need first.</Notice>}<Field label="Current password"><input type="password" name="password" required autoComplete="current-password" /></Field>{modal === 'password' ? <Field label="New password · at least 12 characters"><input type="password" name="newPassword" minLength={12} maxLength={256} required autoComplete="new-password" /></Field> : <Field label="Type DELETE to confirm"><input name="confirmation" pattern="DELETE" required autoComplete="off" /></Field>}{error && <Notice error>{error}</Notice>}<FormActions busy={pending} onClose={() => setModal(null)} label={modal === 'password' ? 'Update and sign out' : 'Delete account'} /></form>}</Dialog>}
  </>;
}
