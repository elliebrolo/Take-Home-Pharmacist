import type { Db } from '../core/db.ts';
import { audit } from '../core/db.ts';
import type { ConsultationRecord } from '../../src/types/pharmacy.ts';
import { nameVariants } from './names.ts';

/** One cached label, as stored: passages grouped by section. */
export interface LabelSnapshot {
  setId: string;
  version: string | null;
  sections: Map<string, string>; // section name -> joined passage text
}

/** Names of sections whose text was added, removed or edited. Whitespace differences are ignored. */
export function diffSections(before: Map<string, string>, after: Map<string, string>): string[] {
  const norm = (t: string | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();
  const names = new Set([...before.keys(), ...after.keys()]);
  return [...names].filter((n) => norm(before.get(n)) !== norm(after.get(n))).sort();
}

export interface Dependent { patientId: string; patientName: string; medication: string }

/**
 * Patients whose APPROVED plan includes this drug: matched by stored RxCUI, or, for plans that
 * predate RxNorm stamping (the demo patients), by a medication name that RxNorm resolved to it.
 */
export function patientsDependingOn(db: Db, rxcui: string): Dependent[] {
  const names = new Set(
    (db.prepare('SELECT query FROM rxnorm_cache WHERE rxcui=?').all(rxcui) as any[]).map((r) => String(r.query).toLowerCase()),
  );
  const out: Dependent[] = [];
  for (const row of db.prepare("SELECT patient_id, body FROM consultations WHERE status='approved'").all() as any[]) {
    const c = JSON.parse(row.body) as ConsultationRecord;
    for (const m of c.medications) {
      const hit = m.rxcui === rxcui || nameVariants(m).some((n) => names.has(n.toLowerCase().replace(/\s+/g, ' ')));
      if (hit) out.push({ patientId: row.patient_id, patientName: c.patientName, medication: m.medicationName });
    }
  }
  return out;
}

/**
 * Record that a label changed and put one review item in front of the pharmacist per affected patient.
 * Nothing is changed in any patient's plan: the pharmacist decides whether the plan or advice needs updating.
 * Review items carry no patient message, only the drug and the sections that changed.
 */
export function recordLabelChange(
  db: Db,
  args: { rxcui: string; name: string; before: LabelSnapshot; after: LabelSnapshot; url: string; changedSections: string[] },
): { affectedPatients: number } {
  const { rxcui, name, before, after, url, changedSections } = args;
  const at = new Date().toISOString();
  db.prepare(
    'INSERT INTO label_changes (rxcui, name, old_set_id, new_set_id, old_version, new_version, changed_sections, detected_at) VALUES (?,?,?,?,?,?,?,?)',
  ).run(rxcui, name, before.setId, after.setId, before.version, after.version, JSON.stringify(changedSections), at);

  const deps = patientsDependingOn(db, rxcui);
  const seen = new Set<string>();
  for (const d of deps) {
    if (seen.has(d.patientId)) continue;
    seen.add(d.patientId);
    // one open item per patient and drug, so repeated refreshes do not pile up
    const open = db
      .prepare("SELECT 1 FROM review_items WHERE patient_id=? AND reason='label_changed' AND status='open' AND detail LIKE ?")
      .get(d.patientId, `%"rxcui":"${rxcui}"%`);
    if (open) continue;
    const what = after.setId !== before.setId ? 'the source label was replaced' : `changed: ${changedSections.join(', ') || 'text'}`;
    db.prepare('INSERT INTO review_items (patient_id, reason, priority, question, detail, created_at) VALUES (?,?,?,?,?,?)').run(
      d.patientId,
      'label_changed',
      4,
      `FDA label for ${d.medication} ${what}. Check whether this patient's advice still matches.`,
      JSON.stringify({ rxcui, drug: name, medication: d.medication, changedSections, oldVersion: before.version, newVersion: after.version, oldSetId: before.setId, newSetId: after.setId, url }),
      at,
    );
  }
  audit(db, 'system:label-refresh', 'label.changed', rxcui, { name, changedSections, affectedPatients: seen.size });
  return { affectedPatients: seen.size };
}
