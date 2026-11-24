import type { AddressInfo } from 'node:net';
import { openDb } from '../server/core/db.ts';
import { createApp } from '../server/app.ts';
import type { Deps, Knowledge, LabelPassage, Llm } from '../server/core/deps.ts';
import { loadAuthConfig } from '../server/core/auth.ts';
import { registerTranscriptRoute } from '../server/routes/transcript.ts';
import { DEFAULT_CONSULTATIONS } from '../src/data/defaultConsultations.ts';

export const fakeKnowledge = (over: Partial<Knowledge> = {}): Knowledge => ({
  resolveRxcui: async (n) => ({ atorvastatin: '83367', lisinopril: '29046', metoprolol: '6918', aspirin: '1191' } as Record<string, string>)[n.toLowerCase().split(' ')[0]] ?? null,
  ensureLabel: async () => true,
  passagesFor: () => [],
  ...over,
});

/** Passages shaped like DailyMed label text. Test fixtures: wording is invented, not real label text. */
export const FIXTURE_PASSAGES: Record<string, LabelPassage[]> = {
  '83367': [
    { id: 'set-a#34073-7#1', rxcui: '83367', drug: 'Atorvastatin', section: 'Drug interactions', url: 'https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=set-a', setId: 'set-a', effective: '2026-01-01',
      text: 'Grapefruit juice: Excessive amounts of grapefruit juice (over 1.2 liters daily) can raise atorvastatin levels and the risk of muscle problems.' },
    { id: 'set-a#34076-0#1', rxcui: '83367', drug: 'Atorvastatin', section: 'Information for patients', url: 'https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=set-a', setId: 'set-a', effective: '2026-01-01',
      text: 'Advise patients to report unexplained muscle pain, tenderness or weakness promptly to their healthcare provider.' },
  ],
};

export const knowledgeWithLabels = () =>
  fakeKnowledge({ passagesFor: (ids) => ids.flatMap((i) => FIXTURE_PASSAGES[i] ?? []) });

/** A scripted model: routes by system prompt, records every call. */
export function scriptedLlm(handlers: { triage?: (user: string) => unknown; answer?: (user: string) => unknown }) {
  const calls: Array<{ kind: 'triage' | 'answer'; user: string }> = [];
  const llm: Llm = {
    async generateJson({ system, user }) {
      const kind = system.startsWith('You triage') ? 'triage' : 'answer';
      calls.push({ kind, user });
      const h = handlers[kind];
      if (!h) throw new Error('no handler');
      const out = h(user);
      return typeof out === 'string' ? out : JSON.stringify(out);
    },
  };
  return { llm, calls };
}
export const ROUTINE = () => ({ level: 'routine', confidence: 0.95, reason: 'general question' });
/** Find the id the prompt assigned to a source, e.g. id(user, /Your schedule for Atorvastatin/) -> "R2" */
export const idOf = (user: string, re: RegExp) => new RegExp(`\\[([RL]\\d+)\\] \\(${re.source}`).exec(user)![1];

export async function startTestServer(over: { llm?: Llm | null; knowledge?: Knowledge; auditRate?: number; env?: Record<string, string> } = {}) {
  const auth = loadAuthConfig({ SESSION_SECRET: 'test-secret', PHARMACIST_PASSCODE: 'pw-test', PATIENT_CODES: 'PT-9410:santos-code', ...over.env } as any);
  const deps: Deps = {
    db: openDb(':memory:'),
    auth,
    knowledge: over.knowledge ?? fakeKnowledge(),
    llm: over.llm === undefined ? null : over.llm,
    auditRate: over.auditRate ?? 0,
    random: () => 0.99,
  };
  const { app, store } = createApp(deps);
  store.seedApproved(DEFAULT_CONSULTATIONS);
  registerTranscriptRoute(app, deps);
  const server = await new Promise<import('node:http').Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function call(method: string, path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, headers: res.headers, json, text, cookie: res.headers.get('set-cookie')?.split(';')[0] };
  }
  const sessions = new Map<string, string>(); // the login limiter is real, so reuse sessions
  async function login(role: 'patient' | 'pharmacist', patientId?: string, extra: object = {}) {
    const key = `${role}:${patientId ?? ''}`;
    if (sessions.has(key)) return sessions.get(key)!;
    const r = await call('POST', '/api/auth/login', role === 'pharmacist' ? { role, passcode: 'pw-test', name: 'Test Pharmacist' } : { role, patientId, ...extra });
    sessions.set(key, r.cookie!);
    return r.cookie!;
  }
  return { app, deps, store, call, login, close: () => server.close() };
}
