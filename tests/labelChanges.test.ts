import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openDb } from '../server/core/db.ts';
import { LabelKnowledge } from '../server/knowledge/store.ts';
import { ConsultationStore } from '../server/core/consultations.ts';
import { diffSections } from '../server/knowledge/changes.ts';
import { DEFAULT_CONSULTATIONS } from '../src/data/defaultConsultations.ts';

const XML = fs.readFileSync(new URL('./fixtures/sample-spl.xml', import.meta.url), 'utf8');
const SET = 'aaaaaaaa-0000-4000-8000-000000000001';
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });

/** A DailyMed that serves whatever `state` currently says. */
function fakeDailyMed(state: { xml: string; sets: Array<{ setid: string; title: string }>; xmlBySet?: Record<string, string> }): typeof fetch {
  return (async (url: any) => {
    const u = String(url);
    if (u.includes('spls.json')) return json({ data: state.sets });
    const m = /spls\/([^/]+)\.xml/.exec(u);
    if (m) {
      const x = state.xmlBySet ? state.xmlBySet[m[1]] : state.xml;
      return x ? new Response(x) : new Response('gone', { status: 404 });
    }
    throw new Error('unexpected ' + u);
  }) as any;
}

/** A DB with Robert Chen's approved plan, whose atorvastatin entry carries RxCUI 111 (as the server stamps at approval). */
function setup() {
  const db = openDb(':memory:');
  const chen = structuredClone(DEFAULT_CONSULTATIONS[0]);
  chen.medications.find((m) => /atorvastatin/i.test(m.medicationName))!.rxcui = '111';
  new ConsultationStore(db).seedApproved([chen, DEFAULT_CONSULTATIONS[1], DEFAULT_CONSULTATIONS[2]]);
  return db;
}
const items = (db: any) => db.prepare("SELECT * FROM review_items WHERE reason='label_changed' ORDER BY id").all() as any[];

test('diffSections: edits, additions and removals count; whitespace does not', () => {
  const a = new Map([['Drug interactions', 'one  two'], ['Warnings', 'w']]);
  const b = new Map([['Drug interactions', 'one two'], ['Overdosage', 'o']]);
  assert.deepEqual(diffSections(a, b), ['Overdosage', 'Warnings']);
});

test('a refreshed label with changed text is flagged for the patients on that drug, and only them', async () => {
  const db = setup();
  const state = { xml: XML, sets: [{ setid: SET, title: 'EXAMPLEDRUG TABLET [ACME]' }] };
  const k = new LabelKnowledge(db, fakeDailyMed(state));
  assert.equal(await k.ensureLabel('111', 'atorvastatin'), true);
  assert.equal(items(db).length, 0, 'first fetch is not a change');
  assert.equal((db.prepare('SELECT COUNT(*) n FROM label_changes').get() as any).n, 0);

  // unchanged text: nothing flagged, even though we forced a re-read
  await k.ensureLabel('111', 'atorvastatin', { force: true });
  assert.equal(items(db).length, 0);

  // new label text in one section
  state.xml = XML.replace('large amounts may raise levels.', 'large amounts may raise levels and cause muscle injury.');
  await k.ensureLabel('111', 'atorvastatin', { force: true });
  const rows = items(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].patient_id, 'PT-8821');
  assert.equal(rows[0].status, 'open');
  const d = JSON.parse(rows[0].detail);
  assert.deepEqual(d.changedSections, ['Drug interactions']);
  assert.equal(d.rxcui, '111');
  assert.match(d.url, /^https:\/\/dailymed\.nlm\.nih\.gov\//);
  assert.ok(!/question|message/i.test(JSON.stringify(Object.keys(d))), 'no patient text in the item');
  assert.equal((db.prepare('SELECT COUNT(*) n FROM label_changes').get() as any).n, 1);

  // a second change while the first is still open does not pile up a duplicate
  state.xml = state.xml.replace('muscle injury', 'serious muscle injury');
  await k.ensureLabel('111', 'atorvastatin', { force: true });
  assert.equal(items(db).length, 1);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM label_changes').get() as any).n, 2, 'but the change itself is still recorded');

  // the patient's approved plan was not touched
  const plan = new ConsultationStore(db).approvedFor('PT-8821')!;
  assert.deepEqual(plan.medications.map((m) => m.medicationName), DEFAULT_CONSULTATIONS[0].medications.map((m) => m.medicationName));
});

test('a version bump with identical text is not flagged', async () => {
  const db = setup();
  const state = { xml: XML, sets: [{ setid: SET, title: 'X' }] };
  const k = new LabelKnowledge(db, fakeDailyMed(state));
  await k.ensureLabel('111', 'atorvastatin');
  state.xml = XML.replace('<versionNumber value="7"/>', '<versionNumber value="8"/>');
  await k.ensureLabel('111', 'atorvastatin', { force: true });
  assert.equal(items(db).length, 0);
  assert.equal(k.passagesFor(['111'])[0].version, '8', 'the newer version is stored');
});

test('a refresh keeps using the same label, even when DailyMed now lists another manufacturer first', async () => {
  const db = setup();
  const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';
  const state = {
    xml: '',
    sets: [{ setid: SET, title: 'A' }],
    xmlBySet: { [SET]: XML, [OTHER]: XML.replace('grapefruit', 'pomelo') } as Record<string, string>,
  };
  const k = new LabelKnowledge(db, fakeDailyMed(state));
  await k.ensureLabel('111', 'atorvastatin');
  state.sets = [{ setid: OTHER, title: 'B' }, { setid: SET, title: 'A' }];
  await k.ensureLabel('111', 'atorvastatin', { force: true });
  assert.equal(k.passagesFor(['111'])[0].setId, SET);
  assert.equal(items(db).length, 0);
});

test('if the stored label disappears and a different one replaces it, that is flagged', async () => {
  const db = setup();
  const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';
  const state = { xml: '', sets: [{ setid: SET, title: 'A' }], xmlBySet: { [SET]: XML } as Record<string, string> };
  const k = new LabelKnowledge(db, fakeDailyMed(state));
  await k.ensureLabel('111', 'atorvastatin');
  delete state.xmlBySet[SET];
  state.xmlBySet[OTHER] = XML;
  state.sets = [{ setid: OTHER, title: 'B' }];
  await k.ensureLabel('111', 'atorvastatin', { force: true });
  assert.equal(items(db).length, 1);
  assert.match(items(db)[0].question, /source label was replaced/);
});

test('plans without a stored RxCUI are matched through the RxNorm cache by medication name', async () => {
  const db = openDb(':memory:');
  new ConsultationStore(db).seedApproved(DEFAULT_CONSULTATIONS); // demo plans carry no rxcui
  db.prepare('INSERT INTO rxnorm_cache (query, rxcui, name, fetched_at) VALUES (?,?,?,?)').run('metformin', '111', 'metformin', new Date().toISOString());
  const state = { xml: XML, sets: [{ setid: SET, title: 'A' }] };
  const k = new LabelKnowledge(db, fakeDailyMed(state));
  await k.ensureLabel('111', 'metformin');
  state.xml = XML.replace('large amounts may raise levels.', 'avoid large amounts.');
  await k.ensureLabel('111', 'metformin', { force: true });
  assert.deepEqual(items(db).map((r) => r.patient_id), ['PT-9410']);
});

test('refreshKnownLabels re-reads every cached label, counts changes, and survives one failure', async () => {
  const db = setup();
  const state = { xml: '', sets: [{ setid: SET, title: 'A' }], xmlBySet: { [SET]: XML } as Record<string, string> };
  const base = fakeDailyMed(state);
  // lookups for rxcui 222 always fail (service down); stored set 's' is not served
  const k = new LabelKnowledge(db, (async (u: any, i: any) => { if (String(u).includes('rxcui=222')) throw new Error('down'); return base(u, i); }) as any);
  await k.ensureLabel('111', 'atorvastatin');
  db.prepare("INSERT INTO drug_labels (rxcui, name, set_id, title, version, effective, url, fetched_at) VALUES ('222','other','s','t','1','2026','https://dailymed.nlm.nih.gov/x','2020-01-01')").run();
  state.xmlBySet[SET] = XML.replace('large amounts may raise levels.', 'changed text.');
  const r = await k.refreshKnownLabels();
  assert.deepEqual(r, { checked: 2, changed: 1, failed: 1 });
  assert.equal(items(db).length, 1);
});

test('POST /api/drug-labels/refresh: pharmacists only, audited, one run at a time', async () => {
  const { startTestServer, fakeKnowledge } = await import('./helpers.ts');
  const { registerDrugRoutes } = await import('../server/routes/drugs.ts');
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const t = await startTestServer({ knowledge: fakeKnowledge({ refreshKnownLabels: async () => { await gate; return { checked: 3, changed: 1, failed: 0 }; } }) });
  try {
    registerDrugRoutes(t.app, t.deps);
    assert.equal((await t.call('POST', '/api/drug-labels/refresh')).status, 401);
    const patient = await t.login('patient', 'PT-8821');
    assert.equal((await t.call('POST', '/api/drug-labels/refresh', undefined, patient)).status, 403);
    const ph = await t.login('pharmacist');
    const first = t.call('POST', '/api/drug-labels/refresh', undefined, ph);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await t.call('POST', '/api/drug-labels/refresh', undefined, ph)).status, 409);
    release();
    const done = await first;
    assert.deepEqual(done.json, { checked: 3, changed: 1, failed: 0 });
    assert.ok((t.deps.db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='labels.refresh'").get() as any).n === 1);
  } finally { t.close(); }
});
