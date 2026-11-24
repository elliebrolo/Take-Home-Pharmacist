import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.ts';
import { loadAuthConfig } from '../server/core/auth.ts';
import { CSP, trustProxyHops } from '../server/core/http.ts';
import { dataPaths } from '../server/core/paths.ts';

const STRONG = { SESSION_SECRET: 's'.repeat(40), PHARMACIST_PASSCODE: 'correct-horse-battery', NODE_ENV: 'production' };

describe('configuration', () => {
  test('production refuses missing or weak secrets', () => {
    assert.throws(() => loadAuthConfig({ NODE_ENV: 'production' } as any), /must be set/);
    assert.throws(() => loadAuthConfig({ ...STRONG, SESSION_SECRET: 'short' } as any), /at least 32/);
    assert.throws(() => loadAuthConfig({ ...STRONG, PHARMACIST_PASSCODE: '1234' } as any), /at least 12/);
    assert.doesNotThrow(() => loadAuthConfig(STRONG as any));
  });
  test('production turns demo patients off unless DEMO_MODE=true; development turns them on', () => {
    assert.equal(loadAuthConfig(STRONG as any).demoMode, false);
    assert.equal(loadAuthConfig({ ...STRONG, DEMO_MODE: 'true' } as any).demoMode, true);
    assert.equal(loadAuthConfig({} as any).demoMode, true);
    assert.equal(loadAuthConfig({ DEMO_MODE: 'false' } as any).demoMode, false);
  });
  test('PUBLIC_BASE_URL must be a plain origin', () => {
    assert.equal(loadAuthConfig({ PUBLIC_BASE_URL: 'https://app.example.com/' } as any).publicBaseUrl, 'https://app.example.com');
    assert.equal(loadAuthConfig({} as any).publicBaseUrl, '');
    for (const bad of ['app.example.com', 'https://app.example.com/path', 'javascript:alert(1)']) assert.throws(() => loadAuthConfig({ PUBLIC_BASE_URL: bad } as any), /origin/, bad);
  });
  test('CORS_ORIGINS must be exact origins', () => {
    assert.throws(() => loadAuthConfig({ CORS_ORIGINS: '*' } as any), /exact origins/);
    assert.deepEqual(loadAuthConfig({ CORS_ORIGINS: 'capacitor://localhost, https://a.example' } as any).corsOrigins, ['capacitor://localhost', 'https://a.example']);
  });
  test('patient session length is configurable and capped at 30 days', () => {
    assert.equal(loadAuthConfig({} as any).patientSessionMs, 24 * 3600_000);
    assert.equal(loadAuthConfig({ PATIENT_SESSION_HOURS: '2' } as any).patientSessionMs, 2 * 3600_000);
    assert.equal(loadAuthConfig({ PATIENT_SESSION_HOURS: '99999' } as any).patientSessionMs, 720 * 3600_000);
    assert.equal(loadAuthConfig({ PATIENT_SESSION_HOURS: 'junk' } as any).patientSessionMs, 24 * 3600_000);
  });
  test('trust proxy: one hop in production, none otherwise, bad values fall back', () => {
    assert.equal(trustProxyHops({}, true), 1);
    assert.equal(trustProxyHops({}, false), 0);
    assert.equal(trustProxyHops({ TRUST_PROXY: '2' }, true), 2);
    assert.equal(trustProxyHops({ TRUST_PROXY: 'true' }, true), 1);
  });
  test('data paths follow DATA_DIR, DB_FILE and UPLOAD_DIR', () => {
    const d = dataPaths({}, '/app');
    assert.deepEqual([d.dataDir, d.dbFile, d.uploadDir], ['/app/data', '/app/data/app.db', '/app/data/uploads']);
    const e = dataPaths({ DATA_DIR: '/mnt/data' }, '/app');
    assert.deepEqual([e.dbFile, e.uploadDir, e.nlmDir], ['/mnt/data/app.db', '/mnt/data/uploads', '/mnt/data/nlm']);
    assert.equal(dataPaths({ DATA_DIR: '/mnt/d', DB_FILE: '/db/x.db', UPLOAD_DIR: '/up' }, '/app').dbFile, '/db/x.db');
  });
});

describe('health checks', () => {
  test('/healthz and /readyz answer without signing in, say nothing about configuration, and are not cached', async () => {
    const t = await startTestServer();
    try {
      for (const path of ['/healthz', '/readyz']) {
        const r = await t.call('GET', path);
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('cache-control'), 'no-store');
        assert.deepEqual(Object.keys(r.json), ['status']);
      }
    } finally { t.close(); }
  });
  test('/readyz reports 503 when the database cannot be read', async () => {
    const t = await startTestServer();
    try {
      t.deps.db.close();
      const r = await t.call('GET', '/readyz');
      assert.equal(r.status, 503);
      assert.equal((await t.call('GET', '/healthz')).status, 200, 'liveness does not depend on the database');
    } finally { t.close(); }
  });
});

describe('production headers', () => {
  test('production sends HSTS and a CSP that only allows our own scripts', async () => {
    const t = await startTestServer({ env: { ...STRONG, DEMO_MODE: 'true' } });
    try {
      const r = await t.call('GET', '/api/auth/me');
      assert.match(r.headers.get('strict-transport-security')!, /max-age=\d+/);
      assert.equal(r.headers.get('content-security-policy'), CSP);
      assert.match(CSP, /script-src 'self'(;|$)/);
      assert.ok(!/unsafe-eval|script-src[^;]*unsafe-inline/.test(CSP));
      assert.match(CSP, /frame-ancestors 'none'/);
    } finally { t.close(); }
  });
  test('development does not send HSTS or CSP (the Vite dev server needs inline scripts)', async () => {
    const t = await startTestServer();
    try {
      const r = await t.call('GET', '/api/auth/me');
      assert.equal(r.headers.get('strict-transport-security'), null);
      assert.equal(r.headers.get('content-security-policy'), null);
    } finally { t.close(); }
  });
});

describe('demo patient list', () => {
  test('is hidden when demo mode is off, so a real deployment never publishes who is registered', async () => {
    const t = await startTestServer({ env: { DEMO_MODE: 'false' } });
    try {
      const r = await t.call('GET', '/api/auth/patients');
      assert.deepEqual(r.json, { patients: [], demoMode: false });
    } finally { t.close(); }
  });
  test('is shown in demo mode, and in production demo mode still requires a code', async () => {
    const t = await startTestServer({ env: { ...STRONG, DEMO_MODE: 'true' } });
    try {
      const r = await t.call('GET', '/api/auth/patients');
      assert.equal(r.json.patients.length, 3);
      assert.ok(r.json.patients.every((p: any) => p.needsCode));
      assert.equal((await t.call('POST', '/api/auth/login', { role: 'patient', patientId: 'PT-8821' })).status, 401);
    } finally { t.close(); }
  });
});

describe('native app: bearer tokens and CORS', () => {
  const ORIGIN = 'capacitor://localhost';
  test('the token is returned only to a native client, and works as a bearer credential without a cookie', async () => {
    const t = await startTestServer();
    try {
      const web = await t.call('POST', '/api/auth/login', { role: 'patient', patientId: 'PT-8821' });
      assert.equal(web.status, 200);
      assert.equal(web.json.token, undefined, 'a web client must not receive the token in the body');
      const native = await t.call('POST', '/api/auth/login', { role: 'patient', patientId: 'PT-8821', client: 'native' });
      assert.match(native.json.token, /^[\w-]+\.[\w-]+$/);
      const me = await t.call('GET', '/api/auth/me', undefined, undefined, { Authorization: `Bearer ${native.json.token}` });
      assert.deepEqual(me.json.session, { role: 'patient', sub: 'PT-8821' });
      const consult = await t.call('GET', '/api/me/consultation', undefined, undefined, { Authorization: `Bearer ${native.json.token}` });
      assert.equal(consult.status, 200);
      assert.equal(consult.json.consultation.rawTranscript, undefined);
    } finally { t.close(); }
  });
  test('a forged, edited or malformed bearer token is not a session', async () => {
    const t = await startTestServer();
    try {
      const native = await t.call('POST', '/api/auth/login', { role: 'patient', patientId: 'PT-8821', client: 'native' });
      const [payload, mac] = native.json.token.split('.');
      const forged = Buffer.from(JSON.stringify({ role: 'pharmacist', sub: 'x', exp: Date.now() + 1e6 })).toString('base64url');
      for (const bad of [`${forged}.${mac}`, `${payload}.AAAA`, 'garbage', `${payload}`]) {
        const me = await t.call('GET', '/api/auth/me', undefined, undefined, { Authorization: `Bearer ${bad}` });
        assert.equal(me.json.session, null, bad);
      }
      const noScheme = await t.call('GET', '/api/auth/me', undefined, undefined, { Authorization: native.json.token });
      assert.equal(noScheme.json.session, null);
    } finally { t.close(); }
  });
  test('patient session lifetime follows PATIENT_SESSION_HOURS; pharmacists keep 8 hours', async () => {
    const t = await startTestServer({ env: { PATIENT_SESSION_HOURS: '2' } });
    try {
      const p = await t.call('POST', '/api/auth/login', { role: 'patient', patientId: 'PT-8821' });
      const ph = await t.call('POST', '/api/auth/login', { role: 'pharmacist', passcode: 'pw-test', name: 'T' });
      const cookieMaxAge = (r: { headers: Headers }) => Number(/Max-Age=(\d+)/.exec(r.headers.get('set-cookie')!)![1]);
      assert.equal(cookieMaxAge(p), 2 * 3600);
      assert.equal(cookieMaxAge(ph), 8 * 3600);
    } finally { t.close(); }
  });
  test('CORS: only listed origins are answered, preflight works, credentials are never allowed', async () => {
    const t = await startTestServer({ env: { CORS_ORIGINS: ORIGIN } });
    try {
      const ok = await t.call('GET', '/api/auth/me', undefined, undefined, { Origin: ORIGIN });
      assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
      assert.equal(ok.headers.get('access-control-allow-credentials'), null);
      assert.match(ok.headers.get('vary')!, /Origin/);
      const pre = await t.call('OPTIONS', '/api/patient-chat', undefined, undefined, { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' });
      assert.equal(pre.status, 204);
      assert.match(pre.headers.get('access-control-allow-headers')!, /Authorization/);
      const other = await t.call('GET', '/api/auth/me', undefined, undefined, { Origin: 'https://evil.example' });
      assert.equal(other.headers.get('access-control-allow-origin'), null);
      assert.equal((await t.call('OPTIONS', '/api/patient-chat', undefined, undefined, { Origin: 'https://evil.example' })).status, 403);
    } finally { t.close(); }
  });
  test('without CORS_ORIGINS no cross-origin access is granted at all', async () => {
    const t = await startTestServer();
    try {
      const r = await t.call('GET', '/api/auth/me', undefined, undefined, { Origin: ORIGIN });
      assert.equal(r.headers.get('access-control-allow-origin'), null);
    } finally { t.close(); }
  });
});
