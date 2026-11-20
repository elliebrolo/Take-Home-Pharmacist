import type { ConsultationRecord } from '../../src/types/pharmacy.ts';
import type { LabelPassage, Source } from '../core/deps.ts';

const STOP = new Set('the and for are but not you your with what when how can should does this that have from they will about into than then them been were was has had its our out any all may more most also only other some such just like over take taking taken medicine medicines medication'.split(' '));

export function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []).filter((t) => !STOP.has(t));
}

function chunk(text: string, max = 700): string[] {
  const out: string[] = [];
  let cur = '';
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if (cur && cur.length + s.length > max) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

/** Every statement the pharmacist's approved record makes, as separately citable items. */
export function recordSources(c: ConsultationRecord): Source[] {
  const out: Source[] = [];
  const add = (label: string, text: string, drug?: string) => {
    if (text.trim()) out.push({ id: `R${out.length + 1}`, kind: 'record', label, text: text.trim(), drug });
  };
  add('Visit summary', c.clinicalSummary);
  for (const m of c.medications) {
    const name = `${m.medicationName} ${m.strength}`.trim();
    const names = [m.medicationName, m.genericName, m.brandName].filter(Boolean).join(' / ');
    add(
      `Your schedule for ${name}`,
      `${names}, ${m.strength}, ${m.dosageForm}. Dose: ${m.doseAmount}. How often: ${m.frequency}. Usual time: ${m.targetTime}. Food: ${m.foodInstructions}. For: ${m.purpose}.`,
      m.medicationName,
    );
    if (m.pharmacistAdvice) add(`Your pharmacist's advice on ${m.medicationName}`, m.pharmacistAdvice, m.medicationName);
    if (m.warnings?.length) add(`Warnings recorded for ${m.medicationName}`, m.warnings.join(' '), m.medicationName);
  }
  for (const w of c.generalDietaryWarnings) {
    add(`Food and drink note: ${w.foodOrDrink}`, `${w.foodOrDrink} (${w.riskLevel}). Affects: ${w.interactsWith.join(', ')}. ${w.explanation} ${w.safeAlternative ?? ''}`);
  }
  for (const t of c.emergencyTriggers) add('When to get help (from your pharmacist)', `${t.symptoms.join(', ')}: ${t.action}`);
  chunk(c.rawTranscript).forEach((t, i) => add(`Your visit notes, part ${i + 1}`, t));
  return out;
}

const SECTION_WEIGHT: Record<string, number> = { 'Boxed warning': 1.5, 'Drug interactions': 1.2, 'Information for patients': 1.1, 'Warnings and precautions': 1.1 };

/** Keyword-overlap ranking of label passages against the question (plus recent patient turns). */
export function pickLabelSources(passages: LabelPassage[], queryText: string, start: number, limit = 7): Source[] {
  const q = new Set(tokens(queryText));
  if (!q.size) return [];
  const df = new Map<string, number>();
  const toks = passages.map((p) => new Set(tokens(`${p.drug} ${p.section} ${p.text}`)));
  toks.forEach((s) => s.forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
  const scored = passages
    .map((p, i) => {
      let score = 0;
      for (const t of q) if (toks[i].has(t)) score += 1 + Math.log((passages.length + 1) / (df.get(t)! + 0.5));
      return { p, score: score * (SECTION_WEIGHT[p.section] ?? 1) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map(({ p }, i) => ({
    id: `L${start + i}`,
    kind: 'label' as const,
    label: `${p.drug} label (FDA/DailyMed), ${p.section}${p.effective ? `, ${p.effective}` : ''}`,
    text: p.text,
    url: p.url,
    drug: p.drug,
  }));
}
