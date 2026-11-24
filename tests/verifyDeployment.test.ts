import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

/**
 * Boots the REAL server entry (server.ts) in production mode, as the container does, and runs the deployment
 * verification script against it. This proves server.ts starts, production configuration works end to end, and that
 * scripts/verify-deployment.mjs passes when it should and fails when it should.
 */
const PASSCODE = 'correct-horse-battery-staple';
let child: ChildProcess;
let base = '';
let dir = '';
let out = '';

const freePort = () => new Promise<number>((res) => { const s = net.createServer().listen(0, () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thp-verify-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    env: {
      PATH: process.env.PATH!, NODE_ENV: 'production', DEMO_MODE: 'true', PORT: String(port), DATA_DIR: dir, LABEL_REFRESH_HOURS: '0',
      SESSION_SECRET: 'verify-session-secret-verify-session-secret', PHARMACIST_PASSCODE: PASSCODE,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout!.on('data', (d) => (out += d));
  child.stderr!.on('data', (d) => (out += d));
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch { /* not up yet */ }
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not start. Output:\n${out}`);
});

after(() => { if (child.exitCode === null) child.kill('SIGKILL'); fs.rmSync(dir, { recursive: true, force: true }); });

const verify = (env: Record<string, string>, extra: string[] = []) =>
  spawnSync(process.execPath, ['scripts/verify-deployment.mjs', '--url', base, '--allow-http', '--api-only', ...extra], { env: { PATH: process.env.PATH!, ...env }, encoding: 'utf8' });

test('the production server starts from server.ts, uses DATA_DIR, and says what mode it is in', () => {
  assert.match(out, /Mode: production, demo patients on/);
  assert.ok(fs.existsSync(path.join(dir, 'app.db')), 'database was created in DATA_DIR');
});

test('the verification script passes every check against a healthy production server', () => {
  const r = verify({ THP_PASSCODE: PASSCODE });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /(\d+) of \1 checks passed/);
  for (const must of ['emergency phrase gets the fixed emergency text', 'the same code cannot be used twice', 'a patient cannot open pharmacist data', 'negation in another clause does not hide chest pain']) assert.match(r.stdout, new RegExp(`PASS  .*${must}`));
});

test('the script fails (exit 1) with a wrong pharmacist passcode, and refuses to run without one', () => {
  const wrong = verify({ THP_PASSCODE: 'not-the-passcode' });
  assert.equal(wrong.status, 1);
  assert.match(wrong.stdout, /FAIL  correct passcode signs the pharmacist in/);
  assert.equal(verify({}).status, 2);
});

test('the script insists on https unless --allow-http is given for localhost', () => {
  const r = spawnSync(process.execPath, ['scripts/verify-deployment.mjs', '--url', base, '--api-only'], { env: { PATH: process.env.PATH!, THP_PASSCODE: PASSCODE }, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /must start with https/);
  const remote = spawnSync(process.execPath, ['scripts/verify-deployment.mjs', '--url', 'http://example.com', '--allow-http'], { env: { PATH: process.env.PATH!, THP_PASSCODE: PASSCODE }, encoding: 'utf8' });
  assert.equal(remote.status, 2, '--allow-http only covers localhost');
});

test('SIGTERM (what Cloud Run sends) shuts the server down cleanly with exit code 0', async () => {
  const exited = new Promise<number | null>((res) => child.once('exit', (code) => res(code)));
  child.kill('SIGTERM');
  assert.equal(await exited, 0);
  assert.match(out, /SIGTERM received: shutting down/);
});
