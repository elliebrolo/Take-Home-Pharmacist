import type { Db } from './db.ts';
import type { AuthConfig } from './auth.ts';

/** A numbered passage the model may cite. */
export interface Source {
  id: string; // e.g. R1 (patient record) or L3 (drug label)
  kind: 'record' | 'label';
  label: string; // human-readable: "Your pharmacist's note on Lisinopril" / "Lisinopril label, Drug Interactions"
  text: string;
  url?: string;
  /** Names the passage is about (for matching and for the allowed-drug check). */
  drug?: string;
}

export interface LabelPassage {
  id: string;
  rxcui: string;
  drug: string;
  section: string;
  text: string;
  url: string;
  setId: string;
  version?: string;
  effective?: string;
}

/** Everything the chat needs from the drug-label store. Real impl: server/knowledge/store.ts. */
export interface Knowledge {
  /** Resolve a drug name to an RxNorm ingredient/concept id, or null if RxNorm does not know it. */
  resolveRxcui(name: string): Promise<string | null>;
  /** Make sure label passages for this RxCUI are cached; returns false if no label could be fetched. */
  ensureLabel(rxcui: string, nameHint: string): Promise<boolean>;
  passagesFor(rxcuis: string[]): LabelPassage[];
}

/** A JSON-returning language model call. Real impl: Gemini. Tests inject a fake. */
export interface Llm {
  /** Returns the model's JSON text. `schema` (JSON Schema) is passed to providers that can enforce it. */
  generateJson(args: { system: string; user: string; timeoutMs: number; schema?: object }): Promise<string>;
  /** Provider and model, for the startup log only. */
  label?: string;
}

export interface Deps {
  db: Db;
  auth: AuthConfig;
  knowledge: Knowledge;
  /** null when no model is configured: every model step then takes its conservative fallback. */
  llm: Llm | null;
  /** Fraction of validated routine answers sent to the pharmacist for audit (0..1). */
  auditRate: number;
  random: () => number;
}
