import type { MedicationScheduleItem } from '../types/pharmacy';
import { isNativeApp } from './api';

/**
 * Dose reminders.
 *
 * What is honest to promise:
 *  - In the native app: a notification every day at each time, even when the app is closed (iOS local notifications).
 *  - In a browser: a notification at each time ONLY while this page stays open. Browsers cannot do more without a push
 *    service, so the screen says so and tells the patient to set a phone alarm for anything important.
 *  - Reminders use each medicine's one stored usual time. A medicine taken more than once a day gets NO reminder,
 *    because its other times are not recorded and must not be guessed. The screen names it.
 *
 * Notification text is generic ("Time for your medicines"): it can show on a locked screen, so it never names a drug.
 */
export interface ReminderSlot {
  /** Stable notification id, the same every time for the same time of day. */
  id: number;
  time: string; // "08:00"
  hour: number;
  minute: number;
}

export const REMINDER_TITLE = 'Time for your medicines';
export const REMINDER_BODY = 'Open the app to see what to take now.';
const ID_BASE = 1000;

export function parseTime(t: string | undefined): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || '').trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/** Distinct usual times, earliest first, and the medicines that cannot be given a reminder. */
export function planReminders(meds: Array<Pick<MedicationScheduleItem, 'medicationName' | 'targetTime' | 'timeOfDay'>>): {
  slots: ReminderSlot[];
  skipped: string[];
} {
  const times = new Map<string, ReminderSlot>();
  const skipped: string[] = [];
  for (const m of meds) {
    const t = parseTime(m.targetTime);
    if (!t || (m.timeOfDay?.length ?? 0) !== 1) {
      skipped.push(m.medicationName); // several doses a day, or no usable time: do not guess
      continue;
    }
    const time = `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
    if (!times.has(time)) times.set(time, { id: ID_BASE + t.hour * 60 + t.minute, time, hour: t.hour, minute: t.minute });
  }
  return { slots: [...times.values()].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)), skipped };
}

/** Milliseconds from `now` until the next time the slot comes round (always > 0, at most 24 hours). */
export function msUntilNext(slot: Pick<ReminderSlot, 'hour' | 'minute'>, now: Date): number {
  const next = new Date(now);
  next.setHours(slot.hour, slot.minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export type ReminderMode = 'native' | 'page' | 'none';
export function reminderMode(): ReminderMode {
  if (isNativeApp()) return 'native';
  return typeof window !== 'undefined' && 'Notification' in window ? 'page' : 'none';
}

export type EnableResult = 'granted' | 'denied';

async function native() {
  return (await import('@capacitor/local-notifications')).LocalNotifications;
}

/** Native: ask permission and (re)schedule one repeating daily notification per slot. */
export async function enableNativeReminders(slots: ReminderSlot[]): Promise<EnableResult> {
  try {
    const LN = await native();
    const perm = await LN.requestPermissions();
    if (perm.display !== 'granted') return 'denied';
    await clearNativeReminders();
    await LN.schedule({
      notifications: slots.map((s) => ({
        id: s.id,
        title: REMINDER_TITLE,
        body: REMINDER_BODY,
        schedule: { on: { hour: s.hour, minute: s.minute }, allowWhileIdle: true },
      })),
    });
    return 'granted';
  } catch {
    return 'denied';
  }
}

export async function nativeRemindersOn(): Promise<boolean> {
  try {
    const LN = await native();
    return (await LN.checkPermissions()).display === 'granted' && (await LN.getPending()).notifications.length > 0;
  } catch {
    return false;
  }
}

export async function clearNativeReminders(): Promise<void> {
  try {
    const LN = await native();
    const { notifications } = await LN.getPending();
    if (notifications.length) await LN.cancel({ notifications });
  } catch { /* nothing scheduled, or not running natively */ }
}

/** Call on sign-out so reminders for one patient never keep firing on a phone another person may use. */
export async function clearAllReminders(): Promise<void> {
  if (isNativeApp()) await clearNativeReminders();
}
