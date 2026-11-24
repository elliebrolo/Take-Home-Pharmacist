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
import { registerMedicationPhotoRoutes } from './server/medicationPhotos.ts';
import { registerTranscriptRoute } from './server/routes/transcript.ts';
import { registerDrugRoutes } from './server/routes/drugs.ts';
import { DEFAULT_CONSULTATIONS } from './src/data/defaultConsultations.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3000;

const db = openDb(process.env.DB_FILE || path.join(__dirname, 'data', 'app.db'));
const auth = loadAuthConfig();
const { llm, note: llmNote } = createLlm();
const deps: Deps = {
  db,
  auth,
  knowledge: new LabelKnowledge(db),
  llm,
  auditRate: Number(process.env.AUDIT_RATE ?? 0.2),
  random: Math.random,
};

const { app, store } = createApp(deps);
store.seedApproved(DEFAULT_CONSULTATIONS); // fictional demo patients, marked "Demo data (not reviewed)"

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
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express_static());
    app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
  }

  app.listen(port, () => {
    console.log(`TakeHomePharmacist server running on port ${port}`);
    console.log(deps.llm ? `AI model: ${llmNote}` : `AI model: NOT configured (${llmNote}). Chat will say it cannot answer; transcript reading is off.`);
    if (!process.env.PHARMACIST_PASSCODE) console.log(`Pharmacist passcode for this run (set PHARMACIST_PASSCODE to fix it): ${auth.pharmacistPasscode}`);
  });
}


function express_static() {
  return express.static(path.join(__dirname, 'dist'));
}

startServer();
