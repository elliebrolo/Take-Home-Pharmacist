import React, { useState } from 'react';
import { Camera, CheckCircle2, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { MedicationScheduleItem, PhotoLookupResult, VerifiedMedicationPhoto } from '../types/pharmacy';
import { getVerifiedPhoto } from '../utils/medicationPhoto';

interface MedicationPhotoVerifierProps {
  medication: MedicationScheduleItem;
  pharmacistName: string;
  onNdcChange: (ndc: string) => void;
  onConfirmPhoto: (photo: VerifiedMedicationPhoto) => void;
  onRemovePhoto: () => void;
}

/**
 * Pharmacist-only control for attaching a verified photo to one medication.
 *
 * Flow: enter the NDC from the dispensed bottle -> look up the FDA label on
 * DailyMed -> compare candidate images against the bottle -> confirm one.
 * Nothing is shown to the patient until a pharmacist presses "Confirm", and the
 * confirmation is dropped if the NDC, name or strength later changes.
 */
export const MedicationPhotoVerifier: React.FC<MedicationPhotoVerifierProps> = ({
  medication: med,
  pharmacistName,
  onNdcChange,
  onConfirmPhoto,
  onRemovePhoto,
}) => {
  const [results, setResults] = useState<PhotoLookupResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verified = getVerifiedPhoto(med);
  const ndc = (med.ndc || '').trim();

  const handleLookup = async () => {
    setIsLoading(true);
    setError(null);
    setResults(null);
    try {
      const resp = await fetch(`/api/medication-photo?ndc=${encodeURIComponent(ndc)}`);
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        setError(data.error || 'Lookup failed.');
        return;
      }
      setResults(data.results as PhotoLookupResult[]);
    } catch {
      setError('Could not reach the server. No photo will be shown to the patient.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = (label: PhotoLookupResult, imageUrl: string) => {
    onConfirmPhoto({
      ndc,
      imageUrl,
      sourceUrl: label.sourceUrl,
      setId: label.setId,
      labelTitle: label.labelTitle,
      labelVersion: label.labelVersion,
      retrievedAt: label.retrievedAt,
      confirmedBy: pharmacistName,
      confirmedAt: new Date().toISOString(),
    });
    setResults(null);
  };

  return (
    <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800/60 text-xs space-y-3">
      <div className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
        <Camera className="w-4 h-4 text-teal-600" aria-hidden="true" />
        Patient-facing medication photo
      </div>

      {verified ? (
        <div className="flex items-start gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg">
          <img
            src={verified.imageUrl}
            alt={`Confirmed label photo for ${med.medicationName} ${med.strength}`}
            referrerPolicy="no-referrer"
            className="w-20 h-20 object-contain bg-white rounded border border-slate-200"
          />
          <div className="flex-1 min-w-0 space-y-1">
            <p className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Confirmed. Patients see this photo.
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              NDC {verified.ndc} · {verified.labelVersion}
            </p>
            <p className="text-slate-500">
              Confirmed by {verified.confirmedBy} on {new Date(verified.confirmedAt).toLocaleString()}
            </p>
            <a
              href={verified.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 underline"
            >
              View source label <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>
          <button
            type="button"
            onClick={onRemovePhoto}
            className="px-2.5 py-1.5 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 rounded-lg flex items-center gap-1 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Remove
          </button>
        </div>
      ) : (
        <p className="text-slate-500">
          No confirmed photo. Patients see a neutral “no photo” placeholder for this medication.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`ndc-${med.id}`} className="block text-slate-500 font-semibold mb-1">
            NDC from the dispensed bottle
          </label>
          <input
            id={`ndc-${med.id}`}
            type="text"
            value={med.ndc || ''}
            onChange={(e) => {
              setResults(null);
              setError(null);
              onNdcChange(e.target.value);
            }}
            placeholder="e.g. 58151-157-77"
            className="w-48 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono"
          />
        </div>
        <button
          type="button"
          onClick={handleLookup}
          disabled={isLoading || !ndc}
          className="px-3.5 py-1.5 bg-slate-900 dark:bg-teal-600 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center gap-1.5"
        >
          {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Camera className="w-3.5 h-3.5" aria-hidden="true" />}
          Find label photos
        </button>
      </div>

      {error && (
        <p role="alert" className="font-semibold text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}

      {results && results.length === 0 && (
        <p className="text-slate-500">
          No FDA label found for NDC {ndc}. Check the number on the bottle. Patients will see the placeholder.
        </p>
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
            Compare against the bottle in front of you: strength, colour, shape and imprint. One label can cover several
            strengths, and many labels have no tablet photo at all, only package art and chemical structures. Confirm an
            image only if it matches the product you dispensed (a package image with your exact NDC is acceptable).
            Otherwise leave it unconfirmed and patients see the placeholder.
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
