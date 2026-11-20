import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.ts';
import { DEFAULT_CONSULTATIONS } from '../src/data/defaultConsultations.ts';

const t = await startTestServer();
after(() => t.close());
const CHEN = 'PT-8821';
const SANTOS = 'PT-9410';

test('anonymous requests cannot read any record', async () => {
  assert.equal((await t.call('GET', '/api/me/consultation')).status, 401);
  assert.equal((await t.call('GET', '/api/consultations')).status, 401);
});

test('patient gets only their own approved record, without the raw transcript', async () => {
  const cookie = await t.login('patient', CHEN);
  const r = await t.call('GET', '/api/me/consultation', undefined, cookie);
  assert.equal(r.status, 200);
  assert.equal(r.json.consultation.patientId, CHEN);
  assert.equal('rawTranscript' in r.json.consultation, false);
  assert.ok(!r.text.includes('Santos'));
});

test('a patient cannot choose another patient: there is no id parameter to tamper with', async () => {
  const cookie = await t.login('patient', CHEN);
  const r = await t.call('GET', `/api/me/consultation?patientId=${SANTOS}`, undefined, cookie);
  assert.equal(r.json.consultation.patientId, CHEN);
});

test('a patient cannot use pharmacist endpoints', async () => {
  const cookie = await t.login('patient', CHEN);
  assert.equal((await t.call('GET', '/api/consultations', undefined, cookie)).status, 403);
  assert.equal((await t.call('POST', '/api/consultations/consult-chen-01/approve', { attestChecked: true }, cookie)).status, 403);
});

test('patient with an access code configured needs it; wrong code is rejected', async () => {
  assert.equal((await t.call('POST', '/api/auth/login', { role: 'patient', patientId: SANTOS })).status, 401);
  assert.equal((await t.call('POST', '/api/auth/login', { role: 'patient', patientId: SANTOS, code: 'nope' })).status, 401);
  assert.equal((await t.call('POST', '/api/auth/login', { role: 'patient', patientId: SANTOS, code: 'santos-code' })).status, 200);
});

test('tampered or forged session cookies are rejected', async () => {
  const cookie = await t.login('patient', CHEN);
  const [name, val] = cookie.split('=');
  const forged = `${name}=${val.slice(0, -2)}xx`;
  assert.equal((await t.call('GET', '/api/me/consultation', undefined, forged)).status, 401);
  const payload = Buffer.from(JSON.stringify({ role: 'pharmacist', sub: 'x', exp: Date.now() + 1e6 })).toString('base64url');
  assert.equal((await t.call('GET', '/api/consultations', undefined, `${name}=${payload}.AAAA`)).status, 401);
});

test('wrong pharmacist passcode is rejected', async () => {
  assert.equal((await t.call('POST', '/api/auth/login', { role: 'pharmacist', passcode: 'wrong' })).status, 401);
});

test('draft edits are invisible to the patient until a pharmacist approves with attestation', async () => {
  const ph = await t.login('pharmacist');
  const pt = await t.login('patient', CHEN);
  const edited = structuredClone(DEFAULT_CONSULTATIONS[0]);
  edited.clinicalSummary = 'EDITED SUMMARY';
  assert.equal((await t.call('PUT', `/api/consultations/${edited.id}`, { consultation: edited }, ph)).status, 200);
  let seen = await t.call('GET', '/api/me/consultation', undefined, pt);
  assert.notEqual(seen.json.consultation.clinicalSummary, 'EDITED SUMMARY');

  assert.equal((await t.call('POST', `/api/consultations/${edited.id}/approve`, {}, ph)).status, 400, 'attestation required');
  const ok = await t.call('POST', `/api/consultations/${edited.id}/approve`, { attestChecked: true }, ph);
  // Aspirin/atorvastatin/lisinopril/metoprolol resolve in the fake; any unresolved name would block (next test)
  assert.equal(ok.status, 200, ok.text);
  seen = await t.call('GET', '/api/me/consultation', undefined, pt);
  assert.equal(seen.json.consultation.clinicalSummary, 'EDITED SUMMARY');
  assert.equal(seen.json.consultation.approval.by, 'Test Pharmacist');
});

test('a medication RxNorm cannot identify blocks approval', async () => {
  const ph = await t.login('pharmacist');
  const bad = structuredClone(DEFAULT_CONSULTATIONS[2]);
  bad.medications[0] = { ...bad.medications[0], medicationName: 'Zzyzx', genericName: 'Zzyzx' };
  await t.call('PUT', `/api/consultations/${bad.id}`, { consultation: bad }, ph);
  const r = await t.call('POST', `/api/consultations/${bad.id}/approve`, { attestChecked: true }, ph);
  assert.equal(r.status, 422);
  assert.deepEqual(r.json.unresolved, ['Zzyzx']);
});

test('client cannot forge the approval field or move a consultation to another patient', async () => {
  const ph = await t.login('pharmacist');
  const c: any = structuredClone(DEFAULT_CONSULTATIONS[1]);
  c.approval = { by: 'Someone Else', at: 'x' };
  await t.call('PUT', `/api/consultations/${c.id}`, { consultation: c }, ph);
  const list = await t.call('GET', '/api/consultations', undefined, ph);
  const item = list.json.items.find((i: any) => i.consultation.id === c.id);
  assert.equal(item.consultation.approval, undefined);
  c.patientId = CHEN;
  assert.equal((await t.call('PUT', `/api/consultations/${c.id}`, { consultation: c }, ph)).status, 409);
});

test('invalid consultation bodies are rejected', async () => {
  const ph = await t.login('pharmacist');
  assert.equal((await t.call('PUT', '/api/consultations/x', { consultation: { id: 'x' } }, ph)).status, 400);
});

test('every approval and login is written to the audit log', () => {
  const rows = t.deps.db.prepare("SELECT action FROM audit_log").all().map((r: any) => r.action);
  assert.ok(rows.includes('login') && rows.includes('consultation.approve') && rows.includes('login.failed'));
});
