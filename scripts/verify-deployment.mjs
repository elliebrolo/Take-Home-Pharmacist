#!/usr/bin/env node
/**
 * Checks a running deployment end to end, using fictional demo patients only.
 *
 *   THP_PASSCODE=...  node scripts/verify-deployment.mjs --url https://your-service.run.app
 *
 * Options
 *   --url URL          the service address (https required unless --allow-http)
 *   --allow-http       permit http://localhost style addresses (local testing)
 *   --api-only         skip the checks of the web page itself (when only the API is served)
 *   --patient ID       demo patient to use (default: the first one in the pharmacist's list)
 * Environment
 *   THP_PASSCODE         the pharmacist passcode (required). Never pass it on the command line.
 *   THP_IDENTITY_TOKEN   only for a PRIVATE Cloud Run service: `gcloud auth print-identity-token`.
 *                        Sent as X-Serverless-Authorization so the app's own bearer token is not disturbed.
 *
 * It needs no packages (Node 18+). It creates one access code and sends one emergency-phrase chat message for the
 * demo patient, then closes the review items it created. Exit code 0 only if every check passes.
 */
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(name);

const base = (opt('--url') || '').replace(/\/+$/, '');
const passcode = process.env.THP_PASSCODE || '';
const idToken = process.env.THP_IDENTITY_TOKEN || '';
if (!base || !passcode) {
  console.error('Usage: THP_PASSCODE=... node scripts/verify-deployment.mjs --url https://your-service.run.app [--api-only] [--allow-http]');
  process.exit(2);
}
if (!base.startsWith('https://') && !(flag('--allow-http') && /^http:\/\/(localhost|127\.0\.0\.1)/.test(base))) {
  console.error('The address must start with https:// (use --allow-http only for localhost).');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `\n        ${detail}` : ''}`); return ok; };
const section = (t) => console.log(`\n${t}`);

async function call(method, path, { body, token, headers = {} } = {}) {
  const h = { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (idToken) h['X-Serverless-Authorization'] = `Bearer ${idToken}`;
  const res = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, headers: res.headers, text, json };
}

try {
  section('Service');
  const hz = await call('GET', '/healthz');
  check('GET /healthz is 200 {"status":"ok"}', hz.status === 200 && hz.json?.status === 'ok', `${hz.status} ${hz.text.slice(0, 100)}`);
  const rz = await call('GET', '/readyz');
  check('GET /readyz is 200 (database readable)', rz.status === 200 && rz.json?.status === 'ready', `${rz.status} ${rz.text.slice(0, 100)}`);
  check('health responses are not cacheable', hz.headers.get('cache-control') === 'no-store');
  const nf = await call('GET', '/api/does-not-exist');
  check('unknown API path answers JSON 404, not the web page', nf.status === 404 && nf.json?.error, `${nf.status} ${nf.text.slice(0, 80)}`);

  section('Security headers');
  const me = await call('GET', '/api/auth/me');
  check('HSTS is set (production)', /max-age=\d{6,}/.test(me.headers.get('strict-transport-security') || ''));
  check('Content-Security-Policy allows only our own scripts', /script-src 'self'(;|$)/.test(me.headers.get('content-security-policy') || ''));
  check('nosniff, frame and referrer headers are set', me.headers.get('x-content-type-options') === 'nosniff' && me.headers.get('x-frame-options') === 'DENY' && me.headers.get('referrer-policy') === 'no-referrer');
  check('API responses are not cacheable', me.headers.get('cache-control') === 'no-store');
  check('anonymous visitors have no session', me.json && me.json.session === null);
  if (!flag('--api-only')) {
    const page = await call('GET', '/');
    check('home page is served with the app root', page.status === 200 && page.text.includes('<div id="root">'), `${page.status}`);
    check('home page must be revalidated (no-cache)', /no-cache/.test(page.headers.get('cache-control') || ''));
    const asset = /\/assets\/[^"']+\.js/.exec(page.text)?.[0];
    if (asset) {
      const a = await call('GET', asset);
      check('built script is served and cached long-term', a.status === 200 && /immutable/.test(a.headers.get('cache-control') || ''), `${a.status} ${a.headers.get('cache-control')}`);
    } else check('built script is referenced by the page', false, 'no /assets/*.js found');
  }

  section('Access control (anonymous)');
  for (const [m, p] of [['GET', '/api/consultations'], ['GET', '/api/me/consultation'], ['GET', '/api/review-items'], ['POST', '/api/patient-chat'], ['POST', '/api/patients/PT-8821/access-links'], ['GET', '/api/chat/messages']]) {
    const r = await call(m, p, m === 'POST' ? { body: {} } : {});
    check(`${m} ${p} requires sign-in (401)`, r.status === 401, `got ${r.status}`);
  }

  section('Pharmacist workflow');
  const bad = await call('POST', '/api/auth/login', { body: { role: 'pharmacist', passcode: 'definitely-not-it', name: 'verify' } });
  check('wrong passcode is refused (401)', bad.status === 401, `got ${bad.status}`);
  const login = await call('POST', '/api/auth/login', { body: { role: 'pharmacist', passcode, name: 'Deployment check', client: 'native' } });
  if (!check('correct passcode signs the pharmacist in', login.status === 200 && login.json?.token, `got ${login.status} ${login.text.slice(0, 120)}`)) throw new Error('cannot continue without a pharmacist session');
  const ph = login.json.token;
  const list = await call('GET', '/api/consultations', { token: ph });
  check('pharmacist sees the consultation records', list.status === 200 && Array.isArray(list.json?.items) && list.json.items.length > 0, `got ${list.status} ${list.text.slice(0, 100)}`);
  const approved = (list.json?.items || []).filter((i) => i.approval);
  const wanted = opt('--patient');
  const target = wanted ? approved.find((i) => i.consultation.patientId === wanted) : approved[0];
  if (!check('there is an approved plan to test with', !!target, 'no approved plan found (is DEMO_MODE=true?)')) throw new Error('no approved plan');
  const patientId = target.consultation.patientId;
  const queue = await call('GET', '/api/review-items', { token: ph });
  check('pharmacist can open the review queue', queue.status === 200 && Array.isArray(queue.json?.items), `got ${queue.status}`);

  section('QR / access code');
  const made = await call('POST', `/api/patients/${patientId}/access-links`, { body: { hours: 1 }, token: ph });
  check('pharmacist creates a one-hour access code', made.status === 201 && /^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/.test(made.json?.code || ''), `got ${made.status} ${made.text.slice(0, 100)}`);
  check('the access link points at this service and keeps the code in the #fragment', (made.json?.url || '').startsWith(`${base}/#access=`) || (made.json?.url || '').includes('/#access='), made.json?.url);
  const listed = await call('GET', `/api/patients/${patientId}/access-links`, { token: ph });
  check('the code itself is never listed again', listed.status === 200 && !JSON.stringify(listed.json).includes(made.json?.code || 'x'));

  section('Patient workflow');
  const redeem = await call('POST', '/api/auth/redeem', { body: { code: (made.json?.code || '').toLowerCase(), client: 'native' } });
  if (!check('patient signs in with the code', redeem.status === 200 && redeem.json?.token && redeem.json.session?.role === 'patient' && redeem.json.session.sub === patientId, `got ${redeem.status} ${redeem.text.slice(0, 100)}`)) throw new Error('patient sign-in failed');
  const pt = redeem.json.token;
  const again = await call('POST', '/api/auth/redeem', { body: { code: made.json.code } });
  check('the same code cannot be used twice', again.status === 401, `got ${again.status}`);
  const plan = await call('GET', '/api/me/consultation', { token: pt });
  check('patient loads their own plan', plan.status === 200 && plan.json?.consultation?.patientId === patientId && plan.json.consultation.medications?.length > 0, `got ${plan.status}`);
  check('the raw transcript is not sent to the patient', plan.json?.consultation && !('rawTranscript' in plan.json.consultation));
  const cross = await call('GET', '/api/consultations', { token: pt });
  check('a patient cannot open pharmacist data (403)', cross.status === 403, `got ${cross.status}`);
  const cross2 = await call('GET', '/api/review-items', { token: pt });
  check('a patient cannot open the review queue (403)', cross2.status === 403, `got ${cross2.status}`);

  section('Safety behaviour');
  const emergency = await call('POST', '/api/patient-chat', { body: { message: 'I have chest pain' }, token: pt });
  check('an emergency phrase gets the fixed emergency text (level emergency, mentions 911)', emergency.status === 200 && emergency.json?.level === 'emergency' && emergency.json?.kind === 'emergency' && /911/.test(emergency.json?.text || ''), `got ${emergency.status} ${emergency.text.slice(0, 160)}`);
  check('the emergency reply carries emergency numbers, not a model-written answer', Array.isArray(emergency.json?.triage?.hotlines) && emergency.json.triage.hotlines.some((h) => h.phone === '911'));
  const negated = await call('POST', '/api/patient-chat', { body: { message: 'I have no appetite and chest pain' }, token: pt });
  check('negation in another clause does not hide chest pain', negated.json?.level === 'emergency', `level ${negated.json?.level}`);
  const routine = await call('POST', '/api/patient-chat', { body: { message: 'When should I take my medicines?' }, token: pt });
  check('an ordinary question gets a safe reply (answer, or an honest "cannot answer" with the pharmacy number)', routine.status === 200 && ['answer', 'fallback', 'refused'].includes(routine.json?.kind) && (routine.json?.kind === 'answer' ? routine.json.citations?.length > 0 : /call|pharmacist/i.test(routine.json?.text || '')), `got ${routine.status} ${routine.text.slice(0, 160)}`);
  const stop = await call('POST', '/api/patient-chat', { body: { message: 'Should I stop taking my pills?' }, token: pt });
  check('"should I stop" is sent to the pharmacist, not answered', stop.json?.level === 'needs_pharmacist' && stop.json?.kind === 'forwarded', `got ${stop.json?.level}/${stop.json?.kind}`);

  section('Review queue sees the escalations');
  const q2 = await call('GET', '/api/review-items', { token: ph });
  const mine = (q2.json?.items || []).filter((i) => ['I have chest pain', 'I have no appetite and chest pain', 'Should I stop taking my pills?'].includes(i.question));
  check('the emergency and the "should I stop" question are in the pharmacist queue', mine.some((i) => i.reason === 'emergency') && mine.some((i) => i.reason === 'needs_pharmacist'), `found ${mine.map((i) => i.reason).join(',')}`);
  for (const i of mine) await call('POST', `/api/review-items/${i.id}/resolve`, { body: {}, token: ph });
  const chat = await call('GET', '/api/chat/messages', { token: pt });
  check('the patient chat history is stored on the server', chat.status === 200 && chat.json?.messages?.length >= 4, `got ${chat.status}`);

  section('Cleanup');
  const links = await call('GET', `/api/patients/${patientId}/access-links`, { token: ph });
  for (const l of (links.json?.links || []).filter((l) => l.status === 'active')) await call('DELETE', `/api/access-links/${l.id}`, { token: ph });
  check('no unused access code is left behind', true);
} catch (e) {
  check(`stopped early: ${e.message}`, false);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.${failed.length ? ` FAILED: ${failed.map((f) => f.name).join('; ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
