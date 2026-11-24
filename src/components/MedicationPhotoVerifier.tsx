import { ApiImage } from './ApiImage';
import { apiFetch } from '../utils/api';
import React, { useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { DpdProduct, MedicationScheduleItem, PhotoSource, VerifiedMedicationPhoto } from '../types/pharmacy';
import { getVerifiedPhoto } from '../utils/medicationPhoto';
import { PhotoSourceUpload } from './PhotoSourceUpload';
import { PhotoSourceNlm } from './PhotoSourceNlm';
import { PhotoSourceDailyMed } from './PhotoSourceDailyMed';

interface MedicationPhotoVerifierProps {
  medication: MedicationScheduleItem;
  pharmacistName: string;
  /** Edit a field on the medication (din, ndc, appearance). Identity fields drop any confirmed photo. */
  onFieldChange: (field: 'din' | 'ndc' | 'appearance', value: string) => void;
  onConfirmPhoto: (photo: VerifiedMedicationPhoto) => void;
  onRemovePhoto: () => void;
}

const SOURCE_LABEL: Record<PhotoSource, string> = {
  pharmacist_photo: 'Photo taken by the pharmacist',
  nlm_rximage: 'US reference photo (NLM)',
  dailymed_label: 'Package image (DailyMed)',
};

const TABS: Array<{ id: PhotoSource; label: string }> = [
  { id: 'pharmacist_photo', label: 'Photograph the pill' },
  { id: 'nlm_rximage', label: 'US reference photos' },
  { id: 'dailymed_label', label: 'Package image' },
];

/** Does the strength the pharmacist typed appear in the Health Canada record? */
function strengthMatchesDpd(medStrength: string, dpd: DpdProduct): boolean {
  const wanted = (medStrength.match(/\d+(?:\.\d+)?/g) || []).map((n) => parseFloat(n));
  if (wanted.length === 0) return true;
  const have = dpd.ingredients.flatMap((i) => (i.strength.match(/\d+(?:\.\d+)?/g) || []).map((n) => parseFloat(n)));
  return wanted.every((w) => have.includes(w));
}

/**
 * Pharmacist-only control for attaching a verified image to one medication.
 *
 * Nothing reaches the patient until a pharmacist presses a "confirm" button, and
 * a confirmation is dropped if the product's identity (NDC, DIN, name, strength,
 * form) later changes. Sources in order of preference: the pharmacist's own photo
 * of the dispensed pill, US reference photos (NLM), then DailyMed package images.
 */
export const MedicationPhotoVerifier: React.FC<MedicationPhotoVerifierProps> = ({
  medication: med,
  pharmacistName,
  onFieldChange,
  onConfirmPhoto,
  onRemovePhoto,
}) => {
  const [tab, setTab] = useState<PhotoSource>('pharmacist_photo');
  const [dpd, setDpd] = useState<DpdProduct | null | 'not_found'>(null);
  const [dpdLoading, setDpdLoading] = useState(false);
  const [dpdError, setDpdError] = useState<string | null>(null);

  const verified = getVerifiedPhoto(med);
  const din = (med.din || '').trim();

  const handleDpdLookup = async () => {
    setDpdLoading(true);
    setDpdError(null);
    setDpd(null);
    try {
      const resp = await apiFetch(`/api/dpd?din=${encodeURIComponent(din)}`);
      const data = await resp.json();
      if (!resp.ok || !data.success) setDpdError(data.error || 'Lookup failed.');
      else setDpd(data.found ? (data as DpdProduct) : 'not_found');
    } catch {
      setDpdError('Could not reach the server.');
    } finally {
      setDpdLoading(false);
    }
  };

  const panelProps = { medication: med, pharmacistName, onConfirm: onConfirmPhoto };
  const inputClass =
    'px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono';

  return (
    <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800/60 text-xs space-y-3">
      <div className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
        <Camera className="w-4 h-4 text-teal-600" aria-hidden="true" />
        Patient-facing medication image
      </div>

      {/* Current state */}
      {verified ? (
        <div className="flex items-start gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg">
          <ApiImage
            src={verified.imageUrl}
            alt={`Confirmed image for ${med.medicationName} ${med.strength}`}
            referrerPolicy="no-referrer"
            className="w-20 h-20 object-contain bg-white rounded border border-slate-200"
          />
          <div className="flex-1 min-w-0 space-y-1">
            <p className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              {verified.demo ? 'Demo image, not verified by a pharmacist. Patients see this image.' : 'Confirmed. Patients see this image.'}
            </p>
            <p className="text-slate-600 dark:text-slate-300">{SOURCE_LABEL[verified.source]}</p>
            {verified.details?.labeler && (
              <p className="text-slate-500">
                {verified.details.labeler}
                {verified.details.imprint ? ` · imprint ${verified.details.imprint}` : ''}
              </p>
            )}
            {verified.demo ? (
              <p className="text-amber-800 dark:text-amber-300">
                Pre-attached sample photo. Choose a source below to replace it with one you have checked, or remove it.
              </p>
            ) : (
              <p className="text-slate-500">
                Confirmed by {verified.confirmedBy} on {new Date(verified.confirmedAt).toLocaleString()}
              </p>
            )}
            {verified.sourceUrl && (
              <a href={verified.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 underline">
                View source label <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            )}
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
          {med.photo
            ? 'The earlier confirmation no longer applies because the product details changed. '
            : 'No confirmed image. '}
          Patients see a neutral “no photo” placeholder
          {med.appearance?.trim() ? ' with your description' : ''}.
        </p>
      )}

      {/* Product identity: part of what a confirmation is bound to */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor={`din-${med.id}`} className="block text-slate-500 font-semibold mb-1">
            DIN (Health Canada)
          </label>
          <div className="flex gap-1.5">
            <input
              id={`din-${med.id}`}
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={med.din || ''}
              onChange={(e) => {
                setDpd(null);
                setDpdError(null);
                onFieldChange('din', e.target.value.replace(/\D/g, ''));
              }}
              placeholder="02230711"
              className={`w-28 ${inputClass}`}
            />
            <button
              type="button"
              onClick={handleDpdLookup}
              disabled={dpdLoading || !din}
              className="px-2.5 py-1.5 bg-slate-900 dark:bg-teal-600 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center gap-1"
            >
              {dpdLoading && <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />}
              Check
            </button>
          </div>
        </div>
        <div>
          <label htmlFor={`ndc-${med.id}`} className="block text-slate-500 font-semibold mb-1">
            NDC (US products, optional)
          </label>
          <input
            id={`ndc-${med.id}`}
            type="text"
            value={med.ndc || ''}
            onChange={(e) => onFieldChange('ndc', e.target.value.replace(/\s/g, ''))}
            placeholder="e.g. 58151-157-77"
            className={`w-full ${inputClass}`}
          />
        </div>
        <div>
          <label htmlFor={`appearance-${med.id}`} className="block text-slate-500 font-semibold mb-1">
            Describe the pill (shown if there is no photo)
          </label>
          <input
            id={`appearance-${med.id}`}
            type="text"
            maxLength={160}
            value={med.appearance || ''}
            onChange={(e) => onFieldChange('appearance', e.target.value)}
            placeholder='e.g. white, oval, marked "PD 157"'
            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      {dpdError && (
        <p role="alert" className="font-semibold text-rose-700 dark:text-rose-300">
          {dpdError}
        </p>
      )}
      {dpd === 'not_found' && (
        <p className="text-amber-800 dark:text-amber-300">No Health Canada product found for DIN {din.padStart(8, '0')}. Check the number on the bottle.</p>
      )}
      {dpd && dpd !== 'not_found' && (
        <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1">
          <p className="text-slate-800 dark:text-slate-100">
            <span className="font-bold">{dpd.brandName}</span> · {dpd.company} · {dpd.form || 'form not listed'} · {dpd.status || 'status not listed'}
          </p>
          <p className="text-slate-600 dark:text-slate-300">
            {dpd.ingredients.map((i) => `${i.name} ${i.strength}`.trim()).join(' + ') || 'No ingredients listed'}
          </p>
          {!strengthMatchesDpd(med.strength, dpd) && (
            <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
              The strength you entered ({med.strength}) differs from this DIN's record. Check you have the right DIN.
            </p>
          )}
          <p className="text-slate-400">Health Canada Drug Product Database, Open Government Licence – Canada.</p>
        </div>
      )}

      {/* Where to get the image from */}
      <div role="tablist" aria-label="Image source" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg font-semibold border ${
              tab === t.id
                ? 'bg-teal-700 text-white border-teal-700'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg">
        {tab === 'pharmacist_photo' && <PhotoSourceUpload {...panelProps} />}
        {/* Keyed so a change of identity discards results (and any in-flight response) for the old one. */}
        {tab === 'nlm_rximage' && (
          <PhotoSourceNlm key={`${med.medicationName}|${med.genericName}|${med.strength}|${med.dosageForm}`} {...panelProps} />
        )}
        {tab === 'dailymed_label' && <PhotoSourceDailyMed key={(med.ndc || '').trim()} {...panelProps} />}
      </div>
    </div>
  );
};
