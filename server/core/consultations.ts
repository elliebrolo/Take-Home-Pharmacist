import type { Db } from './db.ts';
import { audit } from './db.ts';
import type { ConsultationRecord } from '../../src/types/pharmacy.ts';
import type { Knowledge } from './deps.ts';
import { resolveMedication } from '../knowledge/names.ts';

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: object) {
    super(message);
  }
}

const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;

/** Structural validation for a consultation coming from the browser. Rejects instead of repairing. */
export function validateConsultation(c: any): ConsultationRecord {
  if (!c || typeof c !== 'object') throw new HttpError(400, 'Consultation is required.');
  for (const k of ['id', 'patientId', 'patientName', 'pharmacistName', 'pharmacistTitle', 'consultationDate', 'pharmacyName', 'pharmacyPhone']) {
    if (!str(c[k], 200) || !c[k]) throw new HttpError(400, `Field "${k}" is required.`);
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(c.id) || !/^[A-Za-z0-9_-]{1,64}$/.test(c.patientId)) throw new HttpError(400, 'Invalid id.');
  if (!str(c.rawTranscript, 60_000) || !str(c.clinicalSummary, 5_000)) throw new HttpError(400, 'Transcript or summary is missing or too long.');
  if (!Array.isArray(c.medications) || c.medications.length > 40) throw new HttpError(400, 'Medications must be a list of at most 40.');
  for (const m of c.medications) {
    if (!m || !str(m.id, 80) || !str(m.medicationName, 200) || !m.medicationName?.trim()) throw new HttpError(400, 'Every medication needs an id and a name.');
    if (m.warnings !== undefined && !Array.isArray(m.warnings)) throw new HttpError(400, 'Medication warnings must be a list.');
  }
  if (!Array.isArray(c.generalDietaryWarnings) || !Array.isArray(c.emergencyTriggers)) throw new HttpError(400, 'Dietary warnings and emergency triggers must be lists.');
  const { approval: _ignored, ...rest } = c; // approval is server-owned
  return rest as ConsultationRecord;
}

export class ConsultationStore {
  constructor(private db: Db) {}

  private row(id: string, status: 'draft' | 'approved') {
    return this.db.prepare('SELECT * FROM consultations WHERE id=? AND status=?').get(id, status) as any;
  }

  approvedFor(patientId: string): ConsultationRecord | null {
    const r = this.db
      .prepare("SELECT * FROM consultations WHERE patient_id=? AND status='approved' ORDER BY approved_at DESC LIMIT 1")
      .get(patientId) as any;
    return r ? { ...JSON.parse(r.body), approval: { by: r.approved_by, at: r.approved_at } } : null;
  }

  /** What the pharmacist sees: the draft when there is one, otherwise the approved version. */
  listForPharmacist() {
    const rows = this.db.prepare('SELECT * FROM consultations ORDER BY updated_at DESC').all() as any[];
    const byId = new Map<string, { draft?: any; approved?: any }>();
    for (const r of rows) byId.set(r.id, { ...byId.get(r.id), [r.status]: r });
    return [...byId.values()].map(({ draft, approved }) => {
      const r = draft ?? approved;
      return {
        consultation: JSON.parse(r.body) as ConsultationRecord,
        hasDraft: !!draft,
        approval: approved ? { by: approved.approved_by, at: approved.approved_at } : null,
      };
    });
  }

  saveDraft(c: ConsultationRecord, actor: string) {
    const existing = this.db.prepare('SELECT patient_id FROM consultations WHERE id=? LIMIT 1').get(c.id) as any;
    if (existing && existing.patient_id !== c.patientId) throw new HttpError(409, 'A consultation cannot be moved to another patient.');
    this.db
      .prepare(
        `INSERT INTO consultations (id, patient_id, status, body, updated_at) VALUES (?,?,'draft',?,?)
         ON CONFLICT(id,status) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at`,
      )
      .run(c.id, c.patientId, JSON.stringify(c), new Date().toISOString());
    audit(this.db, actor, 'consultation.save_draft', c.id);
  }

  /**
   * Sign-off. Requires the pharmacist's explicit attestation and an RxNorm id for
   * every medication (unresolved names block approval). The patient sees nothing
   * until this succeeds.
   */
  async approve(id: string, pharmacist: string, attested: boolean, knowledge: Knowledge, opts: { skipRxnorm?: boolean } = {}) {
    if (!attested) throw new HttpError(400, 'Confirm that you checked each medication against the transcript.');
    const draft = this.row(id, 'draft');
    if (!draft) throw new HttpError(404, 'There is no unapproved draft to approve.');
    const c = JSON.parse(draft.body) as ConsultationRecord;
    if (c.medications.length === 0) throw new HttpError(422, 'Add at least one medication before approving.');

    const unresolved: string[] = [];
    if (!opts.skipRxnorm) {
      try {
        for (const m of c.medications) {
          delete m.rxcui; // always re-check: the name may have been edited since a previous approval
          const hit = await resolveMedication(m, knowledge);
          if (hit) m.rxcui = hit.rxcui;
          else unresolved.push(m.medicationName);
        }
      } catch (e: any) {
        throw new HttpError(503, `Could not check medication names against RxNorm right now (${e?.message || 'unavailable'}). Nothing was approved; try again shortly.`);
      }
    }
    if (unresolved.length) {
      throw new HttpError(422, `RxNorm could not identify: ${unresolved.join(', ')}. Correct the name or generic name and try again.`, { unresolved });
    }
    const at = new Date().toISOString();
    this.db.exec('BEGIN');
    try {
      this.db.prepare("DELETE FROM consultations WHERE id=? AND status='approved'").run(id);
      this.db
        .prepare(`INSERT INTO consultations (id, patient_id, status, body, approved_by, approved_at, updated_at) VALUES (?,?,'approved',?,?,?,?)`)
        .run(id, c.patientId, JSON.stringify(c), pharmacist, at, at);
      this.db.prepare("DELETE FROM consultations WHERE id=? AND status='draft'").run(id);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    audit(this.db, `pharmacist:${pharmacist}`, 'consultation.approve', id, { medications: c.medications.map((m) => ({ name: m.medicationName, rxcui: m.rxcui })) });
    return { ...c, approval: { by: pharmacist, at } } as ConsultationRecord;
  }

  /** Seeds demo consultations as approved (marked "Demo data") on first start only. */
  seedApproved(list: ConsultationRecord[]) {
    const n = (this.db.prepare('SELECT COUNT(*) AS n FROM consultations').get() as any).n;
    if (n > 0) return;
    const at = new Date().toISOString();
    for (const c of list) {
      this.db
        .prepare(`INSERT INTO consultations (id, patient_id, status, body, approved_by, approved_at, updated_at) VALUES (?,?,'approved',?,?,?,?)`)
        .run(c.id, c.patientId, JSON.stringify(c), 'Demo data (not reviewed)', at, at);
    }
  }
}
