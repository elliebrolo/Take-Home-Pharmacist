import express from 'express';
import type { Deps } from '../core/deps.ts';
import { requireRole } from '../core/auth.ts';
import { audit } from '../core/db.ts';
import { KnowledgeUnavailable } from '../knowledge/store.ts';

/**
 * Pharmacist drug reference, read from cached FDA label text with its source and
 * date, replacing the old hand-written catalog (which had no sources).
 */
export function registerDrugRoutes(app: express.Express, deps: Deps) {
  app.get('/api/drug-lookup', requireRole('pharmacist'), async (req, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, 80);
    if (!q) return res.json({ results: [] });
    try {
      const rxcui = await deps.knowledge.resolveRxcui(q);
      if (!rxcui) return res.json({ results: [], message: `RxNorm does not recognise "${q}".` });
      const ok = await deps.knowledge.ensureLabel(rxcui, q);
      const passages = ok ? deps.knowledge.passagesFor([rxcui]) : [];
      if (!passages.length) return res.json({ results: [], message: 'No FDA label text could be retrieved for this drug.' });
      const bySection: Record<string, string> = {};
      for (const p of passages) bySection[p.section] = `${bySection[p.section] ?? ''} ${p.text}`.trim();
      const first = passages[0];
      res.json({
        results: [{
          name: q, rxcui, source: { url: first.url, setId: first.setId, version: first.version, effective: first.effective, publisher: 'FDA label via DailyMed (NLM)' },
          sections: Object.entries(bySection).map(([section, text]) => ({ section, text: text.length > 1500 ? `${text.slice(0, 1497)}…` : text })),
        }],
      });
    } catch (e) {
      const status = e instanceof KnowledgeUnavailable ? 503 : 500;
      res.status(status).json({ error: status === 503 ? `${(e as Error).message} Try again shortly.` : 'Lookup failed.' });
    }
  });

  // Re-pull every cached label now and flag changes. The same job runs on a schedule (see server.ts).
  let refreshing = false;
  app.post('/api/drug-labels/refresh', requireRole('pharmacist'), async (req, res) => {
    if (!deps.knowledge.refreshKnownLabels) return res.status(501).json({ error: 'Label refresh is not available.' });
    if (refreshing) return res.status(409).json({ error: 'A refresh is already running.' });
    refreshing = true;
    try {
      const summary = await deps.knowledge.refreshKnownLabels();
      audit(deps.db, `pharmacist:${req.session!.sub}`, 'labels.refresh', undefined, summary);
      res.json(summary);
    } catch {
      res.status(500).json({ error: 'Refresh failed.' });
    } finally {
      refreshing = false;
    }
  });
}
