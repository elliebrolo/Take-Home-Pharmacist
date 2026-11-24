import type { MedicationScheduleItem } from '../types/pharmacy';

/**
 * Hook for attaching sample reference photos to the fictional demo patients.
 *
 * This file was missing from the repository (the old `data/` ignore rule also
 * matched `src/data/`), so a fresh clone could not start. It is restored as a
 * deliberate no-op: the demo medications carry no photo, and the patient app
 * shows the neutral "No photo" placeholder plus the pharmacist's text
 * description. A wrong pill image is a patient-safety hazard, so no image is
 * attached unless a pharmacist confirms it in the workspace (see
 * `getVerifiedPhoto` in src/utils/medicationPhoto.ts).
 *
 * If sample photos are wanted later, attach them here with `demo: true` and a
 * `boundTo` value from `photoBinding(med)`, using files from `npm run nlm:fetch`.
 */
export function withDemoPhoto(med: MedicationScheduleItem): MedicationScheduleItem {
  return med;
}
