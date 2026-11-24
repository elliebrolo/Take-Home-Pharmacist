import { ApiImage } from './ApiImage';
import { apiFetch } from '../utils/api';
import React, { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { NlmCandidate } from '../types/pharmacy';
import { PhotoSourceProps } from './photoSourceTypes';
import { photoBinding } from '../utils/medicationPhoto';

interface NlmResponse {
  attribution: string;
  totalMatches: number;
  notDownloaded: number;
  candidates: NlmCandidate[];
}

/**
 * Secondary source: US reference photos (NLM RxImage). These are photographs of
 * real tablets of the same drug and strength, but made by US manufacturers, so
 * the Canadian pill may differ. Offered as candidates only; the pharmacist
 * confirms a match by comparing imprint, shape and colour with the dispensed pill.
 *
 * The parent remounts this component when the medication's name/strength/form
 * changes, so results for an earlier identity can never be confirmed.
 */
export const PhotoSourceNlm: React.FC<PhotoSourceProps> = ({ medication: med, pharmacistName, onConfirm }) => {
  const [data, setData] = useState<NlmResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      name: med.medicationName,
      generic: med.genericName || '',
      strength: med.strength,
      dosageForm: med.dosageForm,
    });
    apiFetch(`/api/medication-photo/nlm?${params}`)
      .then(async (resp) => {
        const body = await resp.json().catch(() => ({}));
        if (cancelled) return;
        if (!resp.ok || !body.success) setError(body.error || 'Lookup failed.');
        else setData(body as NlmResponse);
      })
      .catch(() => !cancelled && setError('Could not reach the server.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = (c: NlmCandidate) => {
    onConfirm({
      source: 'nlm_rximage',
      boundTo: photoBinding(med),
      imageUrl: c.imageUrl,
      attribution: data?.attribution || 'Courtesy of the U.S. National Library of Medicine',
      details: { labeler: c.labeler, imprint: c.imprint, ndc: c.ndc },
      retrievedAt: new Date().toISOString(),
      confirmedBy: pharmacistName,
      confirmedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded p-2">
        These are photographs of US products (NLM archive, 2009–2016). Confirm one only if its imprint, shape and colour
        match the pill you dispensed. Canadian generics often look different. Patients are told it is a US reference photo.
      </p>

      {loading && (
        <p className="flex items-center gap-1.5 text-slate-500">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Searching reference photos…
        </p>
      )}
      {error && (
        <p role="alert" className="font-semibold text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
      {data && data.candidates.length === 0 && (
        <p className="text-slate-500">
          No reference photo for {med.medicationName} {med.strength}.
          {data.notDownloaded > 0 &&
            ` ${data.notDownloaded} exist in the NLM archive but are not downloaded on this server (run npm run nlm:fetch -- --match ${(med.genericName || med.medicationName).split(' ')[0].toLowerCase()}).`}{' '}
          Patients will see the placeholder unless you use another source.
        </p>
      )}

      {data && data.candidates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.candidates.map((c) => (
            <div key={c.imageUrl} className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1.5">
              <ApiImage
                src={c.imageUrl}
                alt={`Reference photo: ${c.name}, ${c.labeler}`}
                loading="lazy"
                className="w-full h-40 object-contain bg-slate-100 rounded"
              />
              <p className="font-semibold text-slate-800 dark:text-slate-100">{c.labeler || 'Unknown manufacturer'}</p>
              <p className="text-slate-600 dark:text-slate-300">
                Imprint: <span className="font-mono">{c.imprint || 'none recorded'}</span>
                {' · '}
                {[c.shape, c.color, c.sizeMm ? `${c.sizeMm} mm` : ''].filter(Boolean).join(' · ')}
              </p>
              <p className="text-slate-500 font-mono">NDC {c.ndc}</p>
              <a href={c.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 underline">
                Open full size <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={() => handleConfirm(c)}
                className="w-full px-2 py-1.5 bg-teal-700 hover:bg-teal-800 text-white font-semibold rounded-lg"
              >
                This matches the pill I dispensed
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
