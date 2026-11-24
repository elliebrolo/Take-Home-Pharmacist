import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.ts';
import { createLink, listLinks, newCode, normalizeCode, redeem, revokeLink, statusOf, clampHours, MAX_HOURS } from '../server/core/accessLinks.ts';
import { openDb } from '../server/core/db.ts';

const CHEN = 'PT-8821';

describe('codes', () => {
  test('are 20 characters of an unambiguous alphabet, grouped for reading aloud, and different every time', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const c = newCode();
      assert.match(c, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
      assert.ok(!/[ILOU]/.test(c));
      seen.add(c);
    }
    assert.equal(seen.size, 500);
  });
  test('typed codes are forgiven: case, spaces, dashes and look-alike letters', () => {
    const c = newCode();
    assert.equal(normalizeCode(c.toLowerCase()), normalizeCode(c));
    assert.equal(normalizeCode(c.replace(/-/g, ' ')), normalizeCode(c));
    assert.equal(normalizeCode('0000-0000-0000-0000-0000'), normalizeCode('OOOO-OOOO-OOOO-OOOO-OOOO'));
    assert.equal(normalizeCode('1111-1111-1111-1111-1111'), normalizeCode('IIII-LLLL-1111-iiii-llll'));
    for (const bad of ['', 'abc', 123, null, undefined, 'U'.repeat(20), 'A'.repeat(19), 'A'.repeat(21)]) assert.equal(normalizeCode(bad), null, String(bad));
  });
  test('hours are clamped to 1 hour .. 7 days', () => {
    assert.equal(clampHours(0), 1);
    assert.equal(clampHours(99999), MAX_HOURS);
    assert.equal(clampHours('junk'), 72);
    assert.equal(clampHours(5.4), 5);
  });
});

describe('link lifecycle (database level)', () => {
  test('single use, expiry and revocation', () => {
    const db = openDb(':memory:');
    const t0 = Date.parse('2026-11-24T12:00:00Z');
    const a = createLink(db, CHEN, 'Pat', 24, t0);
    assert.equal(redeem(db, a.code, t0 + 1000)?.patientId, CHEN);
    assert.equal(redeem(db, a.code, t0 + 2000), null, 'second use is refused');
    const b = createLink(db, CHEN, 'Pat', 1, t0);
    assert.equal(redeem(db, b.code, t0 + 3_600_001), null, 'expired');
    const c = createLink(db, CHEN, 'Pat', 24, t0);
    assert.equal(revokeLink(db, c.id, t0 + 1), true);
    assert.equal(revokeLink(db, c.id, t0 + 2), false, 'already revoked');
    assert.equal(redeem(db, c.code, t0 + 3), null, 'revoked');
    assert.equal(revokeLink(db, a.id), false, 'a used link cannot be revoked');
    assert.deepEqual(listLinks(db, CHEN, t0 + 3_600_001).map((l) => l.status), ['revoked', 'expired', 'used']);
    assert.equal(redeem(db, 'not a code'), null);
    assert.equal(redeem(db, newCode()), null, 'unknown code');
  });
  test('only a hash is stored; the code itself is never in the database', () => {
    const db = openDb(':memory:');
    const a = createLink(db, CHEN, 'Pat', 24);
    const dump = JSON.stringify(db.prepare('SELECT * FROM access_links').all());
    assert.ok(!dump.includes(normalizeCode(a.code)!) && !dump.includes(a.code));
    assert.match((db.prepare('SELECT token_hash FROM access_links').get() as any).token_hash, /^[0-9a-f]{64}$/);
  });
  test('two racing redemptions: exactly one wins', () => {
    const db = openDb(':memory:');
    const a = createLink(db, CHEN, 'Pat', 24);
    const results = [redeem(db, a.code), redeem(db, a.code), redeem(db, a.code)];
    assert.equal(results.filter(Boolean).length, 1);
  });
  test('statusOf', () => {
    const base = { used_at: null, revoked_at: null, expires_at: '2026-01-02T00:00:00Z' };
    const now = Date.parse('2026-01-01T00:00:00Z');
    assert.equal(statusOf(base, now), 'active');
    assert.equal(statusOf(base, Date.parse('2026-01-02T00:00:00Z')), 'expired');
    assert.equal(statusOf({ ...base, used_at: 'x' }, now), 'used');
    assert.equal(statusOf({ ...base, used_at: 'x', revoked_at: 'y' }, now), 'revoked');
  });
});

describe('routes', () => {
  test('only a signed-in pharmacist can issue, list or revoke links', async () => {
    const t = await startTestServer();
    try {
      const patient = await t.login('patient', CHEN);
      for (const [m, p] of [['POST', `/api/patients/${CHEN}/access-links`], ['GET', `/api/patients/${CHEN}/access-links`], ['DELETE', '/api/access-links/1']] as const) {
        assert.equal((await t.call(m, p)).status, 401, `${m} ${p} anonymous`);
        assert.equal((await t.call(m, p, undefined, patient)).status, 403, `${m} ${p} as patient`);
      }
    } finally { t.close(); }
  });

  test('issue → redeem signs in exactly that patient; the code works once', async () => {
    const t = await startTestServer({ env: { PUBLIC_BASE_URL: 'https://pharmacy.example/' } });
    try {
      const ph = await t.login('pharmacist');
      const made = await t.call('POST', `/api/patients/${CHEN}/access-links`, { hours: 6 }, ph);
      assert.equal(made.status, 201);
      assert.match(made.json.url, /^https:\/\/pharmacy\.example\/#access=[0-9A-Z-]{24}$/);
      assert.equal(made.json.url.split('#access=')[1], made.json.code);
      const hours = (Date.parse(made.json.expiresAt) - Date.now()) / 3_600_000;
      assert.ok(hours > 5.9 && hours <= 6.01);

      const r = await t.call('POST', '/api/auth/redeem', { code: made.json.code.toLowerCase() });
      assert.equal(r.status, 200);
      assert.deepEqual(r.json.session, { role: 'patient', sub: CHEN });
      assert.equal(r.json.token, undefined);
      const me = await t.call('GET', '/api/me/consultation', undefined, r.cookie);
      assert.equal(me.json.consultation.patientId, CHEN);
      assert.equal((await t.call('GET', '/api/chat/messages', undefined, r.cookie)).status, 200);
      assert.equal((await t.call('GET', '/api/consultations', undefined, r.cookie)).status, 403, 'a patient session is still only a patient');

      const again = await t.call('POST', '/api/auth/redeem', { code: made.json.code });
      assert.equal(again.status, 401);
      assert.match(again.json.error, /invalid or has expired/);
    } finally { t.close(); }
  });

  test('the code is not in the list, a second issue gives a different code, and the audit log never holds a code', async () => {
    const t = await startTestServer();
    try {
      const ph = await t.login('pharmacist');
      const a = await t.call('POST', `/api/patients/${CHEN}/access-links`, {}, ph);
      const b = await t.call('POST', `/api/patients/${CHEN}/access-links`, {}, ph);
      assert.notEqual(a.json.code, b.json.code);
      const list = await t.call('GET', `/api/patients/${CHEN}/access-links`, undefined, ph);
      assert.equal(list.json.links.length, 2);
      assert.ok(!JSON.stringify(list.json).includes(a.json.code));
      await t.call('POST', '/api/auth/redeem', { code: a.json.code });
      const audit = JSON.stringify(t.deps.db.prepare('SELECT * FROM audit_log').all());
      assert.ok(!audit.includes(a.json.code) && !audit.includes(b.json.code));
      assert.match(audit, /access\.create/);
      assert.match(audit, /access\.redeem/);
    } finally { t.close(); }
  });

  test('revoking stops a link from working', async () => {
    const t = await startTestServer();
    try {
      const ph = await t.login('pharmacist');
      const a = await t.call('POST', `/api/patients/${CHEN}/access-links`, {}, ph);
      assert.equal((await t.call('DELETE', `/api/access-links/${a.json.id}`, undefined, ph)).status, 200);
      assert.equal((await t.call('POST', '/api/auth/redeem', { code: a.json.code })).status, 401);
      assert.equal((await t.call('DELETE', `/api/access-links/${a.json.id}`, undefined, ph)).status, 404);
      assert.equal((await t.call('DELETE', '/api/access-links/abc', undefined, ph)).status, 404);
    } finally { t.close(); }
  });

  test('a patient without an approved plan cannot be given a link; garbage codes get the same generic answer', async () => {
    const t = await startTestServer();
    try {
      const ph = await t.login('pharmacist');
      assert.equal((await t.call('POST', '/api/patients/PT-0000/access-links', {}, ph)).status, 404);
      const msgs = new Set<string>();
      for (const code of ['', 'nope', newCode(), 12345, null]) msgs.add(JSON.stringify((await t.call('POST', '/api/auth/redeem', { code })).json));
      assert.equal(msgs.size, 1, 'the error does not reveal why');
    } finally { t.close(); }
  });

  test('a link for a patient whose plan has been removed signs nobody in', async () => {
    const t = await startTestServer();
    try {
      const ph = await t.login('pharmacist');
      const a = await t.call('POST', `/api/patients/${CHEN}/access-links`, {}, ph);
      t.deps.db.prepare("DELETE FROM consultations WHERE patient_id=?").run(CHEN);
      assert.equal((await t.call('POST', '/api/auth/redeem', { code: a.json.code })).status, 401);
    } finally { t.close(); }
  });

  test('the native app gets a bearer token from a redeemed link', async () => {
    const t = await startTestServer();
    try {
      const ph = await t.login('pharmacist');
      const a = await t.call('POST', `/api/patients/${CHEN}/access-links`, {}, ph);
      const r = await t.call('POST', '/api/auth/redeem', { code: a.json.code, client: 'native' });
      const me = await t.call('GET', '/api/auth/me', undefined, undefined, { Authorization: `Bearer ${r.json.token}` });
      assert.deepEqual(me.json.session, { role: 'patient', sub: CHEN });
    } finally { t.close(); }
  });

  test('redeeming is rate limited, so guessing codes is not practical', async () => {
    const t = await startTestServer();
    try {
      let last = 0;
      for (let i = 0; i < 14; i++) last = (await t.call('POST', '/api/auth/redeem', { code: newCode() })).status;
      assert.equal(last, 429);
    } finally { t.close(); }
  });

  test('the link uses the request address when PUBLIC_BASE_URL is not set', async () => {
    const t = await startTestServer();
    try {
      const ph = await t.login('pharmacist');
      const a = await t.call('POST', `/api/patients/${CHEN}/access-links`, {}, ph);
      assert.match(a.json.url, /^http:\/\/127\.0\.0\.1:\d+\/#access=/);
    } finally { t.close(); }
  });
});
