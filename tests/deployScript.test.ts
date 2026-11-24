import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Runs deploy/deploy-staging.sh against a stand-in `gcloud` that only records what it was asked to do. Nothing here
 * touches Google Cloud. It checks the order of steps, that the service is never made public, that secrets never
 * appear in command arguments, and the filled-in service definition.
 */
function run(env: Record<string, string> = {}, input = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thp-deploy-'));
  const log = path.join(dir, 'gcloud.log');
  const stdinLog = path.join(dir, 'stdin.log');
  const yaml = path.join(dir, 'rendered.yaml');
  fs.writeFileSync(path.join(dir, 'gcloud'), `#!/bin/bash
echo "$*" >> "${log}"
case "$*" in *"--data-file=-"*) cat >> "${stdinLog}";; esac
case "$*" in
  "billing projects describe"*) echo "\${BILLING:-True}"; exit 0;;
  "projects describe"*) echo 123456789; exit 0;;
  "run services describe"*) echo "https://take-home-pharmacist-123456789.us-central1.run.app"; exit 0;;
  *"secrets describe"*) [ -n "\${SECRETS_EXIST:-}" ] && exit 0 || exit 1;;
  *describe*) exit 1;;
esac
exit 0
`);
  fs.chmodSync(path.join(dir, 'gcloud'), 0o755);
  const r = spawnSync('bash', [path.resolve('deploy/deploy-staging.sh')], {
    env: { PATH: `${dir}:${process.env.PATH}`, PROJECT_ID: 'demo-proj', ASSUME_YES: '1', SKIP_VERIFY: '1', TAG: 'abc1234', RENDERED_YAML_OUT: yaml, ...env },
    input, encoding: 'utf8',
  });
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [];
  return { ...r, calls, yaml: fs.existsSync(yaml) ? fs.readFileSync(yaml, 'utf8') : '', stdinSeen: fs.existsSync(stdinLog) ? fs.readFileSync(stdinLog, 'utf8') : '' };
}
const idx = (calls: string[], re: RegExp) => calls.findIndex((c) => re.test(c));

test('default run: every step happens, in a safe order, and the service stays private', () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  const order = [/^billing projects describe/, /^services enable/, /^storage buckets create gs:\/\/demo-proj-thp-db/, /^storage buckets create gs:\/\/demo-proj-thp-uploads/, /^iam service-accounts create take-home-pharmacist/, /^secrets add-iam-policy-binding thp-session-secret/, /^artifacts repositories create/, /^builds submit --tag us-central1-docker\.pkg\.dev\/demo-proj\/take-home-pharmacist\/app:abc1234/, /^run services replace/];
  const at = order.map((re) => idx(r.calls, re));
  assert.ok(at.every((i) => i >= 0), `missing step: ${JSON.stringify(at)}\n${r.calls.join('\n')}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'steps run in dependency order');
  assert.ok(!r.calls.join('\n').includes('allUsers'), 'it must never grant public access');
  assert.ok(!r.calls.some((c) => /run services (add|update)-iam|set-iam-policy/.test(c)), 'it does not touch who may invoke the service');
  assert.match(r.stdout, /PRIVATE/);
  assert.match(r.stdout, /allUsers/, 'the public command is only printed for the user to decide');
});

test('buckets are private and the database copy is versioned; the service account gets only those buckets', () => {
  const r = run();
  const buckets = r.calls.filter((c) => c.startsWith('storage buckets create'));
  assert.equal(buckets.length, 2);
  for (const b of buckets) assert.match(b, /--uniform-bucket-level-access --public-access-prevention/);
  assert.ok(r.calls.some((c) => /^storage buckets update gs:\/\/demo-proj-thp-db --versioning/.test(c)));
  const grants = r.calls.filter((c) => c.startsWith('storage buckets add-iam-policy-binding'));
  assert.deepEqual(grants.map((g) => g.split(' ')[3]).sort(), ['gs://demo-proj-thp-db', 'gs://demo-proj-thp-uploads']);
});

test('the filled-in service definition has no placeholders, and no model block when no model is configured', () => {
  const r = run();
  assert.doesNotMatch(r.yaml.replace(/^\s*#.*$/gm, ''), /PLACEHOLDER|PROJECT_ID|DB_BUCKET|UPLOADS_BUCKET|SERVICE_URL_WITHOUT|SET_A_MODEL|REGION-|:TAG\b/);
  assert.match(r.yaml, /image: us-central1-docker\.pkg\.dev\/demo-proj\/take-home-pharmacist\/app:abc1234/);
  assert.match(r.yaml, /serviceAccountName: take-home-pharmacist@demo-proj\.iam\.gserviceaccount\.com/);
  assert.match(r.yaml, /PUBLIC_BASE_URL, value: "https:\/\/take-home-pharmacist-123456789\.us-central1\.run\.app"/);
  assert.match(r.yaml, /LITESTREAM_REPLICA_URL, value: "gcs:\/\/demo-proj-thp-db\/take-home-pharmacist"/);
  assert.match(r.yaml, /bucketName: demo-proj-thp-uploads/);
  assert.match(r.yaml, /minScale: "1"/);
  assert.match(r.yaml, /cpu-throttling: "false"/);
  assert.doesNotMatch(r.yaml, /GEMINI|LLM_PROVIDER|thp-gemini-api-key/);
  assert.ok(!r.calls.some((c) => /thp-gemini-api-key/.test(c)), 'no model key secret is created');
  assert.match(r.yaml, /SESSION_SECRET[\s\S]*thp-session-secret/);
  assert.match(r.yaml, /PHARMACIST_PASSCODE[\s\S]*thp-pharmacist-passcode/);
  assert.match(r.yaml, /NODE_ENV, value: production/);
  assert.match(r.yaml, /DEMO_MODE, value: "true"/);
});

test('with GEMINI_MODEL the key is read from input, stored only via stdin, and never appears in a command', () => {
  const r = run({ GEMINI_MODEL: 'gemini-test-model' }, 'super-secret-key-value\n');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.calls.some((c) => /^secrets create thp-gemini-api-key --data-file=-/.test(c)));
  assert.match(r.stdinSeen, /super-secret-key-value/, 'the key reached gcloud through stdin');
  assert.ok(!r.calls.join('\n').includes('super-secret-key-value'), 'never in an argument');
  assert.ok(!(r.stdout + r.stderr).includes('super-secret-key-value'), 'never printed');
  assert.match(r.yaml, /GEMINI_MODEL, value: "gemini-test-model"/);
  assert.match(r.yaml, /GEMINI_API_KEY/);
});

test('generated secrets never appear in a command, and existing secrets are kept, not replaced', () => {
  const fresh = run();
  const creates = fresh.calls.filter((c) => c.startsWith('secrets create'));
  assert.equal(creates.length, 2);
  for (const c of creates) assert.match(c, /^secrets create thp-[a-z-]+ --data-file=-$/);
  assert.ok(fresh.stdinSeen.length > 40, 'a generated value went through stdin');
  const kept = run({ SECRETS_EXIST: '1' });
  assert.equal(kept.status, 0, kept.stderr);
  assert.equal(kept.calls.filter((c) => c.startsWith('secrets create')).length, 0, 're-running must not change a secret');
  assert.match(kept.stdout, /already exists \(kept\)/);
});

test('MIN_INSTANCES=0 switches to scale-to-zero with CPU throttling', () => {
  const r = run({ MIN_INSTANCES: '0' });
  assert.match(r.yaml, /minScale: "0"/);
  assert.match(r.yaml, /cpu-throttling: "true"/);
  assert.equal(run({ MIN_INSTANCES: '3' }).status, 2, 'SQLite allows one instance');
});

test('stops before creating anything if billing is off, or if you decline', () => {
  const noBilling = run({ BILLING: 'False' });
  assert.equal(noBilling.status, 1);
  assert.match(noBilling.stderr, /Billing is not enabled/);
  assert.ok(!noBilling.calls.some((c) => /create|submit|replace|services enable/.test(c)), 'nothing was created');
  const declined = run({ ASSUME_YES: '' }, 'n\n');
  assert.equal(declined.status, 1);
  assert.deepEqual(declined.calls, [], 'no gcloud call at all');
  assert.match(declined.stdout, /Stopped/);
});

test('PROJECT_ID is required', () => {
  const r = run({ PROJECT_ID: '' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Set PROJECT_ID/);
});
