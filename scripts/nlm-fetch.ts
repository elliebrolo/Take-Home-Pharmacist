/**
 * Builds the local NLM RxImage reference-photo set used by the pharmacist
 * workspace ("US reference photos" source).
 *
 *   npm run nlm:fetch                       # demo drugs only (default)
 *   npm run nlm:fetch -- --match atorvastatin,lisinopril
 *   npm run nlm:fetch -- --all              # every image (~350 MB at 600 px)
 *
 * What it does
 *  - Reads table.csv and MONGOexport/rximagesAll.json out of NLM's archived
 *    RxImage download (a 7.3 GB ZIP64 file) using HTTP range requests, so the
 *    archive itself is never downloaded in full.
 *  - Writes data/nlm/index.json (one entry per product: NDC, RxCUI, name,
 *    labeler, imprint, shape, colour, size).
 *  - Extracts the 600 px photos for the selected drugs to data/nlm/images/600/.
 *
 * Licensing / honesty notes (NLM Terms and Conditions)
 *  - Courtesy of the U.S. National Library of Medicine must be shown with the
 *    images. The app does this in the patient caption.
 *  - NLM labels the data research-and-development use only and says it is no
 *    longer updated (photos date from 2009-2016). They are US products, so they
 *    often differ from the Canadian product a patient holds. The pharmacist must
 *    confirm a match by eye; nothing here is shown to patients automatically.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const ARCHIVE_URL = 'https://data.lhncbc.nlm.nih.gov/public/Pills/rximage.zip';
const OUT_DIR = path.resolve(process.cwd(), 'data', 'nlm');
const DEFAULT_MATCH = ['atorvastatin', 'metoprolol', 'lisinopril', 'aspirin', 'metformin', 'glipizide', 'amoxicillin'];

// ---------- minimal ZIP64-capable reader over HTTP range requests ----------

async function rangeGet(start: number, end: number): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(ARCHIVE_URL, { headers: { Range: `bytes=${start}-${end}` } });
      if (res.status !== 206) throw new Error(`Range request returned HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  size: number;
  crc: number;
  offset: number;
}

async function readCentralDirectory(): Promise<ZipEntry[]> {
  const head = await fetch(ARCHIVE_URL, { method: 'HEAD' });
  const total = Number(head.headers.get('content-length'));
  if (!total || head.headers.get('accept-ranges') !== 'bytes') throw new Error('Archive does not support range requests');

  const tailLen = Math.min(total, 70 * 1024);
  const tail = await rangeGet(total - tailLen, total - 1);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('ZIP end-of-central-directory not found');

  let entries = tail.readUInt16LE(eocd + 10);
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);
  if (cdOffset === 0xffffffff || entries === 0xffff) {
    const loc = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]), eocd);
    if (loc < 0) throw new Error('ZIP64 locator not found');
    const eocd64Offset = Number(tail.readBigUInt64LE(loc + 8));
    const z64 = await rangeGet(eocd64Offset, eocd64Offset + 55);
    entries = Number(z64.readBigUInt64LE(32));
    cdSize = Number(z64.readBigUInt64LE(40));
    cdOffset = Number(z64.readBigUInt64LE(48));
  }

  const cd = await rangeGet(cdOffset, cdOffset + cdSize - 1);
  const out: ZipEntry[] = [];
  let p = 0;
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
    const method = cd.readUInt16LE(p + 10);
    const crc = cd.readUInt32LE(p + 16);
    let compSize = cd.readUInt32LE(p + 20);
    let size = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    let offset = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + 46, p + 46 + nameLen);

    // ZIP64 extended info: only the fields that were 0xFFFFFFFF appear, in this order.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = cd.readUInt16LE(e);
      const len = cd.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) { size = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (compSize === 0xffffffff) { compSize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (offset === 0xffffffff) { offset = Number(cd.readBigUInt64LE(q)); q += 8; }
      }
      e += 4 + len;
    }
    out.push({ name, method, compSize, size, crc, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (out.length !== entries) console.warn(`Warning: expected ${entries} entries, parsed ${out.length}`);
  return out;
}

async function readEntry(entry: ZipEntry): Promise<Buffer> {
  // Local header = 30 bytes + name + extra; fetch with slack so one request is usually enough.
  const slack = 600;
  const raw = await rangeGet(entry.offset, entry.offset + 30 + Buffer.byteLength(entry.name) + slack + entry.compSize - 1);
  if (raw.readUInt32LE(0) !== 0x04034b50) throw new Error(`Bad local header for ${entry.name}`);
  const dataStart = 30 + raw.readUInt16LE(26) + raw.readUInt16LE(28);
  const body = raw.subarray(dataStart, dataStart + entry.compSize);
  const data = entry.method === 0 ? body : entry.method === 8 ? zlib.inflateRawSync(body) : null;
  if (!data) throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
  if (data.length !== entry.size) throw new Error(`Size mismatch for ${entry.name}`);
  return data;
}

// ---------- index building ----------

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

export interface NlmIndexEntry {
  file: string; // file name in data/nlm/images/600
  ndc11: string;
  rxcui: string;
  name: string;
  labeler: string;
  imprint: string;
  shape: string;
  color: string;
  sizeMm: number | null;
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const mi = args.indexOf('--match');
  const match = (mi >= 0 ? args[mi + 1] : DEFAULT_MATCH.join(',')).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

  console.log('Reading NLM archive directory (range requests, no full download)...');
  const dir = await readCentralDirectory();
  const byName = new Map(dir.map((e) => [e.name, e]));

  const table = parseCsv((await readEntry(byName.get('table.csv')!)).toString('utf8'));
  const meta = new Map<string, any>();
  for (const line of (await readEntry(byName.get('MONGOexport/rximagesAll.json')!)).toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line);
      meta.set(m.rxnavImageFileName, m);
    } catch { /* skip malformed line */ }
  }

  const index: NlmIndexEntry[] = table.map((r) => {
    const m = meta.get(r.rxnavImageFileName) || {};
    return {
      file: r.rxnavImageFileName,
      ndc11: r.ndc11,
      rxcui: r.rxcui,
      name: r.name,
      labeler: m.labeler || '',
      imprint: m.mpc?.imprint || '',
      shape: m.mpc?.shape || '',
      color: m.mpc?.color || '',
      sizeMm: typeof m.mpc?.size === 'number' ? m.mpc.size : null,
    };
  });

  fs.mkdirSync(path.join(OUT_DIR, 'images', '600'), { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify({ builtAt: new Date().toISOString(), entries: index }));
  console.log(`Index: ${index.length} products -> data/nlm/index.json`);

  const wanted = index.filter((e) => all || match.some((m) => e.name.toLowerCase().includes(m)));
  console.log(`Downloading ${wanted.length} photos (${all ? 'all' : 'matching: ' + match.join(', ')})...`);

  let done = 0, skipped = 0, failed = 0;
  const queue = [...wanted];
  const worker = async () => {
    while (queue.length) {
      const e = queue.shift()!;
      const dest = path.join(OUT_DIR, 'images', '600', e.file);
      if (fs.existsSync(dest)) { skipped++; continue; }
      const entry = byName.get(`image/images/gallery/600/${e.file}`);
      if (!entry) { failed++; console.warn('  missing in archive:', e.file); continue; }
      try {
        fs.writeFileSync(dest, await readEntry(entry));
        done++;
        if (done % 25 === 0) console.log(`  ${done}/${wanted.length}`);
      } catch (err: any) {
        failed++;
        console.warn(`  failed ${e.file}: ${err.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  console.log(`Done. downloaded=${done} already-present=${skipped} failed=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
