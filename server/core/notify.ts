import type { Db } from './db.ts';
import { audit } from './db.ts';

/** What the pharmacist team is told. Deliberately contains no patient name, id or message text. */
export interface ReviewNotice {
  itemId: number;
  reason: string;
  priority: number;
}
export type Notifier = (n: ReviewNotice) => void;

const LABEL: Record<string, string> = { emergency: 'POSSIBLE EMERGENCY', urgent: 'Urgent' };

/** Only emergencies and urgent items interrupt anyone; everything else waits in the queue. */
export const NOTIFY_REASONS = new Set(['emergency', 'urgent']);

/**
 * Optional push path so urgent items are noticed without the workspace being open.
 * Set URGENT_WEBHOOK_URL to a Slack-style incoming webhook (or any endpoint that accepts JSON POST).
 *
 * Privacy: the payload carries only the item number, the reason and a fixed sentence. Pharmacists open
 * the workspace (behind sign-in) to see who and what. The URL must be https (http only for localhost).
 * Delivery is best effort, never blocks or fails the patient's request, and failures are audit-logged.
 */
export function createNotifier(db: Db, env: NodeJS.ProcessEnv = process.env, f: typeof fetch = fetch): { notify: Notifier | null; note: string } {
  const raw = (env.URGENT_WEBHOOK_URL || '').trim();
  if (!raw) return { notify: null, note: 'not configured (urgent items appear only in the workspace)' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { notify: null, note: 'URGENT_WEBHOOK_URL is not a valid URL; notifications are off' };
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    return { notify: null, note: 'URGENT_WEBHOOK_URL must use https; notifications are off' };
  }
  const notify: Notifier = (n) => {
    if (!NOTIFY_REASONS.has(n.reason)) return;
    const text = `Take Home Pharmacist: ${LABEL[n.reason] ?? n.reason} item #${n.itemId} is waiting in the review queue. Open the pharmacist workspace.`;
    const body = JSON.stringify({ text, itemId: n.itemId, reason: n.reason, priority: n.priority, at: new Date().toISOString() });
    void f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(5000), redirect: 'error' })
      .then((r) => {
        if (!r.ok) audit(db, 'system:notify', 'notify.failed', String(n.itemId), { status: r.status });
      })
      .catch((e) => {
        try {
          audit(db, 'system:notify', 'notify.failed', String(n.itemId), { error: String(e?.name || 'error') });
        } catch { /* database closed during shutdown */ }
      });
  };
  return { notify, note: `webhook on ${url.hostname}` };
}
