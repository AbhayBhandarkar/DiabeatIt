import { createContext, useContext } from 'react';
import type { Action, Snapshot } from '../shared/domain';
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Diabeatit-Client': 'web' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data;
  try { data = await response.json(); }
  catch { throw new ApiError('The application server is unavailable. Your change was not saved. Please retry when it is running.', response.status || 503); }
  if (!response.ok) throw new ApiError(data.error || 'Request failed', response.status);
  return data as T;
}
export type Page = 'today' | 'medicines' | 'food' | 'learn' | 'care' | 'settings' | 'reviewer';
export type AppContextValue = Snapshot & { act: (action: Action) => Promise<boolean>; busy: boolean; navigate: (page: Page) => void; notify: (message: string) => void; refresh: () => Promise<void> };
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() { const value = useContext(AppContext); if (!value) throw new Error('App context unavailable'); return value; }
export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
export function localInputNow() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }