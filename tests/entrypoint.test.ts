import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Runs deploy/entrypoint.sh with a stand-in `litestream` that records how it was called. */
function run(env: Record<string, string>, opts: { restoreFails?: boolean } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thp-entry-'));
  const log = path.join(dir, 'calls.log');
  const stub = path.join(dir, 'litestream');
  fs.writeFileSync(stub, `#!/bin/sh\necho "litestream $*" >> "${log}"\n${opts.restoreFails ? 'if [ "$1" = restore ]; then exit 3; fi\n' : ''}`);
  fs.chmodSync(stub, 0o755);
  const r = spawnSync('sh', [path.resolve('deploy/entrypoint.sh')], {
    env: { PATH: `${dir}:${process.env.PATH}`, DATA_DIR: path.join(dir, 'data'), APP_CMD: 'echo APP_STARTED', ...env },
    encoding: 'utf8',
  });
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [];
  return { ...r, calls, dir };
}

test('production without a replica URL refuses to start (records would be lost on every restart)', () => {
  const r = run({ NODE_ENV: 'production' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing to start/);
  assert.ok(!r.stdout.includes('APP_STARTED'));
  assert.deepEqual(r.calls, []);
});

test('ALLOW_EPHEMERAL_DB=true lets a throwaway demo start, with a warning, and no replication', () => {
  const r = run({ NODE_ENV: 'production', ALLOW_EPHEMERAL_DB: 'true' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /NOT durable/);
  assert.match(r.stdout, /APP_STARTED/);
  assert.deepEqual(r.calls, []);
});

test('development without a replica URL just starts the app', () => {
  const r = run({});
  assert.equal(r.status, 0);
  assert.match(r.stdout, /APP_STARTED/);
});

test('with a replica URL: restore first, then replicate while running the app', () => {
  const r = run({ NODE_ENV: 'production', LITESTREAM_REPLICA_URL: 'gcs://bucket/path' });
  const db = path.join(r.dir, 'data', 'app.db');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.calls, [
    `litestream restore -if-db-not-exists -if-replica-exists -o ${db} gcs://bucket/path`,
    `litestream replicate -exec echo APP_STARTED ${db} gcs://bucket/path`,
  ]);
  assert.ok(fs.existsSync(path.join(r.dir, 'data')), 'the data directory is created');
});

test('if restoring an existing copy fails, the app does NOT start with an empty database', () => {
  const r = run({ NODE_ENV: 'production', LITESTREAM_REPLICA_URL: 'gcs://bucket/path' }, { restoreFails: true });
  assert.equal(r.status, 3);
  assert.deepEqual(r.calls.map((c) => c.split(' ')[1]), ['restore'], 'replicate was never reached');
  assert.ok(!r.stdout.includes('APP_STARTED'));
});
