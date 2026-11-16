import { MedicationScheduleItem, PhotoSource, VerifiedMedicationPhoto } from '../types/pharmacy';

const DAILYMED_HOST = 'dailymed.nlm.nih.gov';

function isDailyMedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname === DAILYMED_HOST;
  } catch {
    return false;
  }
}

/** Where each source's image may live. Anything else is rejected, whatever the record says. */
const SOURCE_URL_RULES: Record<PhotoSource, (url: string) => boolean> = {
  pharmacist_photo: (u) => /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(u),
  nlm_rximage: (u) => /^\/nlm-images\/600\/[A-Za-z0-9._-]+\.jpg$/.test(u),
  dailymed_label: isDailyMedUrl,
};

/**
 * Identity of the dispensed product. A confirmation is only valid for the exact
 * product it was checked against, so any change to one of these (for example a
 * refill from another manufacturer, which has a new NDC/DIN) invalidates it.
 */
export function photoBinding(med: MedicationScheduleItem): string {
  const norm = (v?: string) => (v || '').trim().toLowerCase();
  return JSON.stringify([norm(med.ndc), norm(med.din), norm(med.medicationName), norm(med.strength), norm(med.dosageForm)]);
}

/** 'pill' for photographs of the tablet, 'package' for label/carton art. */
export function photoKind(photo: VerifiedMedicationPhoto): 'pill' | 'package' {
  return photo.source === 'dailymed_label' ? 'package' : 'pill';
}

/**
 * The single rule that decides whether a patient sees a medication image.
 *
 * A photo is shown only when ALL of these hold:
 *  - a pharmacist name and confirmation time are recorded,
 *  - it was confirmed against this medication's CURRENT identity (`boundTo`),
 *  - the image lives where its source says it should (own uploads, the NLM set,
 *    or DailyMed over https),
 *  - a DailyMed image additionally requires an NDC, since it was matched by NDC,
 *  - an NLM image carries its required attribution.
 *
 * Anything else returns null and the UI shows the neutral placeholder. Colour,
 * shape and imprint fields are never used to produce an image.
 */
export function getVerifiedPhoto(med: MedicationScheduleItem): VerifiedMedicationPhoto | null {
  const photo = med.photo;
  if (!photo) return null;
  if (!photo.confirmedBy || !photo.confirmedAt) return null;
  if (photo.boundTo !== photoBinding(med)) return null;

  const urlOk = SOURCE_URL_RULES[photo.source];
  if (!urlOk || !urlOk(photo.imageUrl)) return null;

  if (photo.source === 'dailymed_label') {
    if (!med.ndc?.trim()) return null;
    if (!photo.sourceUrl || !isDailyMedUrl(photo.sourceUrl)) return null;
  }
  if (photo.source === 'nlm_rximage' && !photo.attribution?.includes('National Library of Medicine')) return null;
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
