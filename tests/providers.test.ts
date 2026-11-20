import { test, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createLlm } from '../server/chat/llm.ts';
import { createOpenAiLlm, DEFAULT_OPENAI_MODEL } from '../server/chat/openai.ts';
import { startTestServer, knowledgeWithLabels, ROUTINE, idOf } from './helpers.ts';

const KEYS = { GEMINI_API_KEY: 'g-test', OPENAI_API_KEY: 'o-test' };
const env = (e: Record<string, string>) => e as NodeJS.ProcessEnv;

describe('provider selection', () => {
  test('no keys: no model', () => {
    const r = createLlm(env({}));
    assert.equal(r.llm, null);
    assert.match(r.note, /no GEMINI_API_KEY or OPENAI_API_KEY/);
  });
  test('the placeholder values in .env.example do not count as keys', () => {
    assert.equal(createLlm(env({ GEMINI_API_KEY: 'MY_GEMINI_API_KEY', OPENAI_API_KEY: 'MY_OPENAI_API_KEY' })).llm, null);
  });
  test('only one key set: that provider is used', () => {
    assert.match(createLlm(env({ OPENAI_API_KEY: 'o' })).note, /^openai \/ gpt-5\.4-mini$/);
    assert.match(createLlm(env({ GEMINI_API_KEY: 'g' })).note, /^gemini \//);
  });
  test('both keys and no LLM_PROVIDER: Gemini (the original provider)', () => {
    assert.match(createLlm(env(KEYS)).note, /^gemini \//);
  });
  test('LLM_PROVIDER picks explicitly, and models come from the env', () => {
    assert.equal(createLlm(env({ ...KEYS, LLM_PROVIDER: 'openai', OPENAI_MODEL: 'my-model' })).note, 'openai / my-model');
    assert.equal(createLlm(env({ ...KEYS, LLM_PROVIDER: 'GEMINI', GEMINI_MODEL: 'g-model' })).note, 'gemini / g-model');
  });
  test('a chosen provider without its key, or an unknown provider, gives no model (never a silent switch)', () => {
    const a = createLlm(env({ GEMINI_API_KEY: 'g', LLM_PROVIDER: 'openai' }));
    assert.equal(a.llm, null);
    assert.match(a.note, /OPENAI_API_KEY is not set/);
    assert.equal(createLlm(env({ ...KEYS, LLM_PROVIDER: 'claude' })).llm, null);
  });
  test('default OpenAI model is gpt-5.4-mini', () => assert.equal(DEFAULT_OPENAI_MODEL, 'gpt-5.4-mini'));
});

/** A fake OpenAI endpoint: records requests and answers from `reply`. */
function fakeOpenAi(reply: (system: string, user: string, body: any) => string | { status: number; body?: string }) {
  const requests: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
  const fetchImpl = (async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    requests.push({ url, headers: init.headers, body });
    const out = reply(body.messages[0].content, body.messages[1].content, body);
    if (typeof out !== 'string') return new Response(out.body ?? '', { status: out.status });
    return new Response(JSON.stringify({ choices: [{ message: { content: out } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}

describe('OpenAI adapter', () => {
  test('sends model, key, JSON mode, and no temperature', async () => {
    const f = fakeOpenAi(() => '{"ok":true}');
    const llm = createOpenAiLlm(env({ OPENAI_API_KEY: 'o-test' }), f.fetchImpl)!;
    assert.equal(await llm.generateJson({ system: 'S', user: 'U', timeoutMs: 1000 }), '{"ok":true}');
    const r = f.requests[0];
    assert.equal(r.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(r.headers.Authorization, 'Bearer o-test');
    assert.equal(r.body.model, 'gpt-5.4-mini');
    assert.deepEqual(r.body.response_format, { type: 'json_object' });
    assert.equal('temperature' in r.body, false);
    assert.match(r.body.messages[0].content, /^S/);
    assert.equal(r.body.messages[1].content, 'U');
  });
  test('passes a schema as json_schema and honours OPENAI_BASE_URL', async () => {
    const f = fakeOpenAi(() => '{}');
    const llm = createOpenAiLlm(env({ OPENAI_API_KEY: 'o', OPENAI_BASE_URL: 'http://localhost:9/v1/' }), f.fetchImpl)!;
    await llm.generateJson({ system: 'S', user: 'U', timeoutMs: 1000, schema: { type: 'object' } });
    assert.equal(f.requests[0].url, 'http://localhost:9/v1/chat/completions');
    assert.equal(f.requests[0].body.response_format.type, 'json_schema');
    assert.deepEqual(f.requests[0].body.response_format.json_schema.schema, { type: 'object' });
  });
  test('HTTP errors throw without echoing the response body', async () => {
    const f = fakeOpenAi(() => ({ status: 401, body: 'secret patient text sk-123' }));
    const llm = createOpenAiLlm(env({ OPENAI_API_KEY: 'o' }), f.fetchImpl)!;
    await assert.rejects(llm.generateJson({ system: 'S', user: 'U', timeoutMs: 1000 }), (e: Error) => /HTTP 401/.test(e.message) && !/secret|sk-123/.test(e.message));
  });
  test('a refusal is an error', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ choices: [{ message: { content: null, refusal: 'no' } }] }))) as unknown as typeof fetch;
    const llm = createOpenAiLlm(env({ OPENAI_API_KEY: 'o' }), fetchImpl)!;
    await assert.rejects(llm.generateJson({ system: 'S', user: 'U', timeoutMs: 1000 }), /refused/);
  });
});

// The same pipeline (triage, retrieval, validation, review queue) must run unchanged on the OpenAI adapter.
describe('full pipeline on the OpenAI adapter', () => {
  let mode: 'good' | 'bad' = 'good';
  const f = fakeOpenAi((system, user) => {
    if (system.startsWith('You triage')) return JSON.stringify(ROUTINE());
    if (mode === 'bad') return JSON.stringify({ can_answer: true, blocks: [{ text: 'Take 80 mg of rosuvastatin instead.', sources: [idOf(user, /Your schedule for Atorvastatin/)] }] });
    return JSON.stringify({ can_answer: true, blocks: [{ text: 'Your schedule says to take 1 tablet once daily in the evening.', sources: [idOf(user, /Your schedule for Atorvastatin/)] }] });
  });
  let t: Awaited<ReturnType<typeof startTestServer>>;
  test('setup', async () => {
    t = await startTestServer({ llm: createOpenAiLlm(env({ OPENAI_API_KEY: 'o' }), f.fetchImpl), knowledge: knowledgeWithLabels() });
  });
  after(() => t?.close());
  const ask = async (m: string) => t.call('POST', '/api/patient-chat', { message: m }, await t.login('patient', 'PT-8821'));
  const reviewItems = () => t.deps.db.prepare('SELECT * FROM review_items ORDER BY id').all() as any[];

  test('a grounded, cited answer is returned', async () => {
    const r = await ask('When do I take atorvastatin?');
    assert.equal(r.json.kind, 'answer');
    assert.match(r.json.text, /once daily in the evening/);
    assert.ok(r.json.citations.length > 0);
  });
  test('an answer naming a drug that is not in its sources is rejected and queued', async () => {
    mode = 'bad';
    const r = await ask('Should I change my statin?');
    assert.notEqual(r.json.kind, 'answer');
    assert.doesNotMatch(r.json.text, /rosuvastatin/);
    assert.ok(reviewItems().some((i) => i.reason === 'validation_failed'));
    mode = 'good';
  });
  test('emergency wording gets the fixed text and does not depend on the answer step', async () => {
    const r = await ask('I have chest pain and can\'t breathe');
    assert.equal(r.json.level, 'emergency');
    assert.match(r.json.text, /911/);
    assert.ok(reviewItems().some((i) => i.reason === 'emergency'));
  });
  test('provider outage is treated as urgent: fixed text and a queued item', async () => {
    const down = fakeOpenAi(() => ({ status: 500 }));
    const t2 = await startTestServer({ llm: createOpenAiLlm(env({ OPENAI_API_KEY: 'o' }), down.fetchImpl), knowledge: knowledgeWithLabels() });
    try {
      const r = await t2.call('POST', '/api/patient-chat', { message: 'What is my schedule?' }, await t2.login('patient', 'PT-8821'));
      // The triage step fails first, and a failed triage is treated as urgent by design.
      assert.equal(r.json.kind, 'urgent');
      assert.ok((t2.deps.db.prepare('SELECT * FROM review_items').all() as any[]).length > 0);
    } finally { t2.close(); }
  });
});

describe('transcript processing uses the configured provider', () => {
  const plan = { patientName: 'X', clinicalSummary: 'S', medications: [{ id: 'm1', medicationName: 'Atorvastatin' }], generalDietaryWarnings: [], emergencyTriggers: [] };
  test('OpenAI: returns a draft and sends the schema', async () => {
    const f = fakeOpenAi(() => JSON.stringify(plan));
    const t = await startTestServer({ llm: createOpenAiLlm(env({ OPENAI_API_KEY: 'o' }), f.fetchImpl) });
    try {
      const r = await t.call('POST', '/api/parse-transcript', { transcript: 'Take one atorvastatin at night.' }, await t.login('pharmacist'));
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.draft, true);
      assert.equal(r.json.data.medications[0].medicationName, 'Atorvastatin');
      assert.equal(f.requests[0].body.response_format.type, 'json_schema');
      assert.match(f.requests[0].body.messages[0].content, /Use ONLY what the transcript says/);
    } finally { t.close(); }
  });
  test('bad output gives a 502 and no data; no model gives a 503; patients are refused', async () => {
    const f = fakeOpenAi(() => 'not json');
    const t = await startTestServer({ llm: createOpenAiLlm(env({ OPENAI_API_KEY: 'o' }), f.fetchImpl) });
    const none = await startTestServer({ llm: null });
    try {
      const body = { transcript: 'hello' };
      assert.equal((await t.call('POST', '/api/parse-transcript', body, await t.login('pharmacist'))).status, 502);
      assert.equal((await none.call('POST', '/api/parse-transcript', body, await none.login('pharmacist'))).status, 503);
      assert.equal((await t.call('POST', '/api/parse-transcript', body, await t.login('patient', 'PT-8821'))).status, 403);
    } finally { t.close(); none.close(); }
  });
});
