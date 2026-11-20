import type { Source } from '../core/deps.ts';
import type { ConsultationRecord } from '../../src/types/pharmacy.ts';
import { tokens } from './sources.ts';

export interface Block { text: string; sources: string[] }
export interface Citation { id: string; label: string; quote: string; url?: string }
export interface Validated { ok: true; blocks: Block[]; citations: Citation[] }
export interface Rejected { ok: false; reasons: string[]; /** The model said the sources do not answer the question. That is an abstention, not a format error. */ declined?: boolean }

/**
 * JSON Schema for the model's answer. The source ids are limited to the ones actually provided for this
 * question (e.g. ["R1","R2","L1"]), at least one per block, so a provider that enforces the schema cannot
 * cite an id that does not exist. The validator below is still the real check.
 */
export function answerSchema(sourceIds: string[]): object {
  return {
    type: 'object',
    properties: {
      can_answer: { type: 'boolean' },
      blocks: {
        type: 'array',
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', maxLength: 700 },
            sources: { type: 'array', minItems: 1, items: { type: 'string', enum: sourceIds } },
          },
          required: ['text', 'sources'],
          additionalProperties: false,
        },
      },
    },
    required: ['can_answer', 'blocks'],
    additionalProperties: false,
  };
}

/** "[r2]", " R2 " and "R2" all mean R2. Nothing else is guessed: "2", "source 2" or "R9" stay as they are and fail. */
export function canonicalSourceId(id: unknown): unknown {
  if (typeof id !== 'string') return id;
  const m = /^\s*\[?\s*([rl]\d{1,3})\s*\]?\s*$/i.exec(id);
  return m ? m[1].toUpperCase() : id;
}

const norm = (s: string) => s.toLowerCase().replace(/[“”]/g, '"').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

// Drug-like words that are checked even when they are not in the patient's regimen. A heuristic, not a drug database.
const DRUG_SUFFIX = /\b[a-z]{3,}(statin|pril|sartan|olol|dipine|azole|cillin|mycin|floxacin|formin|gliptin|gliflozin|glutide|parin|xaban|prazole|tidine|oxetine|traline|zepam|zolam|triptyline|barbital|codone|morphone|profen|fenac|caine|thiazide|semide|sone|solone|vir|mab|tinib)\b/gi;
const DRUG_WORDS = /\b(acetaminophen|paracetamol|tylenol|aspirin|advil|motrin|aleve|naproxen|ibuprofen|warfarin|coumadin|insulin|metformin|digoxin|lithium|potassium|st\.? john'?s wort|antacids?|opioids?|nsaids?|benzodiazepines?|grapefruit|alcohol|cannabis|marijuana|nicotine|caffeine)\b/gi;

// Phrases that tell the patient to act on their treatment. Allowed only if the label/record uses the same phrase.
const DIRECTIVES = [
  /\b(stop|stopping|discontinue|quit)\s+(taking|using|your|the|it)\b/i,
  /\b(increase|decrease|reduce|lower|raise|change|adjust)\s+(your|the)\s+(dose|dosage)\b/i,
  /\b(double|extra|additional)\s+(dose|tablet|pill|capsule)s?\b/i,
  /\btake\s+(two|2|an extra|another|more)\b/i,
  /\bskip(ping)?\s+(a|your|the)\s+(dose|tablet|pill)\b/i,
  /\b(you can|it'?s ok(ay)? to|it is ok(ay)? to|feel free to)\s+(safely\s+)?(take|stop|skip|drink|eat|combine|mix)\b/i,
  /\b(completely|perfectly|totally|entirely|always|generally)?\s*safe to\b/i,
  /\b(is|are)\s+(completely\s+|perfectly\s+)?safe\b/i,
  /\bno (known )?(interaction|interactions|risk|side effects)\b/i,
  /\bnothing to worry\b|\bdon'?t worry\b|\bno need to (worry|call|see)\b/i,
];

const DOSE = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|g|ml|units?|iu|tablets?|pills?|capsules?|drops?|puffs?)\b/gi;
const IDENTITY = /\bi am (your |a |the )?(pharmacist|doctor|physician|nurse)\b|\bas your (pharmacist|doctor)\b|\bi('| a)m dr\b/i;
const ATTRIBUTION = /\b(your )?(pharmacist|dr\.? \w+)\s+(said|told|recommended|advised|noted|explained|mentioned|wrote)\b|\baccording to your (pharmacist|notes)\b/i;

export function regimenWords(c: ConsultationRecord): Set<string> {
  const set = new Set<string>();
  for (const m of c.medications) {
    for (const n of [m.medicationName, m.genericName, m.brandName]) for (const w of (n || '').toLowerCase().match(/[a-z]{4,}/g) ?? []) set.add(w);
  }
  for (const w of ['tablet', 'tablets', 'capsule', 'capsules', 'release', 'extended', 'delayed', 'hydrochloride', 'sodium', 'calcium', 'succinate', 'tartrate', 'acid', 'enteric', 'coated', 'chewable']) set.delete(w);
  return set;
}

function drugMentions(text: string, regimen: Set<string>): string[] {
  const found = new Set<string>();
  for (const re of [DRUG_SUFFIX, DRUG_WORDS]) for (const m of text.matchAll(re)) found.add(m[0].toLowerCase());
  for (const w of text.toLowerCase().match(/[a-z]{4,}/g) ?? []) if (regimen.has(w)) found.add(w);
  return [...found];
}

/**
 * Checks every block of a model answer against the sources it cites. Lexical checks only:
 * they catch many unsupported or wrong-drug statements but cannot prove an answer is correct.
 */
export function validateAnswer(raw: unknown, sources: Source[], record: ConsultationRecord): Validated | Rejected {
  const reasons: string[] = [];
  const byId = new Map(sources.map((s) => [s.id, s]));
  const regimen = regimenWords(record);

  const obj = raw as any;
  if (obj && typeof obj === 'object' && obj.can_answer === false) return { ok: false, reasons: ['model declined: the sources do not answer the question'], declined: true };
  if (!obj || typeof obj !== 'object' || obj.can_answer !== true) return { ok: false, reasons: ['model returned no usable answer (can_answer must be true or false)'] };
  const blocks: Block[] = Array.isArray(obj.blocks) ? obj.blocks : [];
  if (blocks.length < 1 || blocks.length > 8) return { ok: false, reasons: ['answer must have 1 to 8 blocks'] };

  const clean: Block[] = [];
  blocks.forEach((b, i) => {
    const tag = `block ${i + 1}`;
    if (!b || typeof b.text !== 'string' || !b.text.trim() || b.text.length > 700) return reasons.push(`${tag}: missing or too-long text`);
    if (!Array.isArray(b.sources) || b.sources.length === 0) return reasons.push(`${tag}: no citation`);
    const ids = b.sources.map(canonicalSourceId) as string[];
    const bad = ids.filter((id) => typeof id !== 'string' || !byId.has(id));
    if (bad.length) return reasons.push(`${tag}: cites ${bad.map((x) => `"${String(x)}"`).join(', ')}, which is not a provided source id (use only ${[...byId.keys()].join(', ')})`);
    const cited = ids.map((id) => byId.get(id));
    const src = cited as Source[];
    const srcText = norm(src.map((s) => `${s.label} ${s.text}`).join(' '));
    const text = norm(b.text);

    if (IDENTITY.test(b.text)) reasons.push(`${tag}: claims to be a pharmacist/clinician`);

    if (ATTRIBUTION.test(b.text) && !src.some((s) => s.kind === 'record')) reasons.push(`${tag}: attributes a statement to the pharmacist without citing the record`);

    for (const q of b.text.matchAll(/["“]([^"”]{12,})["”]/g)) {
      const quote = norm(q[1]).replace(/[.!?,;:]+$/, '');
      if (quote.split(' ').length >= 3 && !srcText.includes(quote)) reasons.push(`${tag}: quotation not found in the cited sources`);
    }

    for (const d of drugMentions(b.text, regimen)) {
      if (!srcText.includes(d)) reasons.push(`${tag}: names "${d}", which the cited sources do not mention`);
    }

    for (const m of b.text.matchAll(DOSE)) {
      const amount = `${m[1].replace(',', '.')} ${m[2].toLowerCase()}`;
      const compact = amount.replace(' ', '');
      if (!srcText.replace(/(\d)\s+(?=[a-zµ])/g, '$1').includes(compact) && !srcText.includes(amount)) reasons.push(`${tag}: amount "${m[0]}" is not in the cited sources`);
    }

    for (const re of DIRECTIVES) {
      const m = re.exec(b.text);
      if (m && !srcText.includes(norm(m[0]))) reasons.push(`${tag}: gives an instruction ("${m[0].trim()}") that the cited sources do not state`);
    }

    // Lexical support: most meaningful words should appear in what was cited.
    const sig = [...new Set(tokens(text).filter((t) => t.length >= 5))];
    if (sig.length >= 4) {
      const srcStems = new Set(tokens(srcText).map((t) => t.slice(0, 5)));
      const supported = sig.filter((t) => srcStems.has(t.slice(0, 5))).length / sig.length;
      if (supported < 0.5) reasons.push(`${tag}: only ${Math.round(supported * 100)}% of its content words appear in the cited sources`);
    }
    clean.push({ text: b.text.trim(), sources: [...new Set<string>(ids)] });
  });

  if (reasons.length) return { ok: false, reasons };
  const used = [...new Set(clean.flatMap((b) => b.sources))];
  const citations: Citation[] = used.map((id) => {
    const s = byId.get(id)!;
    return { id, label: s.label, quote: s.text.length > 240 ? `${s.text.slice(0, 237)}…` : s.text, ...(s.url ? { url: s.url } : {}) };
  });
  return { ok: true, blocks: clean, citations };
}
