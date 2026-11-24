import { apiFetch } from '../utils/api';
import React, { useState } from 'react';
import { Pill, Search, ExternalLink } from 'lucide-react';

interface LabelResult {
  name: string;
  rxcui: string;
  source: { url: string; setId: string; version?: string; effective?: string; publisher: string };
  sections: Array<{ section: string; text: string }>;
}

/**
 * Pharmacist drug reference. Text is the FDA label's own wording (via DailyMed), shown with its
 * source and date. This replaces the old hand-written catalog, which had no sources.
 */
export const DrugCatalogSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<LabelResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async (e?: React.FormEvent, term = query) => {
    e?.preventDefault();
    if (!term.trim()) return;
    setLoading(true);
    setMessage(null);
    setResult(null);
    try {
      const r = await apiFetch(`/api/drug-lookup?q=${encodeURIComponent(term.trim())}`);
      const d = await r.json();
      if (!r.ok) setMessage(d.error || 'Lookup failed.');
      else if (d.results?.length) setResult(d.results[0]);
      else setMessage(d.message || 'Nothing found.');
    } catch {
      setMessage('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
        <Pill className="w-5 h-5 text-blue-700" aria-hidden="true" />
        <h2 className="text-base font-bold">FDA label lookup</h2>
      </div>
      <form onSubmit={search} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Drug name"
            placeholder="Generic or brand name, e.g. atorvastatin"
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
          />
        </div>
        <button type="submit" disabled={loading || !query.trim()} className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
          {loading ? 'Looking up…' : 'Look up'}
        </button>
      </form>

      {message && <p role="status" className="text-sm text-slate-700 dark:text-slate-200">{message}</p>}

      {result && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {result.source.publisher}. Label version {result.source.version || '?'}, effective {result.source.effective || 'date not listed'}. RxNorm id {result.rxcui}.{' '}
            <a href={result.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline text-teal-800 dark:text-teal-300">
              Full label <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </p>
          <p className="text-xs text-slate-500">One manufacturer's label, shown as written. Excerpts are shortened. Not a substitute for your clinical references.</p>
          {result.sections.map((s) => (
            <details key={s.section} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
              <summary className="cursor-pointer font-semibold text-slate-900 dark:text-slate-100">{s.section}</summary>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{s.text}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
};
