import { Children, cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, FileText, LoaderCircle, Trash2, X } from 'lucide-react';
import type { Entity, EntityDataMap, EntityKind, SnapshotResponse } from '../../shared/v2';

export function Dialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return createPortal(<dialog ref={ref} className="modal-dialog" aria-labelledby={titleId} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="modal-head"><h2 id={titleId}>{title}</h2><button type="button" className="icon-btn" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>, document.body);
}

export function Field({ label, children, hint, wide = false }: { label: string; children: ReactNode; hint?: string; wide?: boolean }) {
  const id = useId();
  const controls = Children.map(children, child => isValidElement<{ id?: string; 'aria-describedby'?: string }>(child) && typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type)
    ? cloneElement(child, { id, 'aria-describedby': [child.props['aria-describedby'], hint ? `${id}-hint` : undefined].filter(Boolean).join(' ') || undefined }) : child);
  return <div className={`field${wide ? ' span-2' : ''}`}><label htmlFor={id}>{label}</label>{controls}{hint && <span id={`${id}-hint`} className="muted small">{hint}</span>}</div>;
}

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`notice${error ? ' warning' : ''}`} role={error ? 'alert' : 'status'}><AlertCircle size={18} aria-hidden="true" /><span>{children}</span></div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty"><FileText size={26} aria-hidden="true" /><p>{children}</p></div>;
}

export function Loading({ children = 'Loading…' }: { children?: ReactNode }) {
  return <div className="notice" role="status"><LoaderCircle size={18} aria-hidden="true" />{children}</div>;
}

/** Entity data are validated by the v2 server; documents are metadata, not DocumentData. */
export function dataOf<K extends Exclude<EntityKind, 'documents'>>(entity: Entity): EntityDataMap[K] {
  return entity.data as unknown as EntityDataMap[K];
}

export function can(snapshot: SnapshotResponse, kind: EntityKind, mode: 'read' | 'write' = 'write') {
  return snapshot.space.scopes.includes(`${kind}:${mode}`);
}

export function stamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(date) + ' IST';
}

export function istDate(value: Date | string = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

export function istInput(value: Date | string = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

export function fromIST(value: string) { return new Date(`${value}:00+05:30`).toISOString(); }

export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(timer); }, []);
  return now;
}

export function Provenance({ entity }: { entity: Entity }) {
  return <p className="muted small">Last recorded by {entity.author.name} · {entity.author.role} · {stamp(entity.updatedAt)}</p>;
}

export function errorText(error: unknown) { return error instanceof Error ? error.message : 'The request could not be completed. Please try again.'; }

export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  async function run(action: () => Promise<unknown>) {
    if (locked.current) return false;
    locked.current = true; setPending(true); setError('');
    try { return (await action()) !== false; }
    catch (e) { setError(errorText(e)); return false; }
    finally { locked.current = false; setPending(false); }
  }
  return { pending, error, run };
}

export function ConfirmButton({ label = 'Delete', title, children, onConfirm, disabled = false }: { label?: string; title: string; children: ReactNode; onConfirm: () => Promise<unknown>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const action = useAction();
  return <><button type="button" className="btn danger" disabled={disabled} onClick={() => setOpen(true)}><Trash2 size={16} aria-hidden="true" />{label}</button>
    {open && <Dialog title={title} onClose={() => setOpen(false)} busy={action.pending}>
      <p>{children}</p>{action.error && <Notice error>{action.error}</Notice>}
      <div className="modal-actions"><button type="button" className="btn secondary" disabled={action.pending} onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn danger" disabled={action.pending} onClick={async () => { if (await action.run(onConfirm)) setOpen(false); }}>{action.pending ? 'Working…' : label}</button></div>
    </Dialog>}
  </>;
}

export function FormActions({ busy, invalid = false, onClose, label = 'Save' }: { busy: boolean; invalid?: boolean; onClose: () => void; label?: string }) {
  return <div className="modal-actions"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="btn primary" disabled={busy || invalid}>{busy ? 'Saving…' : label}</button></div>;
}