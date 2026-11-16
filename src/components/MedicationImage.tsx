import React from 'react';
import { Pill } from 'lucide-react';
import { MedicationScheduleItem } from '../types/pharmacy';
import { getVerifiedPhoto, photoKind } from '../utils/medicationPhoto';

interface MedicationImageProps {
  medication: MedicationScheduleItem;
  size?: 'sm' | 'lg';
  /** The image file failed to load (e.g. the NLM set is not downloaded): show the placeholder instead. */
  failed?: boolean;
  onError?: () => void;
}

/**
 * Shows a pharmacist-confirmed image of the medication, or a neutral
 * placeholder. The placeholder is the same for every medication on purpose, so
 * it can never be mistaken for what the pill looks like. Nothing here is drawn
 * from colour/shape/imprint data.
 */
export const MedicationImage: React.FC<MedicationImageProps> = ({ medication, size = 'sm', failed = false, onError }) => {
  const photo = failed ? null : getVerifiedPhoto(medication);
  const box = size === 'lg' ? 'w-40 h-40' : 'w-16 h-16';

  if (!photo) {
    return (
      <div
        role="img"
        aria-label="No photo available for this medication. Check your bottle label."
        className={`${box} shrink-0 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center text-center p-1`}
      >
        <Pill className={size === 'lg' ? 'w-10 h-10' : 'w-6 h-6'} aria-hidden="true" />
        {size === 'lg' && <span className="text-sm mt-1.5 leading-tight">No photo</span>}
      </div>
    );
  }

  const alt =
    photoKind(photo) === 'pill'
      ? `Photo of ${medication.medicationName} ${medication.strength}`
      : `Package label image for ${medication.medicationName} ${medication.strength}`;

  return (
    <img
      src={photo.imageUrl}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={onError}
      className={`${box} shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white object-contain`}
    />
  );
};

const CHECK_BOTTLE = 'Always check the name and strength on your bottle label.';

/** Caption shown with the large image in the expanded card. Wording depends on where the image came from. */
export const MedicationImageCaption: React.FC<{ medication: MedicationScheduleItem; failed?: boolean }> = ({ medication, failed = false }) => {
  const photo = failed ? null : getVerifiedPhoto(medication);
  const text = 'text-sm text-slate-600 dark:text-slate-300';

  if (!photo) {
    return (
      <div className="space-y-1.5">
        <p className={text}>No photo is available for this medicine. {CHECK_BOTTLE}</p>
        {medication.appearance?.trim() && (
          <p className={text}>
            <span className="font-semibold text-slate-800 dark:text-slate-100">Your pharmacist describes it as: </span>
            {medication.appearance.trim()}
          </p>
        )}
      </div>
    );
  }

  const date = new Date(photo.confirmedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  if (photo.demo) {
    return (
      <p className={text}>
        Demo image. {photo.attribution}. This is a reference photo of the same medicine and strength
        {photo.details?.labeler ? ` made by ${photo.details.labeler}` : ''}. It has not been checked by a pharmacist, and your
        pills may look different. {CHECK_BOTTLE}
      </p>
    );
  }

  if (photo.source === 'pharmacist_photo') {
    return (
      <p className={text}>
        Photo of your medicine, taken by {photo.confirmedBy} on {date}. {CHECK_BOTTLE}
      </p>
    );
  }

  if (photo.source === 'nlm_rximage') {
    return (
      <p className={text}>
        {photo.attribution}. This is a reference photo of the same medicine and strength made by a US manufacturer
        {photo.details?.labeler ? ` (${photo.details.labeler})` : ''}. Your pills may look different, for example in colour
        or markings, because yours may be made by another company. Checked by {photo.confirmedBy}. {CHECK_BOTTLE}
      </p>
    );
  }

  return (
    <p className={text}>
      Image from the{' '}
      <a
        href={photo.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-teal-700 dark:text-teal-400"
      >
        FDA drug label (DailyMed)
      </a>
      , checked by {photo.confirmedBy}. It may show the package instead of the pill, and your pills may look a little
      different. {CHECK_BOTTLE}
    </p>
  );
};
