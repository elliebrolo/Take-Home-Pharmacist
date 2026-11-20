import express from 'express';
import type { Deps } from './core/deps.ts';
import { attachSession } from './core/auth.ts';
import { ConsultationStore } from './core/consultations.ts';
import { registerAccountRoutes } from './routes/account.ts';
import { registerChatRoutes } from './routes/chat.ts';
import { registerReviewRoutes } from './routes/review.ts';

/** Builds the API. Static files, Vite and the photo routes are added by server.ts. */
export function createApp(deps: Deps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '300kb' }));
  app.use(attachSession(deps.auth));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store'); // patient data must not be cached by browsers or proxies
    next();
  });
  const store = new ConsultationStore(deps.db);
  registerAccountRoutes(app, deps, store);
  registerChatRoutes(app, deps);
  registerReviewRoutes(app, deps);
  return { app, store };
}
