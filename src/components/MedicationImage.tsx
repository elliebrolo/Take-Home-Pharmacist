import React from 'react';
import { Pill } from 'lucide-react';
import { MedicationScheduleItem } from '../types/pharmacy';
import { getVerifiedPhoto } from '../utils/medicationPhoto';

interface MedicationImageProps {
  medication: MedicationScheduleItem;
  size?: 'sm' | 'lg';
}

/**
 * Shows a pharmacist-confirmed photo of the dispensed product, or a neutral
 * placeholder. The placeholder is the same for every medication on purpose, so
 * it can never be mistaken for what the pill looks like. Nothing here is drawn
 * from colour/shape/imprint data.
 */
export const MedicationImage: React.FC<MedicationImageProps> = ({ medication, size = 'sm' }) => {
  const photo = getVerifiedPhoto(medication);
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

  return (
    <img
      src={photo.imageUrl}
      alt={`FDA label image for ${medication.medicationName} ${medication.strength}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`${box} shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white object-contain`}
    />
  );
};

/** Caption shown with the large image in the expanded card. */
export const MedicationImageCaption: React.FC<{ medication: MedicationScheduleItem }> = ({ medication }) => {
  const photo = getVerifiedPhoto(medication);

  if (!photo) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-300">
        No photo is available for this medicine. Check the name and strength on your bottle label.
      </p>
    );
  }

  return (
    <p className="text-sm text-slate-600 dark:text-slate-300">
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
      different. Always check the name and strength on your bottle label.
    </p>
  );
};
