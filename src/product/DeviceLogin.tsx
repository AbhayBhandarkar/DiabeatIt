import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Smartphone, RefreshCw, ScanLine, ShieldCheck, Laptop, X } from 'lucide-react';
import type { MeResponse, QrDetails, QrPollResponse, QrStartResponse } from '../../shared/v2';
import { request } from './context';
import { QrImage } from './Summary';
import { Dialog, Notice } from './ui';

export const approveUrl = (id: string) => `${location.origin}/?approve=${id}`;
export function approveIdFrom(text: string): string | null {
  try { const u = new URL(text); const id = u.searchParams.get('approve'); return u.origin === location.origin && id && /^[0-9a-f-]{36}$/i.test(id) ? id : null; } catch { return null; }
}

/** Desktop side: show a QR code and wait for a signed-in phone to approve. */
export function DesktopQrLogin({ onAuth }: { onAuth: (me: MeResponse) => void }) {
  const [start, setStart] = useState<QrStartResponse | null>(null);
  const [status, setStatus] = useState<QrPollResponse['status'] | 'loading'>('loading');
  const [left, setLeft] = useState(120);
  const [error, setError] = useState('');
  async function begin() {
    setError(''); setStatus('loading');
    try { const s = await request<QrStartResponse>('/device-login/start', 'POST'); setStart(s); setStatus('pending'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create a sign-in code.'); }
  }
  useEffect(() => { void begin(); }, []);
  useEffect(() => {
    if (!start || status !== 'pending') return;
    const tick = setInterval(() => setLeft(Math.max(0, Math.round((Date.parse(start.expiresAt) - Date.now()) / 1000))), 1000);
    const poll = setInterval(() => {
      void request<QrPollResponse>('/device-login/poll', 'POST', { id: start.id, secret: start.secret }).then(r => {
        if (r.status === 'approved' && r.me) { clearInterval(poll); onAuth(r.me); }
        else if (r.status !== 'pending') setStatus(r.status);
      }).catch(() => {});
    }, 2000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [start, status, onAuth]);
  const expired = status === 'expired' || status === 'denied' || (status === 'pending' && left === 0);
  return <div className="qr-login">
    <div className="qr-login-code">{start && !expired ? <QrImage value={approveUrl(start.id)} label="Sign-in QR code. Scan with the phone where you are already signed in." size={200} /> : <div className="qr-placeholder">{status === 'loading' && !error ? 'Creating code…' : <button type="button" className="btn primary" onClick={() => void begin()}><RefreshCw size={18} />New code</button>}</div>}</div>
    <div className="stack">
      <h3><Smartphone size={20} />Sign in with your phone</h3>
      <ol className="steps"><li>Open DiabeatIT on your phone, where you’re already signed in.</li><li>Tap <strong>Scan to sign in</strong> (or use your phone camera).</li><li>Tap the number <strong className="match-number" aria-label={`Number ${start?.match ?? ''}`}>{start?.match ?? '··'}</strong> on your phone.</li></ol>
      {status === 'denied' && <Notice error>The sign-in was blocked on your phone. Create a new code to try again.</Notice>}
      {expired && status !== 'denied' && <Notice>This code expired. Create a new one.</Notice>}
      {!expired && start && <p className="muted small">Code expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}. No password is typed on this computer.</p>}
      {error && <Notice error>{error}</Notice>}
    </div>
  </div>;
}

/** Phone side: confirm a desktop sign-in by tapping the matching number. */
export function ApproveDialog({ id, onClose }: { id: string; onClose: (message?: string) => void }) {
  const [details, setDetails] = useState<QrDetails | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void request<QrDetails>(`/device-login/${id}`).then(setDetails).catch(e => setError(e instanceof Error ? e.message : 'Code unavailable.')); }, [id]);
  async function choose(match: string) {
    setBusy(true); setError('');
    try { await request(`/device-login/${id}/approve`, 'POST', { match }); onClose('Your computer is now signed in.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Approval failed.'); setDetails(null); }
    finally { setBusy(false); }
  }
  return <Dialog title="Sign in on a computer?" onClose={() => { if (details) void request(`/device-login/${id}/deny`, 'POST').catch(() => {}); onClose(); }} busy={busy}>
    {error && <Notice error>{error}</Notice>}
    {details && <div className="stack approve">
      <p className="approve-device"><Laptop size={22} /><span><strong>{details.device}</strong><br /><span className="muted small">Requested {new Date(details.createdAt).toLocaleTimeString('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' })} IST</span></span></p>
      <p>Only continue if <strong>you</strong> are signing in on a computer in front of you right now. Tap the number it shows.</p>
      <div className="match-choices" role="group" aria-label="Number shown on your computer">{details.choices.map(c => <button key={c} type="button" className="match-choice" disabled={busy} onClick={() => void choose(c)}>{c}</button>)}</div>
      <button type="button" className="btn ghost" disabled={busy} onClick={() => { void request(`/device-login/${id}/deny`, 'POST').catch(() => {}); onClose('Sign-in blocked.'); }}><X size={18} />This wasn’t me</button>
      <p className="muted small"><ShieldCheck size={14} /> The computer gets its own session. You can sign it out any time by changing your password.</p>
    </div>}
    {!details && !error && <p className="muted">Checking the code…</p>}
  </Dialog>;
}

/** Phone side: camera scanner for the desktop QR code. Uses BarcodeDetector when available, otherwise jsQR. */
export function ScanDialog({ onFound, onClose }: { onFound: (id: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, stopped = false;
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;
    async function scan() {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2) {
        let text = '';
        if (detector) { try { text = (await detector.detect(v))[0]?.rawValue ?? ''; } catch { /* fall through to jsQR */ } }
        if (!text) { canvas.width = v.videoWidth; canvas.height = v.videoHeight; ctx.drawImage(v, 0, 0); text = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data ?? ''; }
        const id = text && approveIdFrom(text);
        if (id) { stopped = true; onFound(id); return; }
        if (text) setError('That QR code is not a DiabeatIT sign-in code for this site.');
      }
      raf = requestAnimationFrame(() => void scan());
    }
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(s => {
      stream = s; if (stopped) return s.getTracks().forEach(t => t.stop());
      video.current!.srcObject = s; void video.current!.play(); void scan();
    }).catch(() => setError('Camera unavailable. Allow camera access, or scan the code with your phone’s camera app instead.'));
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
  }, [onFound]);
  return <Dialog title="Scan to sign in on a computer" onClose={onClose}>
    <div className="scanner"><video ref={video} playsInline muted aria-label="Camera preview" /><span className="scanner-frame" aria-hidden="true"><ScanLine size={40} /></span></div>
    <p className="muted">On the computer, open DiabeatIT and choose <strong>Phone sign-in</strong>. Point this camera at the code.</p>
    {error && <Notice error>{error}</Notice>}
  </Dialog>;
}
