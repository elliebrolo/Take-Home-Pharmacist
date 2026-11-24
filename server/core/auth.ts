import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * PROTOTYPE AUTHENTICATION. Not suitable for real patients.
 *
 * - Sessions are HMAC-signed, HttpOnly, SameSite=Strict cookies; the role and
 *   patient id come from the server-side token, never from the request body.
 * - Pharmacist sign-in needs a passcode (PHARMACIST_PASSCODE, else a random one
 *   printed at start-up). Patient sign-in needs that patient's access code
 *   (PATIENT_CODES="id:code,..."); in non-production, and only when no code is
 *   configured for a patient, a demo patient may sign in without one.
 * - A native app (Capacitor) is cross-site to the API, so SameSite cookies do not work there. It asks for the
 *   same signed token in the response body (`client: "native"`) and sends it as `Authorization: Bearer`.
 * - A real deployment needs a real identity provider, MFA, and per-user accounts.
 */
export type Role = 'patient' | 'pharmacist';
export interface Session {
  role: Role;
  /** patient id for patients; pharmacist display name for pharmacists */
  sub: string;
  exp: number;
}

const COOKIE = 'thp_session';
const PHARMACIST_TTL_MS = 8 * 60 * 60 * 1000;

export interface AuthConfig {
  secret: string;
  pharmacistPasscode: string;
  patientCodes: Record<string, string>;
  allowOpenDemoPatients: boolean;
  secureCookie: boolean;
  /** True under NODE_ENV=production: enables HSTS and the Content-Security-Policy. */
  production: boolean;
  /** Demo mode lists the fictional patients on the sign-in page and seeds them. Off by default in production. */
  demoMode: boolean;
  patientSessionMs: number;
  /** Origins allowed to call the API from another origin (the native app). Empty = no CORS. */
  corsOrigins: string[];
  /** Address patients open, used in access links. Empty = use the address of the request. */
  publicBaseUrl: string;
}

const MIN_SECRET = 32;
const MIN_PASSCODE = 12;

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const prod = env.NODE_ENV === 'production';
  const secret = env.SESSION_SECRET || '';
  if (prod && (!secret || !env.PHARMACIST_PASSCODE)) {
    throw new Error('SESSION_SECRET and PHARMACIST_PASSCODE must be set in production.');
  }
  if (prod && (secret.length < MIN_SECRET || (env.PHARMACIST_PASSCODE || '').length < MIN_PASSCODE)) {
    throw new Error(`In production SESSION_SECRET must be at least ${MIN_SECRET} characters and PHARMACIST_PASSCODE at least ${MIN_PASSCODE}.`);
  }
  const hours = Number(env.PATIENT_SESSION_HOURS ?? 24);
  const patientSessionMs = (Number.isFinite(hours) && hours > 0 ? Math.min(hours, 24 * 30) : 24) * 60 * 60 * 1000;
  const corsOrigins = (env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
  if (env.PUBLIC_BASE_URL && !/^https?:\/\/[^/\s]+$/i.test(env.PUBLIC_BASE_URL.trim().replace(/\/+$/, ''))) throw new Error('PUBLIC_BASE_URL must be an origin such as https://app.example.com (no path).');
  if (corsOrigins.includes('*')) throw new Error('CORS_ORIGINS must list exact origins, not "*".');
  const patientCodes: Record<string, string> = {};
  for (const pair of (env.PATIENT_CODES || '').split(',')) {
    const [id, code] = pair.split(':').map((s) => s.trim());
    if (id && code) patientCodes[id] = code;
  }
  return {
    secret: secret || crypto.randomBytes(32).toString('hex'),
    pharmacistPasscode: env.PHARMACIST_PASSCODE || crypto.randomBytes(6).toString('hex'),
    patientCodes,
    allowOpenDemoPatients: !prod,
    secureCookie: prod,
    production: prod,
    demoMode: env.DEMO_MODE ? env.DEMO_MODE === 'true' : !prod,
    patientSessionMs,
    corsOrigins,
    publicBaseUrl: (env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, ''),
  };
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = (cfg: AuthConfig, payload: string) => crypto.createHmac('sha256', cfg.secret).update(payload).digest('base64url');

export const sessionTtlMs = (cfg: AuthConfig, role: Role) => (role === 'patient' ? cfg.patientSessionMs : PHARMACIST_TTL_MS);

export function issueToken(cfg: AuthConfig, s: Omit<Session, 'exp'>, now = Date.now()): string {
  const payload = b64(JSON.stringify({ ...s, exp: now + sessionTtlMs(cfg, s.role) }));
  return `${payload}.${sign(cfg, payload)}`;
}

export function readToken(cfg: AuthConfig, token: string | undefined, now = Date.now()): Session | null {
  if (!token) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expect = sign(cfg, payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    if ((s.role !== 'patient' && s.role !== 'pharmacist') || typeof s.sub !== 'string' || !(s.exp > now)) return null;
    return s;
  } catch {
    return null;
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

export function attachSession(cfg: AuthConfig) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const bearer = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(req.headers.authorization || '')?.[1];
    req.session = readToken(cfg, parseCookies(req.headers.cookie)[COOKIE]) ?? readToken(cfg, bearer) ?? undefined;
    next();
  };
}

export function setSessionCookie(cfg: AuthConfig, res: Response, token: string) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(sessionTtlMs(cfg, readToken(cfg, token)?.role ?? 'pharmacist') / 1000)}${cfg.secureCookie ? '; Secure' : ''}`,
  );
}
/** Issue a session: sets the cookie, and returns the response body. The raw token is included only for the native app. */
export function startSession(cfg: AuthConfig, res: Response, s: Omit<Session, 'exp'>, client?: unknown) {
  const token = issueToken(cfg, s);
  setSessionCookie(cfg, res, token);
  return { session: { role: s.role, sub: s.sub }, ...(client === 'native' ? { token } : {}) };
}
export function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

export const requireRole = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.session) return res.status(401).json({ error: 'Please sign in.' });
  if (!roles.includes(req.session.role)) return res.status(403).json({ error: 'You do not have access to this.' });
  next();
};

/** Tiny in-memory fixed-window limiter, keyed per session (or IP when anonymous). */
export function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.session ? `${req.session.role}:${req.session.sub}` : req.ip || 'anon';
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++h.n > max) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    next();
  };
}
