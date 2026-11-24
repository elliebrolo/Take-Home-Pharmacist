import type { NextFunction, Request, Response } from 'express';
import type { AuthConfig } from './auth.ts';

/**
 * Content-Security-Policy for the web app (production only; the Vite dev server needs inline scripts).
 * Allows our own files, Google Fonts, and DailyMed package images (shown after a pharmacist confirms them).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://dailymed.nlm.nih.gov",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Baseline security headers; HSTS and CSP only in production. */
export function securityHeaders(cfg: Pick<AuthConfig, 'production'>) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (cfg.production) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Content-Security-Policy', CSP);
    }
    next();
  };
}

/**
 * CORS for the native app, whose pages come from capacitor://localhost and call the API on another origin.
 * Only origins listed in CORS_ORIGINS are answered; everything else gets no CORS headers at all.
 * Credentials (cookies) are never allowed cross-origin: the native app uses a bearer token instead.
 */
export function cors(cfg: Pick<AuthConfig, 'corsOrigins'>) {
  const allowed = new Set(cfg.corsOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
        return res.status(204).end();
      }
    } else if (req.method === 'OPTIONS' && origin) {
      return res.status(403).end();
    }
    next();
  };
}

/** TRUST_PROXY = number of proxy hops in front of the app (Cloud Run: 1). Default: 1 in production, otherwise none. */
export function trustProxyHops(env: NodeJS.ProcessEnv, production: boolean): number {
  const n = Number(env.TRUST_PROXY ?? (production ? 1 : 0));
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : production ? 1 : 0;
}
