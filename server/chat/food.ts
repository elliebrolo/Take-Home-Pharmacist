import type { ConsultationRecord } from '../../src/types/pharmacy.ts';
import type { Knowledge } from '../core/deps.ts';
import { prepareLabels } from './answer.ts';
import type { Citation } from './validate.ts';

export interface FoodResult {
  /** 'caution' = a source mentions this food; 'unknown' = nothing found. The app never answers "safe". */
  verdict: 'caution' | 'unknown';
  isSafe: false;
  severity: 'none' | 'advisory' | 'moderate' | 'severe';
  title: string;
  summary: string;
  details: string;
  recommendation: string;
  affectedMedications: string[];
  sources: Citation[];
}

const SYNONYMS: Record<string, string[]> = {
  alcohol: ['alcohol', 'beer', 'wine', 'liquor', 'spirits', 'ethanol'],
  grapefruit: ['grapefruit', 'pomelo', 'seville orange'],
  dairy: ['milk', 'dairy', 'cheese', 'yogurt', 'yoghurt', 'calcium'],
  caffeine: ['coffee', 'caffeine', 'tea', 'cola'],
  potassium: ['potassium', 'banana', 'salt substitute'],
};

function terms(food: string): string[] {
  const f = food.toLowerCase().trim();
  const out = new Set<string>([f]);
  for (const [k, list] of Object.entries(SYNONYMS)) if (list.some((w) => f.includes(w)) || f.includes(k)) list.forEach((w) => out.add(w));
  return [...out].filter((t) => t.length >= 3);
}

function sentenceAround(text: string, term: string): string {
  const i = text.toLowerCase().indexOf(term);
  if (i < 0) return text.slice(0, 240);
  const start = Math.max(text.lastIndexOf('. ', i) + 2, i - 160, 0);
  const end = Math.min(text.indexOf('. ', i + term.length) + 1 || text.length, i + 280);
  return text.slice(start, end).trim();
}

/** Food/drink check built only from the approved record and cached FDA label text. No model, no defaults to "safe". */
export async function checkFood(food: string, record: ConsultationRecord, knowledge: Knowledge): Promise<FoodResult> {
  const ts = terms(food);
  const hit = (s: string) => ts.find((t) => s.toLowerCase().includes(t));
  const citations: Citation[] = [];
  const affected = new Set<string>();

  // 1. The pharmacist's own warnings for this patient
  const rank = { severe: 3, moderate: 2, advisory: 1 } as const;
  let top: (typeof record.generalDietaryWarnings)[number] | undefined;
  for (const w of record.generalDietaryWarnings) {
    if (hit(`${w.foodOrDrink} ${w.category}`)) {
      if (!top || rank[w.riskLevel] > rank[top.riskLevel]) top = w;
      w.interactsWith.forEach((m) => affected.add(m));
      citations.push({ id: `R${citations.length + 1}`, label: `Your pharmacist's note: ${w.foodOrDrink}`, quote: `${w.explanation}` });
    }
  }
  for (const m of record.medications) {
    const t = hit(`${m.foodInstructions} ${m.warnings?.join(' ') ?? ''}`);
    if (t) {
      affected.add(`${m.medicationName} ${m.strength}`.trim());
      citations.push({ id: `R${citations.length + 1}`, label: `Your instructions for ${m.medicationName}`, quote: sentenceAround(`${m.foodInstructions} ${m.warnings?.join(' ') ?? ''}`, t) });
    }
  }

  // 2. FDA label passages for the patient's medicines
  const rxcuis = await prepareLabels(record, knowledge);
  const labelHits: Citation[] = [];
  for (const p of knowledge.passagesFor(rxcuis)) {
    if (!['Drug interactions', 'Warnings and precautions', 'Warnings', 'Information for patients', 'Dosage and administration', 'Boxed warning'].includes(p.section)) continue;
    const t = hit(p.text);
    if (t && labelHits.length < 4) {
      labelHits.push({ id: `L${labelHits.length + 1}`, label: `${p.drug} label (FDA/DailyMed), ${p.section}`, quote: sentenceAround(p.text, t), url: p.url });
      affected.add(p.drug);
    }
  }
  const sources = [...citations, ...labelHits].slice(0, 6);

  if (top) {
    return {
      verdict: 'caution',
      isSafe: false,
      severity: top.riskLevel,
      title: `${top.foodOrDrink}: your pharmacist noted a concern`,
      summary: top.explanation,
      details: sources.filter((s) => s.id.startsWith('L')).map((s) => s.quote).join(' ') || 'This comes from your pharmacist\'s notes on your visit.',
      recommendation: top.safeAlternative ? `Instead: ${top.safeAlternative}` : 'Follow your pharmacist\'s advice, and ask them if you are unsure.',
      affectedMedications: [...affected],
      sources,
    };
  }
  if (sources.length) {
    return {
      verdict: 'caution',
      isSafe: false,
      severity: 'advisory',
      title: `The label for your medicine mentions ${food}`,
      summary: 'The official drug label says something about this. Read the quoted text below and ask your pharmacist how it applies to you.',
      details: sources.map((s) => s.quote).join(' '),
      recommendation: 'Ask your pharmacist before you eat or drink this regularly.',
      affectedMedications: [...affected],
      sources,
    };
  }
  return {
    verdict: 'unknown',
    isSafe: false,
    severity: 'none',
    title: `We couldn't check ${food}`,
    summary: `Nothing about ${food} was found in your pharmacist's notes or in the labels we have for your medicines. That does not mean it is safe.`,
    details: 'This tool only repeats what your own notes and the FDA labels say. It does not decide that a food is safe.',
    recommendation: `Please ask your pharmacist (${record.pharmacyName}, ${record.pharmacyPhone}) before relying on this.`,
    affectedMedications: [],
    sources: [],
  };
}
