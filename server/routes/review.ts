import express from 'express';
import type { Deps } from '../core/deps.ts';
import { audit } from '../core/db.ts';
import { requireRole } from '../core/auth.ts';

/** Pharmacist review queue: everything the bot escalated, refused, or sampled for audit. */
export function registerReviewRoutes(app: express.Express, deps: Deps) {
  const ph = requireRole('pharmacist');
  const { db } = deps;

  app.get('/api/review-items', ph, (req, res) => {
    const status = req.query.status === 'resolved' ? 'resolved' : 'open';
    const rows = db.prepare('SELECT * FROM review_items WHERE status=? ORDER BY priority ASC, id ASC LIMIT 200').all(status) as any[];
    const names = new Map(
      (db.prepare("SELECT patient_id, body FROM consultations WHERE status='approved'").all() as any[]).map((r) => [r.patient_id, JSON.parse(r.body).patientName as string]),
    );
    res.json({
      items: rows.map((r) => ({
        id: r.id, patientId: r.patient_id, patientName: names.get(r.patient_id) ?? r.patient_id, reason: r.reason, priority: r.priority,
        question: r.question, detail: r.detail ? JSON.parse(r.detail) : null, status: r.status, flag: r.flag, createdAt: r.created_at,
        resolvedBy: r.resolved_by, resolvedAt: r.resolved_at,
      })),
    });
  });

  // The conversation around an item, so the pharmacist sees context before replying.
  app.get('/api/review-items/:id/conversation', ph, (req, res) => {
    const item = db.prepare('SELECT patient_id FROM review_items WHERE id=?').get(Number(req.params.id)) as any;
    if (!item) return res.status(404).json({ error: 'Not found.' });
    const rows = db.prepare('SELECT sender, kind, text, created_at FROM chat_messages WHERE patient_id=? ORDER BY id DESC LIMIT 20').all(item.patient_id);
    res.json({ messages: (rows as any[]).reverse() });
  });

  // Reply to the patient. It appears in their chat labelled as written by a person.
  app.post('/api/review-items/:id/reply', ph, (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 2000) return res.status(400).json({ error: 'Write a reply (up to 2000 characters).' });
    const id = Number(req.params.id);
    const item = db.prepare("SELECT * FROM review_items WHERE id=? AND status='open'").get(id) as any;
    if (!item) return res.status(404).json({ error: 'That item is not open.' });
    const who = req.session!.sub;
    const at = new Date().toISOString();
    db.prepare("INSERT INTO chat_messages (patient_id, sender, kind, text, created_at) VALUES (?,?,?,?,?)").run(item.patient_id, 'pharmacist', 'human', `${text}\n\n— ${who}, pharmacist`, at);
    db.prepare("UPDATE review_items SET status='resolved', resolved_by=?, resolved_at=? WHERE id=?").run(who, at, id);
    audit(db, `pharmacist:${who}`, 'review.reply', String(id));
    res.json({ ok: true });
  });

  // Close an item without replying; for audit samples, record a verdict ("ok" | "wrong" | "unsafe").
  app.post('/api/review-items/:id/resolve', ph, (req, res) => {
    const flag = req.body?.flag;
    if (flag !== undefined && !['ok', 'wrong', 'unsafe'].includes(flag)) return res.status(400).json({ error: 'flag must be ok, wrong or unsafe.' });
    const id = Number(req.params.id);
    const r = db.prepare("UPDATE review_items SET status='resolved', flag=?, resolved_by=?, resolved_at=? WHERE id=? AND status='open'").run(flag ?? null, req.session!.sub, new Date().toISOString(), id);
    if (!r.changes) return res.status(404).json({ error: 'That item is not open.' });
    audit(db, `pharmacist:${req.session!.sub}`, 'review.resolve', String(id), { flag });
    res.json({ ok: true });
  });

  // Items flagged wrong/unsafe become regression cases for the evaluation set.
  app.get('/api/review-items-flagged', ph, (_req, res) => {
    res.json({ cases: db.prepare("SELECT id, patient_id, reason, question, detail, flag FROM review_items WHERE flag IN ('wrong','unsafe')").all() });
  });
}
