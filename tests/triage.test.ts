import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, keywordTriage } from '../server/chat/triage.ts';
import type { Llm } from '../server/core/deps.ts';

const run = (message: string, llm: Llm | null = null) => classify({ message, history: [], regimenSummary: 'Atorvastatin 40 mg', llm });
const llmReturning = (obj: unknown): Llm => ({ generateJson: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });
const llmFailing = (msg: string): Llm => ({ generateJson: async () => { throw new Error(msg); } });

const EMERGENCIES = [
  'I have chest pain', 'my chest pain is getting worse', "I can't breathe", 'cant breathe properly', 'throat closing up', 'I think I overdosed',
  'I took too many pills', 'I want to die', 'thinking about suicide', 'she passed out', 'I am coughing blood', 'shortnes of breath since this morning',
  'Tengo dolor en el pecho', 'no puedo respirar', "j'ai une douleur thoracique", '我胸痛', 'my face is swelling and lips swollen',
];
for (const m of EMERGENCIES) {
  test(`emergency (keyword net, no model): ${m}`, async () => assert.equal((await run(m)).level, 'emergency'));
}

const NEGATED = ['I have no chest pain', 'no chest pain at all, just a question about timing', 'never had trouble breathing', 'without any rash'];
for (const m of NEGATED) {
  test(`negated mention is not treated as a symptom: ${m}`, async () => {
    const r = await run(m);
    assert.ok(['routine', 'needs_pharmacist'].includes(r.level), `got ${r.level}`);
    assert.notEqual(r.level, 'emergency');
  });
}

test('urgent and pharmacist-only phrases are recognised', async () => {
  assert.equal((await run('my urine is dark and I have severe muscle pain')).level, 'urgent');
  assert.equal((await run('I took a double dose this morning')).level, 'urgent');
  assert.equal((await run('should I stop taking my statin')).level, 'needs_pharmacist');
});

test('benign question with no model is routine', async () => assert.equal((await run('When should I take my pill?')).level, 'routine'));

test('text the keyword list cannot read is not cleared as routine without a model', async () => {
  assert.equal((await run('我应该什么时候吃药')).level, 'needs_pharmacist');
});

test('the model can raise the level', async () => {
  const r = await run('my arm feels strange and I feel sweaty', llmReturning({ level: 'emergency', confidence: 0.9, reason: 'possible cardiac event' }));
  assert.equal(r.level, 'emergency');
});

test('the model can never lower a keyword emergency', async () => {
  const r = await run('I have chest pain', llmReturning({ level: 'routine', confidence: 0.99, reason: 'seems fine' }));
  assert.equal(r.level, 'emergency');
});

test('failures of the model default to urgent: timeout, API error, bad JSON, wrong shape', async () => {
  for (const llm of [llmFailing('model timeout'), llmFailing('503'), llmReturning('not json'), llmReturning({ level: 'fine' }), llmReturning({ level: 'routine' })]) {
    const r = await run('When should I take my pill?', llm);
    assert.equal(r.level, 'urgent');
    assert.ok(r.signals.some((s) => s.source === 'default' || s.level === 'urgent'));
  }
});

test('low-confidence "routine" from the model is treated as urgent', async () => {
  assert.equal((await run('hmm not sure', llmReturning({ level: 'routine', confidence: 0.5, reason: 'unclear' }))).level, 'urgent');
});

test('confident routine from the model with no keyword hits stays routine', async () => {
  assert.equal((await run('What does my pill do?', llmReturning({ level: 'routine', confidence: 0.95, reason: 'general question' }))).level, 'routine');
});

test('keyword signals record what matched', () => {
  const s = keywordTriage('I have chest pain and a rash');
  assert.deepEqual(s.map((x) => x.detail).sort(), ['chest pain', 'rash']);
});
