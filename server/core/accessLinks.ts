import crypto from 'node:crypto';
import type { Db } from './db.ts';

/**
 * Patient access links (the QR code on the take-home sheet).
 *
 * A pharmacist issues a code for one patient. It is shown once, as a link and a QR code; only its SHA-256 hash is
 * stored. It works once, until it expires (default 72 hours, at most 7 days), and can be revoked. Redeeming it signs
 * that patient in, and nobody else. The code is 100 bits of randomness, so guessing is not practical, and redeeming
 * is rate limited as well.
 *
 * The code travels in the URL fragment (#access=...), which browsers never send to servers, so web servers, proxies
 * and email or message link scanners cannot see it or use it up before the patient does.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O or U
export const DEFAULT_HOURS = 72;
export const MIN_HOURS = 1;
export const MAX_HOURS = 24 * 7;

/** 20 characters, shown as XXXX-XXXX-XXXX-XXXX-XXXX so it can be read out or typed. */
export function newCode(): string {
  const bytes = crypto.randomBytes(20);
  let out = '';
  for (let i = 0; i < 20; i++) out += ALPHABET[bytes[i] % 32]; // 256 is a multiple of 32, so this is unbiased
  return out.replace(/(.{4})(?=.)/g, '$1-');
}

/** Accepts what a person might type: any case, spaces or dashes, and the look-alike letters I, L, O. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const c = input.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return /^[0-9A-HJKMNP-TV-Z]{20}$/.test(c) ? c : null;
}

const hash = (code: string) => crypto.createHash('sha256').update(code).digest('hex');

export function clampHours(h: unknown): number {
  const n = typeof h === 'number' ? h : Number(h);
  return Number.isFinite(n) ? Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.round(n))) : DEFAULT_HOURS;
}

export function createLink(db: Db, patientId: string, createdBy: string, hours: number, now = Date.now()) {
  const code = newCode();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + hours * 3_600_000).toISOString();
  const r = db
    .prepare('INSERT INTO access_links (token_hash, patient_id, created_by, created_at, expires_at) VALUES (?,?,?,?,?)')
    .run(hash(normalizeCode(code)!), patientId, createdBy, createdAt, expiresAt);
  return { id: Number(r.lastInsertRowid), code, createdAt, expiresAt };
}

export type LinkStatus = 'active' | 'used' | 'expired' | 'revoked';
export function statusOf(row: { used_at: string | null; revoked_at: string | null; expires_at: string }, now = Date.now()): LinkStatus {
  if (row.revoked_at) return 'revoked';
  if (row.used_at) return 'used';
  return Date.parse(row.expires_at) <= now ? 'expired' : 'active';
}

export function listLinks(db: Db, patientId: string, now = Date.now()) {
  return (db.prepare('SELECT * FROM access_links WHERE patient_id=? ORDER BY id DESC LIMIT 20').all(patientId) as any[]).map((r) => ({
    id: r.id as number,
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
    expiresAt: r.expires_at as string,
    usedAt: (r.used_at ?? null) as string | null,
    status: statusOf(r, now),
  }));
}

/** Returns true if an active link was revoked. */
export function revokeLink(db: Db, id: number, now = Date.now()): boolean {
  const r = db.prepare('UPDATE access_links SET revoked_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL').run(new Date(now).toISOString(), id);
  return Number(r.changes) === 1;
}

/**
 * Consumes a code. The single UPDATE is what makes it single-use even if two requests race: only one of them
 * changes a row. Returns the patient id, or null for any reason (unknown, used, expired, revoked): callers must not
 * say which.
 */
export function redeem(db: Db, input: unknown, now = Date.now()): { patientId: string; linkId: number } | null {
  const code = normalizeCode(input);
  if (!code) return null;
  const row = db.prepare('SELECT id, patient_id FROM access_links WHERE token_hash=?').get(hash(code)) as any;
  if (!row) return null;
  const r = db
    .prepare('UPDATE access_links SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?')
    .run(new Date(now).toISOString(), row.id, new Date(now).toISOString());
  return Number(r.changes) === 1 ? { patientId: row.patient_id as string, linkId: row.id as number } : null;
}
