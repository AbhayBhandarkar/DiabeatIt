import { useEffect } from 'react';
import type { SnapshotResponse } from '../../shared/v2';
import { useProduct } from './context';
import { dataOf, istDate } from './ui';

/** The next unrecorded dose later today, in India time. Past slots are not reminded. */
export function nextOpenDose(snapshot: SnapshotResponse, now = new Date()) {
  const today = istDate(now);
  const weekday = new Date(`${today}T12:00:00+05:30`).getDay();
  const reports = snapshot.entities.intakes.filter(entry => dataOf<'intakes'>(entry).date === today);
  const slots = snapshot.entities.medicines.flatMap(entry => {
    const medicine = dataOf<'medicines'>(entry);
    if (medicine.status !== 'active' || !medicine.days.includes(weekday) || medicine.startDate > today || (medicine.endDate && medicine.endDate < today)) return [];
    return medicine.times.map(time => ({ id: entry.id, name: medicine.name, time, at: Date.parse(`${today}T${time}:00+05:30`) }));
  }).filter(slot => Number.isFinite(slot.at) && !reports.some(entry => {
    const report = dataOf<'intakes'>(entry);
    return report.medicineId === slot.id && report.scheduledTime === slot.time;
  })).sort((a, b) => a.at - b.at);
  return slots.find(slot => slot.at > now.getTime()) ?? null;
}

/** A notification only while this tab stays open. Closing the tab cancels it. */
export function OpenTabReminder({ enabled }: { enabled: boolean }) {
  const { snapshot } = useProduct();
  useEffect(() => {
    if (!enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const next = nextOpenDose(snapshot);
    if (!next) return;
    const delay = next.at - Date.now();
    if (delay <= 0 || delay > 12 * 60 * 60 * 1000) return;
    const timer = window.setTimeout(() => { void showDoseNotice(next); }, delay);
    return () => window.clearTimeout(timer);
  }, [enabled, snapshot]);
  return null;
}

async function showDoseNotice(next: { id: string; name: string; time: string }) {
  const title = 'Time to record a dose';
  const body = `${next.name} · ${next.time} IST. This only appears while DiabeatIT stays open. It does not mark the dose as taken.`;
  const tag = `diabeatit-dose-${next.id}-${next.time}`;
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration?.active) {
      registration.active.postMessage({ type: 'diabeatit-reminder', title, body, tag });
      return;
    }
  } catch { /* A page notification is the fallback where no service worker is registered. */ }
  const note = new Notification(title, { body, tag });
  note.onclick = () => { window.focus(); window.dispatchEvent(new Event('diabeatit-remind')); note.close(); };
}
