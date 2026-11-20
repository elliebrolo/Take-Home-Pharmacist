import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openDb } from '../server/core/db.ts';
import { LabelKnowledge, KnowledgeUnavailable } from '../server/knowledge/store.ts';
import { parseSpl, chunkText, xmlToText } from '../server/knowledge/spl.ts';

// A small hand-written SPL-shaped fixture (structure copied from DailyMed's format; the sentences are made up for testing).
const FIXTURE_XML = fs.readFileSync(new URL('./fixtures/sample-spl.xml', import.meta.url), 'utf8');

test('parseSpl extracts wanted sections by LOINC code, with nested text, and metadata', () => {
  const p = parseSpl(FIXTURE_XML);
  assert.equal(p.setId, 'aaaaaaaa-0000-4000-8000-000000000001');
  assert.equal(p.version, '7');
  assert.equal(p.effective, '2026-01-15');
  const codes = p.sections.map((s) => s.code).sort();
  assert.deepEqual(codes, ['34067-9', '34073-7', '34076-0']);
  const inter = p.sections.find((s) => s.code === '34073-7')!;
  assert.match(inter.text, /Example grapefruit juice sentence/);
  assert.match(inter.text, /nested subsection text/, 'nested subsection is included in its parent');
  assert.ok(!p.sections.some((s) => s.code === '48780-1'), 'unwanted sections are skipped');
});

test('xmlToText decodes entities and strips tags', () => {
  assert.equal(xmlToText('<p>5 &lt; 10 &amp; 3&#176;</p>'), '5 < 10 & 3°');
});

test('chunkText keeps passages near the size limit and loses no text', () => {
  const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} says something useful.`).join(' ');
  const chunks = chunkText(text, 300);
  assert.ok(chunks.length > 3 && chunks.every((c) => c.length <= 480));
  assert.equal(chunks.join(' ').replace(/\s+/g, ' '), text);
});

function stubFetch(routes: Record<string, () => Response>, calls: string[] = []): typeof fetch {
  return (async (url: any) => {
    const u = String(url);
    calls.push(u);
    const key = Object.keys(routes).find((k) => u.includes(k));
    if (!key) throw new Error('unexpected ' + u);
    return routes[key]();
  }) as any;
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });

test('resolveRxcui: found ids and definitive misses are cached; outages are not cached and surface as unavailable', async () => {
  const db = openDb(':memory:');
  const calls: string[] = [];
  const k = new LabelKnowledge(db, stubFetch({ 'name=atorvastatin': () => json({ idGroup: { rxnormId: ['83367'] } }), 'name=zzyzx': () => json({ idGroup: {} }) }, calls));
  assert.equal(await k.resolveRxcui('Atorvastatin'), '83367');
  assert.equal(await k.resolveRxcui('atorvastatin'), '83367');
  assert.equal(await k.resolveRxcui('Zzyzx'), null);
  assert.equal(await k.resolveRxcui('zzyzx'), null);
  assert.equal(calls.length, 2, 'second lookups served from cache');
  const down = new LabelKnowledge(db, stubFetch({ 'name=lisinopril': () => json({}, 503) }));
  await assert.rejects(() => down.resolveRxcui('lisinopril'), KnowledgeUnavailable);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rxnorm_cache WHERE query=?').get('lisinopril')!.n, 0);
});

test('ensureLabel stores cited passages with provenance, and passagesFor returns them', async () => {
  const db = openDb(':memory:');
  const k = new LabelKnowledge(
    db,
    stubFetch({
      'spls.json': () => json({ data: [{ setid: 'aaaaaaaa-0000-4000-8000-000000000001', title: 'EXAMPLEDRUG TABLET [ACME]', spl_version: 7 }] }),
      '.xml': () => new Response(FIXTURE_XML),
    }),
  );
  assert.equal(await k.ensureLabel('111', 'exampledrug'), true);
  const ps = k.passagesFor(['111']);
  assert.ok(ps.length >= 3);
  for (const p of ps) {
    assert.match(p.url, /^https:\/\/dailymed\.nlm\.nih\.gov\/dailymed\/lookup\.cfm\?setid=/);
    assert.ok(p.section && p.setId && p.version === '7' && p.effective === '2026-01-15');
  }
  assert.deepEqual(k.passagesFor(['999']), []);
});

test('ensureLabel returns false (and stores nothing) when DailyMed has no label', async () => {
  const db = openDb(':memory:');
  const k = new LabelKnowledge(db, stubFetch({ 'spls.json': () => json({ data: [] }) }));
  assert.equal(await k.ensureLabel('222', 'nothing'), false);
  assert.equal(k.passagesFor(['222']).length, 0);
});

// Optional: hits the real NLM services. RUN_LIVE=1 npm test
test('LIVE: atorvastatin resolves and its real label has an interactions section', { skip: !process.env.RUN_LIVE }, async () => {
  const db = openDb(':memory:');
  const k = new LabelKnowledge(db);
  const rx = await k.resolveRxcui('atorvastatin');
  assert.ok(rx);
  assert.equal(await k.ensureLabel(rx!, 'atorvastatin'), true);
  const ps = k.passagesFor([rx!]);
  assert.ok(ps.some((p) => p.section === 'Drug interactions' && /grapefruit/i.test(p.text)));
});

import { nameVariants, resolveMedication } from '../server/knowledge/names.ts';
test('nameVariants strips release/form words but keeps the original first', () => {
  assert.deepEqual(nameVariants({ medicationName: 'Metoprolol Succinate ER', genericName: 'Metoprolol Succinate' }), ['Metoprolol Succinate', 'Metoprolol Succinate ER']);
  assert.ok(nameVariants({ medicationName: 'Metformin XR', genericName: '' }).includes('Metformin'));
});
test('resolveMedication tries variants in order and returns null only when none match', async () => {
  const seen: string[] = [];
  const k = { resolveRxcui: async (n: string) => (seen.push(n), n === 'Metformin' ? '6809' : null), ensureLabel: async () => true, passagesFor: () => [] };
  const hit = await resolveMedication({ medicationName: 'Metformin XR' } as any, k);
  assert.equal(hit?.rxcui, '6809');
  assert.equal(await resolveMedication({ medicationName: 'Zzyzx' } as any, k), null);
});
