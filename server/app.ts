import express from 'express';
import type { Deps } from './core/deps.ts';
import { attachSession } from './core/auth.ts';
import { cors, securityHeaders, trustProxyHops } from './core/http.ts';
import { ConsultationStore } from './core/consultations.ts';
import { registerAccessRoutes } from './routes/access.ts';
import { registerAccountRoutes } from './routes/account.ts';
import { registerChatRoutes } from './routes/chat.ts';
import { registerReviewRoutes } from './routes/review.ts';

/** Builds the API. Static files, Vite and the photo routes are added by server.ts. */
export function createApp(deps: Deps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops(process.env, deps.auth.production));
  app.use(securityHeaders(deps.auth));
  app.use(cors(deps.auth));

  // Health checks, before sessions and static files. /healthz says the process is up; /readyz also checks the
  // database. Neither reveals configuration, the AI provider or any patient data.
  app.get('/healthz', (_req, res) => res.setHeader('Cache-Control', 'no-store').json({ status: 'ok' }));
  app.get('/readyz', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      deps.db.prepare('SELECT 1').get();
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use(express.json({ limit: '300kb' }));
  app.use(attachSession(deps.auth));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store'); // patient data must not be cached by browsers or proxies
    next();
  });
  const store = new ConsultationStore(deps.db);
  registerAccountRoutes(app, deps, store);
  registerAccessRoutes(app, deps, store);
  registerChatRoutes(app, deps);
  registerReviewRoutes(app, deps);
  return { app, store };
}
