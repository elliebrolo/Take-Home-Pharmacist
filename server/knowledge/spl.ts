/**
 * Minimal reader for FDA Structured Product Labeling (SPL) XML from DailyMed.
 * Extracts the clinically relevant sections by LOINC code and splits them into
 * citable passages. No XML dependency: sections are found with a balanced
 * <section> scanner, and text is the label's own wording with tags removed.
 */
export const SECTION_CODES: Record<string, string> = {
  '34066-1': 'Boxed warning',
  '34067-9': 'Indications and usage',
  '34068-7': 'Dosage and administration',
  '34070-3': 'Contraindications',
  '43685-7': 'Warnings and precautions',
  '34071-1': 'Warnings',
  '34084-4': 'Adverse reactions',
  '34073-7': 'Drug interactions',
  '34076-0': 'Information for patients',
  '68498-5': 'Patient counseling information',
  '34088-5': 'Overdosage',
  '34090-1': 'Clinical pharmacology',
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function xmlToText(xml: string): string {
  return xml
    .replace(/<\/(paragraph|item|tr|caption|title|br)\s*>|<br\s*\/>/g, ' \n ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns the raw XML of each outermost <section> that has the wanted LOINC code. */
function findSections(xml: string, wanted: Set<string>): Array<{ code: string; xml: string }> {
  const out: Array<{ code: string; xml: string }> = [];
  const re = /<section\b[^>]*>|<\/section>/g;
  const stack: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[0].startsWith('</')) {
      const start = stack.pop();
      if (start === undefined) continue;
      const chunk = xml.slice(start, m.index + m[0].length);
      const code = /<code\s+code="([0-9-]+)"/.exec(chunk)?.[1];
      if (code && wanted.has(code)) out.push({ code, xml: chunk });
    } else {
      stack.push(m.index);
    }
  }
  // drop sections nested inside another collected section
  return out.filter((a) => !out.some((b) => b !== a && b.xml.length > a.xml.length && b.xml.includes(a.xml)));
}

export interface ParsedLabel {
  title: string;
  setId: string;
  version: string;
  effective: string;
  sections: Array<{ code: string; section: string; text: string }>;
}

export function parseSpl(xml: string): ParsedLabel {
  const head = xml.slice(0, 6000);
  const title = xmlToText(/<title[^>]*>([\s\S]*?)<\/title>/.exec(head)?.[1] ?? '');
  const setId = /<setId\s+root="([^"]+)"/.exec(head)?.[1] ?? '';
  const version = /<versionNumber\s+value="([^"]+)"/.exec(head)?.[1] ?? '';
  const eff = /<effectiveTime\s+value="(\d{8})/.exec(head)?.[1] ?? '';
  const effective = eff ? `${eff.slice(0, 4)}-${eff.slice(4, 6)}-${eff.slice(6, 8)}` : '';
  const sections = findSections(xml, new Set(Object.keys(SECTION_CODES)))
    .map((s) => ({ code: s.code, section: SECTION_CODES[s.code], text: xmlToText(s.xml) }))
    .filter((s) => s.text.length > 40);
  return { title, setId, version, effective, sections };
}

/** Split text into passages of about `max` characters on sentence boundaries. */
export function chunkText(text: string, max = 900): string[] {
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9(])/);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + s.length + 1 > max) {
      out.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) out.push(cur);
  return out.flatMap((c) => (c.length <= max * 1.6 ? [c] : c.match(new RegExp(`.{1,${max}}`, 'g')) ?? [c]));
}
