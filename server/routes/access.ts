import express from 'express';
import type { Deps } from '../core/deps.ts';
import { audit } from '../core/db.ts';
import { rateLimit, requireRole, startSession } from '../core/auth.ts';
import type { ConsultationStore } from '../core/consultations.ts';
import { DEFAULT_HOURS, clampHours, createLink, listLinks, redeem, revokeLink } from '../core/accessLinks.ts';

const GENERIC = 'This access link is invalid or has expired. Ask your pharmacy for a new one.';

/**
 * QR / profile access. Pharmacists issue and revoke patient links; a patient redeems one to sign in.
 * The link is only ever returned by the request that creates it.
 */
export function registerAccessRoutes(app: express.Express, deps: Deps, store: ConsultationStore) {
  const { db, auth } = deps;
  const ph = requireRole('pharmacist');
  const redeemLimit = rateLimit(10, 10 * 60 * 1000);
  const issueLimit = rateLimit(30, 60 * 60 * 1000);

  /** The address patients open. PUBLIC_BASE_URL wins (needed when the pharmacist uses a different address, e.g. an internal one). */
  const baseUrl = (req: express.Request) => auth.publicBaseUrl || `${req.protocol}://${req.get('host')}`;

  app.post('/api/patients/:patientId/access-links', ph, issueLimit, (req, res) => {
    const patientId = req.params.patientId;
    if (!store.approvedFor(patientId)) return res.status(404).json({ error: 'That patient has no approved plan yet. Approve a plan first.' });
    const hours = req.body?.hours === undefined ? DEFAULT_HOURS : clampHours(req.body.hours);
    const who = req.session!.sub;
    const link = createLink(db, patientId, who, hours);
    audit(db, `pharmacist:${who}`, 'access.create', patientId, { linkId: link.id, expiresAt: link.expiresAt });
    res.status(201).json({ id: link.id, code: link.code, url: `${baseUrl(req)}/#access=${link.code}`, expiresAt: link.expiresAt });
  });

  app.get('/api/patients/:patientId/access-links', ph, (req, res) => {
    res.json({ links: listLinks(db, req.params.patientId) });
  });

  app.delete('/api/access-links/:id', ph, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !revokeLink(db, id)) return res.status(404).json({ error: 'That link is not active.' });
    audit(db, `pharmacist:${req.session!.sub}`, 'access.revoke', String(id));
    res.json({ ok: true });
  });

  // Patient: trade a code for a session. Same response shape as sign-in.
  app.post('/api/auth/redeem', redeemLimit, (req, res) => {
    const hit = redeem(db, req.body?.code);
    if (!hit || !store.approvedFor(hit.patientId)) {
      audit(db, 'anon', 'access.redeem_failed');
      return res.status(401).json({ error: GENERIC });
    }
    audit(db, `patient:${hit.patientId}`, 'access.redeem', undefined, { linkId: hit.linkId });
    res.json(startSession(auth, res, { role: 'patient', sub: hit.patientId }, req.body?.client));
  });
}
