import type { Db } from '../core/db.ts';
import type { Knowledge, LabelPassage } from '../core/deps.ts';
import { chunkText, parseSpl } from './spl.ts';
import { diffSections, recordLabelChange, type LabelSnapshot } from './changes.ts';

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

  /** Stored label for a drug, grouped by section, or null when none is cached. */
  private snapshot(rxcui: string): (LabelSnapshot & { title: string }) | null {
    const row = this.db.prepare('SELECT set_id, title, version FROM drug_labels WHERE rxcui=?').get(rxcui) as any;
    if (!row) return null;
    const sections = new Map<string, string>();
    for (const p of this.db.prepare('SELECT section, text FROM label_passages WHERE rxcui=? ORDER BY id').all(rxcui) as any[]) {
      sections.set(p.section, `${sections.get(p.section) ?? ''} ${p.text}`.trim());
    }
    return { setId: row.set_id, title: row.title, version: row.version ?? null, sections };
  }

  /**
   * Make sure a label is cached and reasonably fresh. `force` re-pulls it now.
   * On a refresh, the SAME label (set id) is re-read so a different manufacturer's label is not swapped in by accident.
   * If the text of any section changed, or the source label had to be replaced, the change is recorded and the
   * pharmacist of every patient on that drug gets a review item (see changes.ts).
   */
  async ensureLabel(rxcui: string, nameHint: string, opts: { force?: boolean } = {}): Promise<boolean> {
    const row = this.db.prepare('SELECT fetched_at FROM drug_labels WHERE rxcui=?').get(rxcui) as any;
    if (!opts.force && row && Date.now() - Date.parse(row.fetched_at) < LABEL_TTL_MS) return true;
    const before = this.snapshot(rxcui);

    const fetchXml = async (setid: string): Promise<string | null> => {
      try {
        const r = await this.f(`${DAILYMED}/spls/${setid}.xml`, { signal: AbortSignal.timeout(30_000) });
        return r.ok ? await r.text() : null;
      } catch {
        return null;
      }
    };

    let pick: { setid: string; title: string } | undefined;
    let xml: string | null = null;
    if (before) {
      xml = await fetchXml(before.setId);
      if (xml) pick = { setid: before.setId, title: before.title };
    }
    if (!xml) {
      // Prefer the id match; fall back to the drug name. Skip repackager/kit noise by taking the first plain Rx tablet/capsule/solution title.
      let list: any[] = (await getJson(this.f, `${DAILYMED}/spls.json?rxcui=${encodeURIComponent(rxcui)}&pagesize=10`))?.data ?? [];
      if (!list.length && nameHint) {
        list = (await getJson(this.f, `${DAILYMED}/spls.json?drug_name=${encodeURIComponent(nameHint)}&pagesize=10`))?.data ?? [];
      }
      pick = list.find((x) => !/\bKIT\b/i.test(x.title)) ?? list[0];
      if (!pick) return !!row;
      xml = await fetchXml(pick.setid);
      if (!xml) return !!row; // keep serving the previous copy if there is one
    }
    const parsed = parseSpl(xml);
    if (!parsed.sections.length) return !!row;

    const url = `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${pick!.setid}`;
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM label_passages WHERE rxcui=?').run(rxcui);
      const ins = this.db.prepare('INSERT OR REPLACE INTO label_passages (id, rxcui, section, section_code, text) VALUES (?,?,?,?,?)');
      for (const s of parsed.sections) {
        chunkText(s.text)
          .slice(0, MAX_PASSAGES_PER_SECTION)
          .forEach((t, i) => ins.run(`${pick!.setid}#${s.code}#${i + 1}`, rxcui, s.section, s.code, t));
      }
      this.db
        .prepare('INSERT OR REPLACE INTO drug_labels (rxcui, name, set_id, title, version, effective, url, fetched_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(rxcui, nameHint, pick!.setid, pick!.title, parsed.version, parsed.effective, url, new Date().toISOString());
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }

    if (before) {
      const after = this.snapshot(rxcui)!;
      const changedSections = diffSections(before.sections, after.sections);
      if (after.setId !== before.setId || changedSections.length) {
        recordLabelChange(this.db, { rxcui, name: nameHint, before, after, url, changedSections });
      }
    }
    return true;
  }

  /** Scheduled job: re-pull every cached label and flag the ones whose text changed. One failure does not stop the rest. */
  async refreshKnownLabels(): Promise<{ checked: number; changed: number; failed: number }> {
    const rows = this.db.prepare('SELECT rxcui, name FROM drug_labels').all() as any[];
    const changesBefore = (this.db.prepare('SELECT COUNT(*) n FROM label_changes').get() as any).n as number;
    let failed = 0;
    for (const r of rows) {
      try {
        await this.ensureLabel(r.rxcui, r.name, { force: true });
      } catch {
        failed++;
      }
    }
    const changed = ((this.db.prepare('SELECT COUNT(*) n FROM label_changes').get() as any).n as number) - changesBefore;
    return { checked: rows.length, changed, failed };
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
