import { apiFetch } from '../utils/api';
import React, { useState } from 'react';
import { ExternalLink, RefreshCw, Search } from 'lucide-react';
import { PhotoLookupResult } from '../types/pharmacy';
import { PhotoSourceProps } from './photoSourceTypes';
import { photoBinding } from '../utils/medicationPhoto';

/**
 * Last-resort source: package/label images from the FDA label on DailyMed. These
 * show the carton or bottle label, not the pill. One label covers several
 * strengths, so the pharmacist must pick the image that carries this product's NDC.
 *
 * The parent remounts this component when the NDC changes, so a slow response for
 * an old NDC can never be confirmed under a new one.
 */
export const PhotoSourceDailyMed: React.FC<PhotoSourceProps> = ({ medication: med, pharmacistName, onConfirm }) => {
  const ndc = (med.ndc || '').trim();
  const [results, setResults] = useState<PhotoLookupResult[] | null>(null);
  const [matchedNdc, setMatchedNdc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const resp = await apiFetch(`/api/medication-photo?ndc=${encodeURIComponent(ndc)}`);
      const data = await resp.json();
      if (!resp.ok || !data.success) setError(data.error || 'Lookup failed.');
      else {
        setResults(data.results as PhotoLookupResult[]);
        setMatchedNdc(data.matchedNdc);
      }
    } catch {
      setError('Could not reach the server. No photo will be shown to the patient.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = (label: PhotoLookupResult, imageUrl: string) => {
    onConfirm({
      source: 'dailymed_label',
      boundTo: photoBinding(med),
      imageUrl,
      sourceUrl: label.sourceUrl,
      attribution: 'FDA drug label on DailyMed',
      details: { ndc: label.ndc, labelTitle: label.labelTitle, labelVersion: label.labelVersion, setId: label.setId },
      retrievedAt: label.retrievedAt,
      confirmedBy: pharmacistName,
      confirmedAt: new Date().toISOString(),
    });
    setResults(null);
  };

  return (
    <div className="space-y-3">
      <p className="text-slate-600 dark:text-slate-300">
        Package and label images from the FDA label (US products). Most labels have no photo of the tablet itself. Use this
        only if you have no pill photo; patients are told it may show the package.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleLookup}
          disabled={loading || !ndc}
          className="px-3.5 py-1.5 bg-slate-900 dark:bg-teal-600 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Search className="w-3.5 h-3.5" aria-hidden="true" />}
          Find label photos
        </button>
        <span className="text-slate-500">
          {ndc ? (
            <>
              for NDC <span className="font-mono">{ndc}</span>
            </>
          ) : (
            'Enter the NDC above first.'
          )}
        </span>
      </div>

      {error && (
        <p role="alert" className="font-semibold text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
      {results && results.length === 0 && (
        <p className="text-slate-500">No FDA label found for NDC {ndc}. Check the number on the bottle. Patients will see the placeholder.</p>
      )}
      {results && results.length > 0 && matchedNdc && matchedNdc !== ndc && (
        <p className="text-slate-500">DailyMed matched this as {matchedNdc}.</p>
      )}

      {results?.map((label) => (
        <div key={label.setId} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2">
          <div>
            <p className="font-bold text-slate-800 dark:text-slate-100">{label.labelTitle}</p>
            <p className="text-slate-500">
              {label.labelVersion} ·{' '}
              <a href={label.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-teal-700 dark:text-teal-400 underline">
                open label
              </a>
            </p>
          </div>
          <p className="text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded p-2">
            Compare against the bottle in front of you: strength and NDC. One label can cover several strengths and also
            contains chemical structures. Confirm an image only if it carries this product's exact NDC.
          </p>
          {label.candidates.length === 0 ? (
            <p className="text-slate-500">This label has no images.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {label.candidates.map((c) => (
                <div key={c.imageUrl} className="space-y-1.5">
                  <img
                    src={c.imageUrl}
                    alt={`Candidate ${c.name} from label`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-28 object-contain bg-white rounded border border-slate-200"
                  />
                  <a href={c.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 underline">
                    Open full size <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleConfirm(label, c.imageUrl)}
                    className="w-full px-2 py-1.5 bg-teal-700 hover:bg-teal-800 text-white font-semibold rounded-lg"
                  >
                    This is the dispensed product
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
