import type { Db } from '../core/db.ts';
import type { Knowledge, LabelPassage } from '../core/deps.ts';
import { chunkText, parseSpl } from './spl.ts';

export class KnowledgeUnavailable extends Error {}

type Fetch = typeof fetch;
const RXNAV = 'https://rxnav.nlm.nih.gov/REST';
const DAILYMED = 'https://dailymed.nlm.nih.gov/dailymed/services/v2';
const LABEL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // re-pull labels weekly
const MAX_PASSAGES_PER_SECTION = 14;

async function getJson(f: Fetch, url: string, timeoutMs = 10_000): Promise<any> {
  let r: Response;
  try {
    r = await f(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } });
  } catch {
    throw new KnowledgeUnavailable(`Could not reach ${new URL(url).hostname}.`);
  }
  if (r.status === 429 || r.status >= 500) throw new KnowledgeUnavailable(`${new URL(url).hostname} is busy (HTTP ${r.status}).`);
  if (!r.ok) throw new KnowledgeUnavailable(`${new URL(url).hostname} returned HTTP ${r.status}.`);
  return r.json();
}

/**
 * Drug identity and label text from public NLM services:
 *  - RxNorm (RxNav) gives each medication a concept id (RxCUI).
 *  - DailyMed gives the FDA label; its sections are cached as passages that keep
 *    set id, section, version, date and URL so answers can cite them.
 * Text is stored exactly as the label words it; nothing here is paraphrased.
 */
export class LabelKnowledge implements Knowledge {
  constructor(private db: Db, private f: Fetch = fetch) {}

  async resolveRxcui(name: string): Promise<string | null> {
    const q = name.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!q) return null;
    const cached = this.db.prepare('SELECT rxcui FROM rxnorm_cache WHERE query=?').get(q) as any;
    if (cached) return cached.rxcui;
    // search=1 = normalised match; unknown strings return no id (we deliberately do not use approximate matching)
    const data = await getJson(this.f, `${RXNAV}/rxcui.json?name=${encodeURIComponent(q)}&search=1`);
    const id: string | null = data?.idGroup?.rxnormId?.[0] ?? null;
    this.db.prepare('INSERT OR REPLACE INTO rxnorm_cache (query, rxcui, name, fetched_at) VALUES (?,?,?,?)').run(q, id, name, new Date().toISOString());
    return id;
  }

  async ensureLabel(rxcui: string, nameHint: string): Promise<boolean> {
    const row = this.db.prepare('SELECT fetched_at FROM drug_labels WHERE rxcui=?').get(rxcui) as any;
    if (row && Date.now() - Date.parse(row.fetched_at) < LABEL_TTL_MS) return true;

    // Prefer the id match; fall back to the drug name. Skip repackager/kit noise by taking the first plain Rx tablet/capsule/solution title.
    let list: any[] = (await getJson(this.f, `${DAILYMED}/spls.json?rxcui=${encodeURIComponent(rxcui)}&pagesize=10`))?.data ?? [];
    if (!list.length && nameHint) {
      list = (await getJson(this.f, `${DAILYMED}/spls.json?drug_name=${encodeURIComponent(nameHint)}&pagesize=10`))?.data ?? [];
    }
    const pick = list.find((x) => !/\bKIT\b/i.test(x.title)) ?? list[0];
    if (!pick) return !!row;

    let xml: string;
    try {
      const r = await this.f(`${DAILYMED}/spls/${pick.setid}.xml`, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(String(r.status));
      xml = await r.text();
    } catch {
      return !!row; // keep serving the previous copy if there is one
    }
    const parsed = parseSpl(xml);
    if (!parsed.sections.length) return !!row;

    const url = `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${pick.setid}`;
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM label_passages WHERE rxcui=?').run(rxcui);
      const ins = this.db.prepare('INSERT OR REPLACE INTO label_passages (id, rxcui, section, section_code, text) VALUES (?,?,?,?,?)');
      for (const s of parsed.sections) {
        chunkText(s.text)
          .slice(0, MAX_PASSAGES_PER_SECTION)
          .forEach((t, i) => ins.run(`${pick.setid}#${s.code}#${i + 1}`, rxcui, s.section, s.code, t));
      }
      this.db
        .prepare('INSERT OR REPLACE INTO drug_labels (rxcui, name, set_id, title, version, effective, url, fetched_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(rxcui, nameHint, pick.setid, pick.title, parsed.version, parsed.effective, url, new Date().toISOString());
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return true;
  }

  passagesFor(rxcuis: string[]): LabelPassage[] {
    if (!rxcuis.length) return [];
    const q = rxcuis.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT p.id, p.rxcui, p.section, p.text, l.name, l.url, l.set_id, l.version, l.effective, l.title
         FROM label_passages p JOIN drug_labels l ON l.rxcui = p.rxcui WHERE p.rxcui IN (${q})`,
      )
      .all(...rxcuis) as any[];
    return rows.map((r) => ({
      id: r.id,
      rxcui: r.rxcui,
      drug: r.name,
      section: r.section,
      text: r.text,
      url: r.url,
      setId: r.set_id,
      version: r.version,
      effective: r.effective,
    }));
  }
}
