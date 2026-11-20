import type { MedicationScheduleItem } from '../../src/types/pharmacy.ts';
import type { Knowledge } from '../core/deps.ts';

// Release-type and form words are not part of an RxNorm ingredient name.
const QUALIFIERS = /\b(er|xr|xl|sr|cr|la|dr|ec|odt|extended[- ]release|delayed[- ]release|sustained[- ]release|controlled[- ]release|enteric[- ]coated|film[- ]coated|chewable|tablets?|capsules?|oral|hcl|hydrochloride)\b/gi;

/** Names to try, most specific first: as typed, then with release/form words removed. */
export function nameVariants(m: Pick<MedicationScheduleItem, 'medicationName' | 'genericName'>): string[] {
  const raw = [m.genericName, m.medicationName].map((s) => (s || '').trim()).filter(Boolean);
  const cleaned = raw.map((s) => s.replace(/\([^)]*\)/g, ' ').replace(QUALIFIERS, ' ').replace(/\s+/g, ' ').trim());
  return [...new Set([...raw, ...cleaned])].filter(Boolean);
}

/** First name RxNorm recognises, or null. Throws if the service is unreachable (so callers can tell "unknown" from "down"). */
export async function resolveMedication(m: MedicationScheduleItem, knowledge: Knowledge): Promise<{ rxcui: string; matched: string } | null> {
  if (m.rxcui) return { rxcui: m.rxcui, matched: m.genericName || m.medicationName };
  for (const name of nameVariants(m)) {
    const rxcui = await knowledge.resolveRxcui(name);
    if (rxcui) return { rxcui, matched: name };
  }
  return null;
}
