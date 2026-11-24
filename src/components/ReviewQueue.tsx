import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, RefreshCw, Send } from 'lucide-react';
import { notificationService } from '../utils/audioNotification';

interface Item {
  id: number;
  patientName: string;
  reason: string;
  priority: number;
  question: string;
  detail: any;
  createdAt: string;
}

const REASON: Record<string, { label: string; tone: string }> = {
  emergency: { label: 'Possible emergency', tone: 'bg-rose-100 text-rose-900 border-rose-300' },
  urgent: { label: 'Urgent', tone: 'bg-amber-100 text-amber-900 border-amber-300' },
  needs_pharmacist: { label: 'Needs a pharmacist', tone: 'bg-amber-50 text-amber-900 border-amber-200' },
  validation_failed: { label: 'Answer blocked by checks', tone: 'bg-slate-100 text-slate-900 border-slate-300' },
  llm_unavailable: { label: 'Could not answer', tone: 'bg-slate-100 text-slate-900 border-slate-300' },
  audit: { label: 'Spot check', tone: 'bg-blue-50 text-blue-900 border-blue-200' },
  label_changed: { label: 'Drug label changed', tone: 'bg-violet-50 text-violet-900 border-violet-200' },
};

/** Pharmacist inbox: everything the assistant escalated, refused, or sampled for review. */
export const ReviewQueue: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const seen = useRef<Set<number> | null>(null); // null until the first load, so opening the page does not chime

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/review-items');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      // Alert (once per item) when a new emergency or urgent item arrives while this page is open.
      const urgent: Item[] = d.items.filter((i: Item) => i.priority <= 2);
      if (seen.current && urgent.some((i) => !seen.current!.has(i.id))) notificationService.playEmergencyAlertTone();
      seen.current = new Set(urgent.map((i) => i.id));
      setItems(d.items);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Could not load the review queue.');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (id: number, path: 'reply' | 'resolve', body: object) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/review-items/${id}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <details open={items.length > 0} className="mb-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <summary className="cursor-pointer min-h-11 px-5 py-3 flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
        <Inbox className="w-5 h-5 text-teal-700" aria-hidden="true" />
        Patient questions to review
        <span className={`ml-1 px-2 py-0.5 text-xs rounded-full ${items.length ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{items.length}</span>
        <button type="button" onClick={(e) => { e.preventDefault(); load(); }} className="ml-auto text-sm font-semibold text-teal-800 flex items-center gap-1">
          <RefreshCw className="w-4 h-4" aria-hidden="true" /> Refresh
        </button>
      </summary>
      <div className="px-5 pb-5 space-y-3">
        {error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}
        {items.length === 0 && !error && <p className="text-sm text-slate-600 dark:text-slate-300">Nothing waiting.</p>}
        {items.map((it) => {
          const tag = REASON[it.reason] ?? { label: it.reason, tone: 'bg-slate-100 text-slate-900 border-slate-300' };
          const reasons: string[] | undefined = it.detail?.reasons;
          return (
            <div key={it.id} className="p-3 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`px-2 py-0.5 rounded border font-bold ${tag.tone}`}>{tag.label}</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{it.patientName}</span>
                <span className="text-slate-500">{new Date(it.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-base text-slate-900 dark:text-slate-100">{it.reason === 'label_changed' ? it.question : `“${it.question}”`}</p>
              {reasons && (
                <p className="text-sm text-slate-600 dark:text-slate-300 flex gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" /> Blocked because: {reasons.join('; ')}
                </p>
              )}
              {it.detail?.answer && <p className="text-sm text-slate-600 dark:text-slate-300">Assistant answered: {it.detail.answer}</p>}
              {it.reason === 'label_changed' ? (
                <div className="space-y-2">
                  {it.detail?.changedSections?.length > 0 && (
                    <p className="text-sm text-slate-600 dark:text-slate-300">Sections that changed: {it.detail.changedSections.join(', ')}</p>
                  )}
                  {it.detail?.url && (
                    <a href={it.detail.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-teal-800 underline">Open the label on DailyMed</a>
                  )}
                  <div>
                    <button type="button" disabled={busy === it.id} onClick={() => act(it.id, 'resolve', {})} className="min-h-11 px-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Mark reviewed
                    </button>
                  </div>
                </div>
              ) : it.reason === 'audit' ? (
                <div className="flex flex-wrap gap-2">
                  {(['ok', 'wrong', 'unsafe'] as const).map((flag) => (
                    <button key={flag} type="button" disabled={busy === it.id} onClick={() => act(it.id, 'resolve', { flag })} className="min-h-11 px-3 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-semibold">
                      {flag === 'ok' ? 'Answer was fine' : flag === 'wrong' ? 'Wrong' : 'Unsafe'}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-2">
                  <textarea
                    value={replies[it.id] || ''}
                    onChange={(e) => setReplies((r) => ({ ...r, [it.id]: e.target.value }))}
                    aria-label={`Reply to ${it.patientName}`}
                    rows={2}
                    maxLength={2000}
                    placeholder="Reply to the patient (shown in their chat as written by you)"
                    className="flex-1 px-3 py-2 text-base bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                  <div className="flex flex-col gap-2">
                    <button type="button" disabled={busy === it.id || !(replies[it.id] || '').trim()} onClick={() => act(it.id, 'reply', { text: replies[it.id] })} className="min-h-11 px-3 bg-teal-700 text-white rounded-lg text-sm font-bold flex items-center gap-1 disabled:opacity-50">
                      <Send className="w-4 h-4" aria-hidden="true" /> Reply
                    </button>
                    <button type="button" disabled={busy === it.id} onClick={() => act(it.id, 'resolve', {})} className="min-h-11 px-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
};
