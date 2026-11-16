/**
 * Medication photo routes.
 *
 * Photo sources, in order of preference:
 *  1. pharmacist_photo : the pharmacist photographs the dispensed pill (upload).
 *  2. nlm_rximage      : US reference photos from NLM's archived RxImage set,
 *                        self-hosted from data/nlm (see scripts/nlm-fetch.ts).
 *  3. dailymed_label   : package/label images from the FDA label on DailyMed.
 *
 * None of these routes decides what a patient sees. They only find candidates or
 * store a file. A pharmacist must confirm an image in the Pharmacist Workspace,
 * and the client-side display rule (src/utils/medicationPhoto.ts) re-checks it.
 *
 * Licensing:
 *  - NLM images: "Courtesy of the U.S. National Library of Medicine" must be shown;
 *    NLM labels them research-and-development use, no longer updated, US products.
 *  - Health Canada DPD: Open Government Licence - Canada (attribution).
 *  - DailyMed images are manufacturer-submitted; redisplay terms are unconfirmed.
 */
import express, { Express, NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const NLM_DIR = path.join(DATA_DIR, 'nlm');
const NLM_IMAGE_DIR = path.join(NLM_DIR, 'images');

// ---------- shared helpers ----------

class UpstreamError extends Error {
  constructor(message: string, public status: number, public retryAfterSeconds?: number) {
    super(message);
  }
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (resp.status === 429) {
      throw new UpstreamError('Rate limited', 429, Number(resp.headers.get('retry-after')) || 60);
    }
    if (!resp.ok) throw new UpstreamError(`Upstream responded with HTTP ${resp.status}`, resp.status);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

function sendUpstreamError(res: Response, err: any, service: string) {
  if (err instanceof UpstreamError && err.status === 429) {
    const wait = err.retryAfterSeconds ?? 60;
    res.setHeader('Retry-After', String(wait));
    return res.status(429).json({
      success: false,
      error: `${service} is busy. Wait about ${wait} seconds and try again. No photo will be shown to the patient meanwhile.`,
    });
  }
  console.warn(`${service} lookup failed:`, err?.message);
  return res.status(502).json({
    success: false,
    error: `Could not reach ${service}. No photo will be shown to the patient. Try again shortly.`,
  });
}

// ---------- NDC normalisation ----------

const NDC_HYPHENATED = /^\d{4,5}-\d{3,4}(-\d{1,2})?$/;
const NDC_DIGITS = /^\d{10,11}$/;

/**
 * DailyMed indexes the 10-digit NDC as printed on labels (4-4-2, 5-3-2 or 5-4-1).
 * Pharmacy systems usually hold the 11-digit 5-4-2 billing form, which DailyMed
 * does NOT match. Returns the dashed 10-digit forms to try, most likely first.
 */
export function ndcLookupVariants(input: string): string[] | null {
  const ndc = input.trim();
  const out: string[] = [];
  const add = (v: string) => { if (!out.includes(v)) out.push(v); };

  if (NDC_HYPHENATED.test(ndc)) {
    add(ndc);
    const m = /^(\d{5})-(\d{4})-(\d{2})$/.exec(ndc); // 11-digit 5-4-2 form
    if (m) {
      const [, l, p, k] = m;
      if (p.startsWith('0')) add(`${l}-${p.slice(1)}-${k}`); // 5-3-2
      if (l.startsWith('0')) add(`${l.slice(1)}-${p}-${k}`); // 4-4-2
      if (k.startsWith('0')) add(`${l}-${p}-${k.slice(1)}`); // 5-4-1
    }
    return out;
  }
  if (NDC_DIGITS.test(ndc)) {
    if (ndc.length === 11) {
      return ndcLookupVariants(`${ndc.slice(0, 5)}-${ndc.slice(5, 9)}-${ndc.slice(9)}`);
    }
    add(`${ndc.slice(0, 4)}-${ndc.slice(4, 8)}-${ndc.slice(8)}`); // 4-4-2
    add(`${ndc.slice(0, 5)}-${ndc.slice(5, 8)}-${ndc.slice(8)}`); // 5-3-2
    add(`${ndc.slice(0, 5)}-${ndc.slice(5, 9)}-${ndc.slice(9)}`); // 5-4-1
    return out;
  }
  return null;
}

// ---------- DailyMed (package / label images) ----------

const DAILYMED_API = 'https://dailymed.nlm.nih.gov/dailymed/services/v2';
const DAILYMED_HOST = 'dailymed.nlm.nih.gov';
const LOOKUP_TTL_MS = 6 * 60 * 60 * 1000;
const dailymedCache = new Map<string, { at: number; matchedNdc: string; results: any[] }>();

function isDailyMedImageUrl(raw: unknown): raw is string {
  try {
    const u = new URL(String(raw));
    return u.protocol === 'https:' && u.hostname === DAILYMED_HOST;
  } catch {
    return false;
  }
}

async function dailymedLookup(ndc: string) {
  const labels: any[] = (await fetchJson(`${DAILYMED_API}/spls.json?ndc=${encodeURIComponent(ndc)}&pagesize=3`))?.data ?? [];
  const retrievedAt = new Date().toISOString();
  return Promise.all(
    labels.slice(0, 3).map(async (label) => {
      const media = await fetchJson(`${DAILYMED_API}/spls/${encodeURIComponent(label.setid)}/media.json`);
      const candidates = (Array.isArray(media?.data?.media) ? media.data.media : [])
        .filter((m: any) => typeof m?.mime_type === 'string' && m.mime_type.startsWith('image/') && isDailyMedImageUrl(m.url))
        .map((m: any) => ({ name: String(m.name || 'image'), imageUrl: m.url as string }));
      return {
        ndc,
        setId: String(label.setid),
        labelTitle: String(label.title || ''),
        labelVersion: `v${label.spl_version} (published ${label.published_date})`,
        sourceUrl: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(label.setid)}`,
        retrievedAt,
        candidates,
      };
    })
  );
}

// ---------- NLM RxImage (self-hosted reference pill photos) ----------

interface NlmEntry {
  file: string;
  ndc11: string;
  rxcui: string;
  name: string;
  labeler: string;
  imprint: string;
  shape: string;
  color: string;
  sizeMm: number | null;
}

let nlmCache: { mtimeMs: number; entries: NlmEntry[] } | null = null;

function loadNlmIndex(): NlmEntry[] | null {
  const file = path.join(NLM_DIR, 'index.json');
  try {
    const stat = fs.statSync(file);
    if (!nlmCache || nlmCache.mtimeMs !== stat.mtimeMs) {
      nlmCache = { mtimeMs: stat.mtimeMs, entries: JSON.parse(fs.readFileSync(file, 'utf8')).entries };
    }
    return nlmCache.entries;
  } catch {
    return null;
  }
}

type FormClass = 'plain' | 'extended' | 'delayed' | 'chewable';

function formClassOfEntry(name: string): FormClass {
  const n = name.toLowerCase();
  if (n.includes('extended release') || n.includes('24 hr')) return 'extended';
  if (n.includes('delayed release')) return 'delayed';
  if (n.includes('chewable')) return 'chewable';
  return 'plain';
}

function formClassOfQuery(text: string): FormClass {
  const t = text.toLowerCase();
  if (/\b(er|xr|sr|cr|la|extended)\b|24\s?h/.test(t)) return 'extended';
  if (/enteric|delayed|\bec\b/.test(t)) return 'delayed';
  if (/chew/.test(t)) return 'chewable';
  return 'plain';
}

const NOISE = new Set([
  'tablet', 'tablets', 'capsule', 'capsules', 'oral', 'film', 'coated', 'extended', 'release', 'delayed', 'enteric',
  'chewable', 'and', 'with', 'for', 'the', 'usp', 'er', 'xr', 'sr', 'ec', 'cr',
]);

const INGREDIENT_SYNONYMS: Record<string, string> = {
  acetylsalicylic: 'aspirin',
  paracetamol: 'acetaminophen',
  salbutamol: 'albuterol',
};

function searchNlm(entries: NlmEntry[], q: { name: string; generic: string; strength: string; dosageForm: string }) {
  const tokensOf = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 3 && !NOISE.has(t));
  const primary = tokensOf(q.generic || q.name);
  const nameTokens = tokensOf(q.name);
  // The main ingredient may be written as the generic OR the brand/display name
  // (e.g. "Acetylsalicylic Acid" vs "Aspirin"), so accept either as an anchor.
  const anchors = Array.from(
    new Set([tokensOf(q.generic)[0], nameTokens[0]].filter(Boolean).map((t) => INGREDIENT_SYNONYMS[t] ?? t))
  );
  if (anchors.length === 0) return [];
  const numbers = (q.strength.match(/\d+(?:\.\d+)?/g) || []).map((n) => String(parseFloat(n)));
  // A combination product is "A and B", "A/B", "A & B" or "A-B". A hyphen inside a
  // form word ("Extended-Release", "Film-Coated") must not count as a combo marker.
  const hyphenPairs = Array.from(`${q.generic} ${q.name}`.toLowerCase().matchAll(/([a-z]+)-([a-z]+)/g));
  const hasComboHyphen = hyphenPairs.some(([, a, b]) => !NOISE.has(a) && !NOISE.has(b));
  const isCombo = /[/&]/.test(q.strength) || / and |[/&]/i.test(q.generic || q.name) || hasComboHyphen;
  const wantForm = formClassOfQuery(`${q.name} ${q.dosageForm}`);

  const scored: Array<{ e: NlmEntry; score: number }> = [];
  for (const e of entries) {
    const n = e.name.toLowerCase();
    if (!anchors.some((a) => n.includes(a))) continue; // the main ingredient must match
    if (!isCombo && n.includes(' / ')) continue; // don't offer combination products for a single-ingredient drug
    if (formClassOfEntry(e.name) !== wantForm) continue;
    const entryNumbers = (n.match(/\d+(?:\.\d+)?/g) || []).map((x) => String(parseFloat(x)));
    if (numbers.length > 0 && !numbers.every((x) => entryNumbers.includes(x))) continue; // every strength number must appear
    let score = 0;
    for (const t of primary.slice(1)) if (n.includes(t)) score += 1;
    for (const t of nameTokens) if (n.includes(t)) score += 1;
    if (/\[/.test(e.name) && q.name.toLowerCase().includes(e.name.toLowerCase().split('[')[1]?.replace(']', '').trim() ?? '\u0000')) score += 2;
    scored.push({ e, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.e.labeler.localeCompare(b.e.labeler)).map((s) => s.e);
}

// ---------- uploads ----------

const UPLOAD_LIMIT_BYTES = 6 * 1024 * 1024;
const uploadHits = new Map<string, number[]>();

function detectImageType(buf: Buffer): { ext: 'jpg' | 'png' | 'webp'; mime: string } | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

// ---------- routes ----------

export function registerMedicationPhotoRoutes(app: Express) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const staticHeaders = (res: Response) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
  };
  app.use('/uploads', express.static(UPLOAD_DIR, { index: false, dotfiles: 'deny', maxAge: '30d', immutable: true, setHeaders: staticHeaders }));
  app.use('/nlm-images', express.static(NLM_IMAGE_DIR, { index: false, dotfiles: 'deny', maxAge: '30d', setHeaders: staticHeaders }));

  // --- 1. Pharmacist photograph upload ---
  app.post(
    '/api/medication-photo/upload',
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: UPLOAD_LIMIT_BYTES }),
    (req: Request, res: Response) => {
      // Basic abuse guard until real authentication exists: 40 uploads per IP per hour.
      const ip = req.ip || 'unknown';
      const now = Date.now();
      const recent = (uploadHits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
      if (recent.length >= 40) return res.status(429).json({ success: false, error: 'Too many uploads. Try again later.' });

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return res.status(415).json({ success: false, error: 'Send the photo as a JPEG, PNG or WebP image.' });
      }
      const type = detectImageType(body); // trust the bytes, not the header
      if (!type) return res.status(415).json({ success: false, error: 'That file is not a valid JPEG, PNG or WebP image.' });

      const name = `${crypto.randomBytes(16).toString('hex')}.${type.ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, name), body, { flag: 'wx' });
      recent.push(now);
      uploadHits.set(ip, recent);
      return res.json({ success: true, url: `/uploads/${name}` });
    }
  );
  app.use('/api/medication-photo/upload', (err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ success: false, error: 'That photo is too large (6 MB maximum).' });
    }
    return next(err);
  });

  // --- 2. NLM reference photos (US products, pharmacist must confirm a match) ---
  app.get('/api/medication-photo/nlm', (req: Request, res: Response) => {
    const entries = loadNlmIndex();
    if (!entries) {
      return res.status(503).json({
        success: false,
        error: 'The NLM reference photo set has not been downloaded on this server. Run "npm run nlm:fetch".',
      });
    }
    const q = {
      name: String(req.query.name || '').slice(0, 120),
      generic: String(req.query.generic || '').slice(0, 120),
      strength: String(req.query.strength || '').slice(0, 60),
      dosageForm: String(req.query.dosageForm || '').slice(0, 80),
    };
    if (!q.name && !q.generic) return res.status(400).json({ success: false, error: 'A medication name is required.' });

    const matches = searchNlm(entries, q);
    const available = matches.filter((e) => fs.existsSync(path.join(NLM_IMAGE_DIR, '600', e.file)));
    return res.json({
      success: true,
      attribution: 'Courtesy of the U.S. National Library of Medicine',
      totalMatches: matches.length,
      notDownloaded: matches.length - available.length,
      candidates: available.slice(0, 12).map((e) => ({
        imageUrl: `/nlm-images/600/${e.file}`,
        name: e.name,
        ndc: e.ndc11,
        rxcui: e.rxcui,
        labeler: e.labeler,
        imprint: e.imprint,
        shape: e.shape,
        color: e.color,
        sizeMm: e.sizeMm,
      })),
    });
  });

  // --- 3. Health Canada Drug Product Database: identify a product by DIN ---
  app.get('/api/dpd', async (req: Request, res: Response) => {
    const raw = String(req.query.din || '').trim();
    if (!/^\d{1,8}$/.test(raw)) {
      return res.status(400).json({ success: false, error: 'A DIN is up to 8 digits, for example 02230711.' });
    }
    const din = raw.padStart(8, '0'); // the DPD API only matches the zero-padded 8-digit DIN
    const base = 'https://health-products.canada.ca/api/drug';
    try {
      const products = await fetchJson(`${base}/drugproduct/?din=${din}&lang=en&type=json`);
      if (!Array.isArray(products) || products.length === 0) {
        return res.json({ success: true, found: false, din });
      }
      const p = products[0];
      const [ingredients, forms, status] = await Promise.all([
        fetchJson(`${base}/activeingredient/?id=${p.drug_code}&lang=en&type=json`).catch(() => []),
        fetchJson(`${base}/form/?id=${p.drug_code}&lang=en&type=json`).catch(() => []),
        fetchJson(`${base}/status/?id=${p.drug_code}&lang=en&type=json`).catch(() => null),
      ]);
      return res.json({
        success: true,
        found: true,
        din,
        brandName: p.brand_name,
        company: p.company_name,
        ingredients: (Array.isArray(ingredients) ? ingredients : []).map((i: any) => ({
          name: i.ingredient_name,
          strength: [i.strength, i.strength_unit].filter(Boolean).join(' '),
        })),
        form: (Array.isArray(forms) ? forms : []).map((f: any) => f.pharmaceutical_form_name).join(', '),
        status: status?.status || '',
        attribution: 'Contains information licensed under the Open Government Licence - Canada (Health Canada Drug Product Database)',
      });
    } catch (err) {
      return sendUpstreamError(res, err, 'Health Canada');
    }
  });

  // --- 4. DailyMed package / label images by NDC ---
  app.get('/api/medication-photo', async (req: Request, res: Response) => {
    const typed = String(req.query.ndc || '').trim();
    const variants = ndcLookupVariants(typed);
    if (!variants) {
      return res.status(400).json({
        success: false,
        error: 'Enter the NDC as printed on the bottle, e.g. 58151-157-77 (11-digit forms like 58151-0157-77 also work).',
      });
    }

    const cached = dailymedCache.get(typed);
    if (cached && Date.now() - cached.at < LOOKUP_TTL_MS) {
      return res.json({ success: true, ndc: typed, matchedNdc: cached.matchedNdc, results: cached.results });
    }

    try {
      for (const variant of variants) {
        const results = await dailymedLookup(variant);
        if (results.length > 0) {
          dailymedCache.set(typed, { at: Date.now(), matchedNdc: variant, results });
          return res.json({ success: true, ndc: typed, matchedNdc: variant, results });
        }
      }
      return res.json({ success: true, ndc: typed, matchedNdc: null, results: [] });
    } catch (err) {
      return sendUpstreamError(res, err, 'DailyMed');
    }
  });
}
