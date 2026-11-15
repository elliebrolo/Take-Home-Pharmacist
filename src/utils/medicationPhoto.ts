import { MedicationScheduleItem, VerifiedMedicationPhoto } from '../types/pharmacy';

const DAILYMED_HOST = 'dailymed.nlm.nih.gov';

function isDailyMedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname === DAILYMED_HOST;
  } catch {
    return false;
  }
}

/**
 * The single rule that decides whether a patient sees a medication photo.
 *
 * A photo is shown only when ALL of these hold:
 *  - the pharmacist recorded an NDC for the dispensed bottle,
 *  - a photo is attached, and it was confirmed against that same NDC
 *    (so changing the NDC, e.g. a refill from a different manufacturer,
 *    silently reverts to the placeholder),
 *  - a pharmacist name and confirmation time are recorded,
 *  - the image and its source label are on DailyMed.
 *
 * Anything else returns null and the UI shows the neutral placeholder. Colour,
 * shape and imprint fields are never used to produce an image.
 */
export function getVerifiedPhoto(med: MedicationScheduleItem): VerifiedMedicationPhoto | null {
  const photo = med.photo;
  if (!med.ndc || !photo) return null;
  if (photo.ndc !== med.ndc) return null;
  if (!photo.confirmedBy || !photo.confirmedAt) return null;
  if (!isDailyMedUrl(photo.imageUrl) || !isDailyMedUrl(photo.sourceUrl)) return null;
  return photo;
}

/** "20:00" -> "8:00 PM". Returns the input unchanged if it is not HH:MM. */
export function formatTime12h(time24: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time24 || '').trim());
  if (!m) return time24;
  const hours = parseInt(m[1], 10);
  if (hours > 23) return time24;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${m[2]} ${suffix}`;
}
