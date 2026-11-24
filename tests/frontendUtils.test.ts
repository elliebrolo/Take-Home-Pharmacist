import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanServerUrl, parseAccessInput, takeAccessCodeFromUrl, apiUrl, apiBase, setServerUrl, usesBearer, clientKind, setToken, getToken, rememberSession, forgetSession } from '../src/utils/api.ts';
import { planReminders, msUntilNext, parseTime, REMINDER_TITLE, REMINDER_BODY } from '../src/utils/reminders.ts';
import { DEFAULT_CONSULTATIONS } from '../src/data/defaultConsultations.ts';

/** A minimal browser: enough for the helpers that touch window. */
function fakeWindow(opts: { native?: boolean; hash?: string } = {}) {
  const store = new Map<string, string>();
  const replaced: string[] = [];
  (globalThis as any).window = {
    Capacitor: opts.native ? { isNativePlatform: () => true } : undefined,
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    location: { hash: opts.hash ?? '', pathname: '/', search: '' },
    history: { replaceState: (_a: unknown, _b: string, url: string) => void replaced.push(url) },
  };
  return { store, replaced };
}

describe('server address', () => {
  test('only https is accepted, plus plain http for local development servers', () => {
    assert.equal(cleanServerUrl('https://svc-abc.a.run.app/'), 'https://svc-abc.a.run.app');
    assert.equal(cleanServerUrl('https://x.example/path?q=1'), 'https://x.example');
    assert.equal(cleanServerUrl('http://localhost:3000'), 'http://localhost:3000');
    assert.equal(cleanServerUrl('http://192.168.1.20:3000'), 'http://192.168.1.20:3000');
    for (const bad of ['http://evil.example', 'ftp://x.example', 'javascript:alert(1)', 'not a url', '', 'capacitor://localhost']) assert.equal(cleanServerUrl(bad), null, bad);
  });
  test('web build: no base, relative paths unchanged, cookies (no bearer)', () => {
    fakeWindow();
    assert.equal(apiBase(), '');
    assert.equal(apiUrl('/api/auth/me'), '/api/auth/me');
    assert.equal(usesBearer(), false);
    assert.equal(clientKind(), undefined);
    setToken('abc');
    assert.equal(getToken(), null, 'a web page never sends a bearer token');
  });
  test('native app: a saved server address is used, with a bearer token', () => {
    fakeWindow({ native: true });
    assert.equal(apiBase(), '');
    assert.equal(setServerUrl('https://svc.example.run.app/'), true);
    assert.equal(apiBase(), 'https://svc.example.run.app');
    assert.equal(apiUrl('/api/auth/me'), 'https://svc.example.run.app/api/auth/me');
    assert.equal(apiUrl('https://dailymed.nlm.nih.gov/x.jpg'), 'https://dailymed.nlm.nih.gov/x.jpg');
    assert.equal(usesBearer(), true);
    assert.equal(clientKind(), 'native');
    assert.equal(setServerUrl('http://evil.example'), false);
    assert.equal(apiBase(), 'https://svc.example.run.app', 'a rejected address changes nothing');
    assert.equal(setServerUrl(''), true);
    assert.equal(apiBase(), '');
  });
  test('the token is kept after sign-in and forgotten on sign-out', () => {
    fakeWindow({ native: true });
    rememberSession({ token: 'tok-1' });
    assert.equal(getToken(), 'tok-1');
    rememberSession({});
    assert.equal(getToken(), null, 'a sign-in without a token clears the old one');
    rememberSession({ token: 'tok-2' });
    forgetSession();
    assert.equal(getToken(), null);
  });
});

describe('access codes in links', () => {
  const CODE = '7ZD3-4KWZ-HR8T-KZER-RM9K';
  test('"#access=CODE" is read and removed from the address bar', () => {
    const w = fakeWindow({ hash: `#access=${CODE}` });
    assert.equal(takeAccessCodeFromUrl(), CODE);
    assert.deepEqual(w.replaced, ['/'], 'the code does not stay in the address bar or history');
  });
  test('no code, or something that is not a code, is ignored and the address is left alone', () => {
    for (const hash of ['', '#', '#other=1', '#access=short', '#access=<script>alert(1)</script>']) {
      const w = fakeWindow({ hash });
      assert.equal(takeAccessCodeFromUrl(), null, hash);
      assert.deepEqual(w.replaced, []);
    }
  });
  test('people paste links, codes with spaces, or lowercase', () => {
    assert.equal(parseAccessInput(`https://app.example.com/#access=${CODE}`), CODE.replace(/-/g, ''));
    assert.equal(parseAccessInput(CODE.toLowerCase()), CODE.replace(/-/g, '').toLowerCase());
    assert.equal(parseAccessInput('7ZD3 4KWZ HR8T KZER RM9K'), CODE.replace(/-/g, ''));
    for (const bad of ['', 'hello', '7ZD3-4KWZ', 'https://app.example.com/']) assert.equal(parseAccessInput(bad), null, bad);
  });
});

describe('reminders', () => {
  const med = (name: string, targetTime: string, timeOfDay: any[]) => ({ medicationName: name, targetTime, timeOfDay });
  test('one reminder per distinct usual time, earliest first, with stable ids', () => {
    const { slots, skipped } = planReminders([med('A', '20:00', ['evening']), med('B', '08:00', ['morning']), med('C', '08:00', ['morning'])]);
    assert.deepEqual(slots.map((s) => s.time), ['08:00', '20:00']);
    assert.deepEqual(skipped, []);
    assert.equal(slots[0].id, planReminders([med('Z', '08:00', ['morning'])]).slots[0].id);
    assert.notEqual(slots[0].id, slots[1].id);
  });
  test('a medicine taken more than once a day, or with no usable time, gets no reminder and is named', () => {
    const { slots, skipped } = planReminders([med('Twice', '08:00', ['morning', 'evening']), med('NoTime', '', ['morning']), med('Bad', '25:99', ['morning']), med('Ok', '09:30', ['morning'])]);
    assert.deepEqual(slots.map((s) => s.time), ['09:30']);
    assert.deepEqual(skipped, ['Twice', 'NoTime', 'Bad']);
  });
  test('the demo patients: Miller (twice a day) is not given a guessed second reminder', () => {
    const miller = DEFAULT_CONSULTATIONS.find((c) => c.patientId === 'PT-7193')!;
    const { slots, skipped } = planReminders(miller.medications);
    assert.equal(slots.length, 0);
    assert.equal(skipped.length, 1);
    const chen = planReminders(DEFAULT_CONSULTATIONS.find((c) => c.patientId === 'PT-8821')!.medications);
    assert.deepEqual(chen.slots.map((s) => s.time), ['08:00', '20:00']);
  });
  test('parseTime', () => {
    assert.deepEqual(parseTime('08:05'), { hour: 8, minute: 5 });
    assert.deepEqual(parseTime('8:05'), { hour: 8, minute: 5 });
    for (const bad of ['24:00', '12:60', '8', 'noon', '', undefined]) assert.equal(parseTime(bad as any), null, String(bad));
  });
  test('msUntilNext: later today, or tomorrow when the time has passed, never zero', () => {
    const now = new Date(2026, 10, 24, 9, 0, 0, 0);
    assert.equal(msUntilNext({ hour: 20, minute: 0 }, now), 11 * 3600_000);
    assert.equal(msUntilNext({ hour: 8, minute: 0 }, now), 23 * 3600_000);
    assert.equal(msUntilNext({ hour: 9, minute: 0 }, now), 24 * 3600_000, 'exactly now means tomorrow, not an instant loop');
  });
  test('notification text is generic: it never names a medicine', () => {
    for (const c of DEFAULT_CONSULTATIONS) for (const m of c.medications) {
      const first = m.medicationName.split(/\s+/)[0].toLowerCase();
      assert.ok(!`${REMINDER_TITLE} ${REMINDER_BODY}`.toLowerCase().includes(first));
    }
  });
});

describe('Capacitor plugin proxies', () => {
  test('saving the session in the native app causes no unhandled rejection', async () => {
    fakeWindow({ native: true });
    const errors: unknown[] = [];
    const on = (e: unknown) => errors.push(e);
    process.on('unhandledRejection', on);
    try {
      setToken('tok-x');
      setServerUrl('https://svc.example.run.app');
      forgetSession();
      await new Promise((r) => setTimeout(r, 100));
    } finally {
      process.off('unhandledRejection', on);
    }
    assert.deepEqual(errors.map(String), []);
  });
  test('no helper returns or awaits a plugin object (a Proxy: .then() throws "not implemented")', async () => {
    const fs = await import('node:fs');
    for (const f of ['src/utils/api.ts', 'src/utils/reminders.ts']) {
      const code = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
      assert.ok(!/return\s*\(?await import\('@capacitor\/[\w-]+'\)\)?\.\w+;/.test(code), `${f} returns a plugin`);
      assert.ok(!/await\s+(native|prefs)\(\)/.test(code), `${f} awaits a plugin helper`);
    }
  });
});
