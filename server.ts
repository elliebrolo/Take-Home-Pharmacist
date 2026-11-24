import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb } from './server/core/db.ts';
import { loadAuthConfig, requireRole } from './server/core/auth.ts';
import type { Deps } from './server/core/deps.ts';
import { createApp } from './server/app.ts';
import { LabelKnowledge } from './server/knowledge/store.ts';
import { createLlm } from './server/chat/llm.ts';
import { createNotifier } from './server/core/notify.ts';
import { dataPaths } from './server/core/paths.ts';
import { registerMedicationPhotoRoutes } from './server/medicationPhotos.ts';
import { registerTranscriptRoute } from './server/routes/transcript.ts';
import { registerDrugRoutes } from './server/routes/drugs.ts';
import { DEFAULT_CONSULTATIONS } from './src/data/defaultConsultations.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000; // Cloud Run sets PORT
const paths = dataPaths();

const db = openDb(paths.dbFile);
const auth = loadAuthConfig();
const { llm, note: llmNote } = createLlm();
const { notify, note: notifyNote } = createNotifier(db);
const deps: Deps = {
  db,
  auth,
  knowledge: new LabelKnowledge(db),
  llm,
  auditRate: Number(process.env.AUDIT_RATE ?? 0.2),
  random: Math.random,
  notify,
};

const { app, store } = createApp(deps);
// Fictional demo patients, marked "Demo data (not reviewed)". Only in demo mode: a deployment that is not a demo
// starts empty, and patients are added by the pharmacist workflow.
if (auth.demoMode) store.seedApproved(DEFAULT_CONSULTATIONS);

registerTranscriptRoute(app, deps);

// Weekly-at-most label refresh that flags changed FDA label text for the pharmacist (plan phase 2).
// LABEL_REFRESH_HOURS=0 turns it off. It only re-reads labels already cached; it sends no patient data.
const refreshHours = Number(process.env.LABEL_REFRESH_HOURS ?? 24);
if (refreshHours > 0 && deps.knowledge.refreshKnownLabels) {
  const job = () =>
    deps.knowledge.refreshKnownLabels!().then(
      (r) => r.changed && console.log(`Label refresh: ${r.changed} changed label(s) flagged in the review queue.`),
      (e) => console.error('Label refresh failed:', e?.message || e),
    );
  setInterval(job, refreshHours * 60 * 60 * 1000).unref();
}
registerDrugRoutes(app, deps);

// Medication photos: only pharmacists may search for, look up or upload; signed-in users may view stored images.
app.use(['/api/medication-photo', '/api/dpd'], requireRole('pharmacist'));
app.use(['/uploads', '/nlm-images'], requireRole('patient', 'pharmacist'));
registerMedicationPhotoRoutes(app);

async function startServer() {
  // Unknown API paths answer with JSON, never with the web page.
  app.use(['/api', '/uploads', '/nlm-images'], (_req, res) => res.status(404).json({ error: 'Not found.' }));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express_static());
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache'); // the page must always be revalidated; its hashed assets are cached
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  // Last resort: never leak a stack trace or an HTML error page to API callers.
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body.' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`TakeHomePharmacist server running on port ${port}`);
    console.log(deps.llm ? `AI model: ${llmNote}` : `AI model: NOT configured (${llmNote}). Chat will say it cannot answer; transcript reading is off.`);
    console.log(`Urgent-item notifications: ${notifyNote}`);
    console.log(`Mode: ${auth.production ? 'production' : 'development'}${auth.demoMode ? ', demo patients on' : ''}. Database: ${paths.dbFile}`);
    if (!process.env.PHARMACIST_PASSCODE) console.log(`Pharmacist passcode for this run (set PHARMACIST_PASSCODE to fix it): ${auth.pharmacistPasscode}`);
  });

  // Cloud Run stops a container with SIGTERM and allows 10 seconds. Finish in-flight requests, then close the
  // database so the write-ahead log is folded back into the file before the process exits.
  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} received: shutting down`);
    server.close(() => {
      try { db.close(); } catch { /* already closed */ }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}


function express_static() {
  // Built files have content hashes in their names, so they can be cached for a year; the page itself must be revalidated
  // on every load so a new release reaches users straight away.
  return express.static(path.join(__dirname, 'dist'), {
    index: 'index.html',
    setHeaders: (res, file) => {
      res.setHeader('Cache-Control', file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable');
    },
  });
}

startServer();
