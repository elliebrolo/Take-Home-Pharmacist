import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/core/db.ts';
import { createNotifier } from '../server/core/notify.ts';
import { startTestServer } from './helpers.ts';
import { handleChatTurn } from '../server/chat/service.ts';

const flush = () => new Promise((r) => setTimeout(r, 20));

test('notifier is off without a URL, and refuses invalid or non-https URLs', () => {
  const db = openDb(':memory:');
  assert.equal(createNotifier(db, {} as any).notify, null);
  assert.equal(createNotifier(db, { URGENT_WEBHOOK_URL: 'not a url' } as any).notify, null);
  assert.equal(createNotifier(db, { URGENT_WEBHOOK_URL: 'http://hooks.example.com/x' } as any).notify, null);
  assert.match(createNotifier(db, { URGENT_WEBHOOK_URL: 'ftp://x.example.com' } as any).note, /https/);
  assert.ok(createNotifier(db, { URGENT_WEBHOOK_URL: 'https://hooks.example.com/x' } as any).notify);
  assert.ok(createNotifier(db, { URGENT_WEBHOOK_URL: 'http://localhost:9999/x' } as any).notify, 'plain http is allowed only for localhost');
});

test('only emergency and urgent items notify, and the payload holds no patient data', async () => {
  const db = openDb(':memory:');
  const sent: any[] = [];
  const f = (async (url: any, init: any) => { sent.push({ url: String(url), body: JSON.parse(init.body), init }); return new Response('ok'); }) as any;
  const { notify } = createNotifier(db, { URGENT_WEBHOOK_URL: 'https://hooks.example.com/abc' } as any, f);
  notify!({ itemId: 7, reason: 'audit', priority: 5 });
  notify!({ itemId: 8, reason: 'needs_pharmacist', priority: 3 });
  notify!({ itemId: 9, reason: 'emergency', priority: 1 });
  notify!({ itemId: 10, reason: 'urgent', priority: 2 });
  await flush();
  assert.deepEqual(sent.map((s) => s.body.itemId), [9, 10]);
  assert.match(sent[0].body.text, /POSSIBLE EMERGENCY item #9/);
  assert.equal(sent[0].init.redirect, 'error', 'a webhook may not redirect us elsewhere');
});

test('a failing webhook never fails the patient, and is audit-logged', async () => {
  const down = (async () => { throw new Error('connection refused'); }) as any;
  const bad = (async () => new Response('no', { status: 500 })) as any;
  for (const f of [down, bad]) {
    const t = await startTestServer();
    try {
      t.deps.notify = createNotifier(t.deps.db, { URGENT_WEBHOOK_URL: 'https://hooks.example.com/abc' } as any, f).notify;
      const r = await handleChatTurn(t.deps, 'PT-8821', 'I have chest pain');
      assert.equal(r.kind, 'emergency');
      await flush();
      assert.equal((t.deps.db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='notify.failed'").get() as any).n, 1);
    } finally { t.close(); }
  }
});

test('a chat emergency sends one notice with no name, patient id or message text', async () => {
  const t = await startTestServer();
  const sent: string[] = [];
  try {
    t.deps.notify = createNotifier(t.deps.db, { URGENT_WEBHOOK_URL: 'https://hooks.example.com/abc' } as any, (async (_u: any, init: any) => { sent.push(init.body); return new Response('ok'); }) as any).notify;
    await handleChatTurn(t.deps, 'PT-8821', 'I have chest pain and I am Robert Chen');
    await handleChatTurn(t.deps, 'PT-8821', 'When do I take my pill?'); // routine, no model: fallback item, no notice
    await flush();
    assert.equal(sent.length, 1);
    assert.ok(!/Chen|PT-8821|chest pain/i.test(sent[0]), sent[0]);
  } finally { t.close(); }
});
