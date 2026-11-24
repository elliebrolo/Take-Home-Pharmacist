import express from 'express';
import type { Deps } from '../core/deps.ts';
import { audit } from '../core/db.ts';
import { ConsultationStore, HttpError, validateConsultation } from '../core/consultations.ts';
import { clearSessionCookie, rateLimit, requireRole, safeEqual, startSession } from '../core/auth.ts';

const wrap = (fn: express.RequestHandler): express.RequestHandler => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, ...(e.extra || {}) });
    console.error(e);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  }
};

/** Sign-in, sign-out, and the consultation records (patients: own approved record; pharmacists: drafts and approval). */
export function registerAccountRoutes(app: express.Express, deps: Deps, store: ConsultationStore) {
  const { db, auth } = deps;
  const loginLimit = rateLimit(10, 10 * 60 * 1000);

  app.get('/api/auth/me', (req, res) => {
    res.json({ session: req.session ? { role: req.session.role, sub: req.session.sub } : null });
  });

  // Which demo patients can sign in (names only; no clinical data). Only in demo mode: a deployment with real
  // patients must never publish a list of who is registered.
  app.get('/api/auth/patients', (_req, res) => {
    if (!auth.demoMode) return res.json({ patients: [], demoMode: false });
    const rows = db.prepare("SELECT DISTINCT patient_id, body FROM consultations WHERE status='approved'").all() as any[];
    res.json({
      demoMode: true,
      patients: rows.map((r) => ({ patientId: r.patient_id, name: JSON.parse(r.body).patientName as string, needsCode: !!auth.patientCodes[r.patient_id] || !auth.allowOpenDemoPatients })),
    });
  });

  app.post('/api/auth/login', loginLimit, (req, res) => {
    const { role, patientId, code, passcode, name, client } = req.body || {};
    if (role === 'pharmacist') {
      if (typeof passcode !== 'string' || !safeEqual(passcode, auth.pharmacistPasscode)) {
        audit(db, 'anon', 'login.failed', 'pharmacist');
        return res.status(401).json({ error: 'Incorrect passcode.' });
      }
      const sub = typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : 'Pharmacist';
      const body = startSession(auth, res, { role: 'pharmacist', sub }, client);
      audit(db, `pharmacist:${sub}`, 'login');
      return res.json(body);
    }
    if (role === 'patient') {
      if (typeof patientId !== 'string' || !store.approvedFor(patientId)) return res.status(401).json({ error: 'Unknown patient or incorrect code.' });
      const expected = auth.patientCodes[patientId];
      const ok = expected ? typeof code === 'string' && safeEqual(code, expected) : auth.allowOpenDemoPatients;
      if (!ok) {
        audit(db, 'anon', 'login.failed', `patient:${patientId}`);
        return res.status(401).json({ error: 'Unknown patient or incorrect code.' });
      }
      const body = startSession(auth, res, { role: 'patient', sub: patientId }, client);
      audit(db, `patient:${patientId}`, 'login');
      return res.json(body);
    }
    res.status(400).json({ error: 'Choose patient or pharmacist.' });
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Patient: only their own, approved record. The raw transcript stays on the server.
  app.get('/api/me/consultation', requireRole('patient'), wrap((req, res) => {
    const c = store.approvedFor(req.session!.sub);
    if (!c) return res.status(404).json({ error: 'No approved consultation yet. Please ask your pharmacy.' });
    const { rawTranscript: _t, ...safe } = c;
    audit(db, `patient:${req.session!.sub}`, 'record.read', c.id);
    res.json({ consultation: safe });
  }));

  // Pharmacist
  app.get('/api/consultations', requireRole('pharmacist'), (_req, res) => res.json({ items: store.listForPharmacist() }));

  app.put('/api/consultations/:id', requireRole('pharmacist'), wrap((req, res) => {
    const c = validateConsultation(req.body?.consultation);
    if (c.id !== req.params.id) throw new HttpError(400, 'Id mismatch.');
    store.saveDraft(c, `pharmacist:${req.session!.sub}`);
    res.json({ ok: true });
  }));

  app.post('/api/consultations/:id/approve', requireRole('pharmacist'), wrap(async (req, res) => {
    const approved = await store.approve(req.params.id, req.session!.sub, req.body?.attestChecked === true, deps.knowledge);
    res.json({ consultation: approved });
  }));
}
