import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * SQLite store (node:sqlite, experimental in Node 22/24; no extra dependency).
 * Holds consultations, chat history, the pharmacist review queue, the audit log
 * and the cached drug-label passages. Data lives in `data/app.db` (git-ignored).
 * Tests pass ':memory:'.
 */
export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS consultations (
  id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','approved')),
  body TEXT NOT NULL,                 -- ConsultationRecord JSON
  approved_by TEXT,
  approved_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (id, status)            -- at most one draft and one approved version per consultation
);
CREATE INDEX IF NOT EXISTS idx_consult_patient ON consultations(patient_id, status);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  sender TEXT NOT NULL CHECK (sender IN ('patient','assistant','pharmacist','system')),
  kind TEXT NOT NULL,                 -- answer | emergency | urgent | forwarded | fallback | refused | human
  text TEXT NOT NULL,
  citations TEXT,                     -- JSON array of {id,label,quote,url?}
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_patient ON chat_messages(patient_id, id);

CREATE TABLE IF NOT EXISTS review_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  reason TEXT NOT NULL,               -- emergency | urgent | needs_pharmacist | validation_failed | llm_unavailable | audit | label_changed
  priority INTEGER NOT NULL,          -- 1 = highest
  question TEXT NOT NULL,
  detail TEXT,                        -- JSON: triage result, rejected draft, validator findings
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  flag TEXT,                          -- audit verdict: ok | wrong | unsafe
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_status ON review_items(status, priority, id);

-- QR / profile access: one row per link a pharmacist issues. Only a hash of the code is stored.
CREATE TABLE IF NOT EXISTS access_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  patient_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_access_patient ON access_links(patient_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,                -- role:id
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS drug_labels (
  rxcui TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  set_id TEXT NOT NULL,
  title TEXT NOT NULL,
  version TEXT,
  effective TEXT,
  url TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS label_passages (
  id TEXT PRIMARY KEY,                -- <setid>#<section code>#<n>
  rxcui TEXT NOT NULL,
  section TEXT NOT NULL,
  section_code TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_passage_rxcui ON label_passages(rxcui);
CREATE TABLE IF NOT EXISTS label_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rxcui TEXT NOT NULL,
  name TEXT NOT NULL,
  old_set_id TEXT,
  new_set_id TEXT,
  old_version TEXT,
  new_version TEXT,
  changed_sections TEXT NOT NULL,     -- JSON array of section names whose text differs
  detected_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rxnorm_cache (
  query TEXT PRIMARY KEY,
  rxcui TEXT,                         -- NULL = looked up, not found
  name TEXT,
  fetched_at TEXT NOT NULL
);
`;

export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

export function audit(db: Db, actor: string, action: string, target?: string, detail?: unknown) {
  db.prepare('INSERT INTO audit_log (at, actor, action, target, detail) VALUES (?,?,?,?,?)').run(
    new Date().toISOString(),
    actor,
    action,
    target ?? null,
    detail === undefined ? null : JSON.stringify(detail),
  );
}
