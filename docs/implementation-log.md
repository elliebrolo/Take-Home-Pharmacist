# Implementation log

Work done autonomously against `docs/chatbot-improvement-plan.md`. Branch: `claude/festive-shannon-52jcx5` (not merged, not deployed).

## Scope and assumptions

- **No separate plan attachment reached the session.** The only plan in the repository is `docs/chatbot-improvement-plan.md`, which already marks phases 0 to 6 as implemented, partly or fully. I treated its "partial" rows and its "Still open" list as the remaining work, and picked only items that need no decision or credential from the project owner.
- There is no `CLAUDE.md` in the repository. Conventions were taken from the existing code and README.
- Everything remains a prototype with fictional demo patients. No credential, patient record or real provider key was used, written or sent anywhere. No real LLM provider was called (tests use scripted fakes).
- Node: the README asks for Node 24; the sandbox has Node 22.23, where `node:sqlite` also works. CI is configured for Node 24.

## What was done

| # | Change | Plan item |
| --- | --- | --- |
| 1 | **Fixed a broken fresh clone.** `.gitignore` had `data/`, which also matched `src/data/`, so `src/data/demoPhotos.ts` was never committed. Type-check and 3 of 4 test files failed on a clean checkout. The rule is now `/data/`. `demoPhotos.ts` is restored as a no-op (see decisions). | Prerequisite |
| 2 | **Triage keyword net hardened** after an adversarial probe found real misses: negation leaking across clauses ("no appetite and chest pain" was *routine*), transposed letters ("chest pian"), and many plain-language phrasings ("my chest hurts", "can't catch my breath", "swallowed a whole bottle", "he collapsed") and languages. Negation is now limited to its own clause; "no X or Y" still covers Y. Phrases added for Spanish, French, German, Portuguese, Italian, Tagalog and Chinese. The net can still only raise a level. | Phase 4 |
| 3 | **Evaluation release gate.** `tests/eval/triage-cases.ts` (56 emergency phrasings, 18 reassurance/educational, 15 escalation cases) and `tests/eval.test.ts` (`npm run eval`): zero missed emergencies with no model, with a model that wrongly says "routine", and with a broken model; end-to-end no emergency gets a model-written answer; per-patient grounding (foreign drug blocked, citations present, no cross-patient leakage); out-of-scope refusal. **GitHub Actions CI** (`.github/workflows/ci.yml`) runs lint, tests, the gate and build. | Phase 6 |
| 4 | **Label change flagging.** The same stored label is re-read, passages are diffed per section, and a change (or a replaced source label) creates one open "Drug label changed" review item per affected patient and drug. Daily job (`LABEL_REFRESH_HOURS`), `POST /api/drug-labels/refresh`, review-queue UI. Approved plans are never altered automatically. | Phase 2 |
| 5 | **Urgent-item notification.** Optional `URGENT_WEBHOOK_URL`; payload has only item number and reason. In-app alert tone for new urgent items. | Phase 5 / "still open" |
| 6 | **Baseline security headers** (`nosniff`, `X-Frame-Options`, `Referrer-Policy`). | Phase 1 (partial) |

Safety safeguards were preserved: patients still see only pharmacist-approved records; model output is still validated before display; the keyword net can only raise a triage level; model failure still means urgent; fixed emergency text is unchanged. The new webhook cannot carry patient data.

## Decisions made (non-blocking)

1. **`withDemoPhoto` is a no-op.** The original file was never committed and its photo file names cannot be recovered (they depended on a local NLM download). Demo medications therefore show the neutral "No photo" placeholder. A wrong pill picture is a patient-safety hazard, so no image is attached unless a pharmacist confirms one. Re-attaching sample photos is a small follow-up if wanted.
2. **Any change to label text is flagged**, not just "important" sections, because telling a safety change from a wording edit needs clinical judgment. This may be noisy; tune after seeing real volume.
3. **Over-triage is preferred to under-triage.** Examples: "chest pain is gone" still triggers the emergency text; a negator before "and"/"but" no longer protects the next symptom.
4. **Plain `http://` webhook allowed only for localhost**, so development can be tested without TLS.
5. **No CSP header yet.** It needs tuning against the Vite dev server and the production build.

## Test results

- `npm run lint`: clean.
- `npm test`: 253 tests, 252 pass, 0 fail, 1 skipped (the live RxNorm/DailyMed test, needs `RUN_LIVE=1` and internet).
- `npm run eval`: 105 tests, all pass.
- `npm run build`: succeeds.
- Baseline before any change: type-check error and 3 failing test files (the missing `demoPhotos` module).

## Not done: needs you or a clinician

These were deferred because they need approval, a decision, an external account or clinical expertise.

1. **Clinical review** of the fixed emergency/urgent/forwarded wording, the keyword lists (especially the non-English phrases), the eval cases, and the demo consultations. The plan's gate is only meaningful once clinicians own the case set.
2. **Real authentication and consent**: choice of identity provider, MFA, per-user pharmacist accounts, patient consent text. The passcode scheme is unchanged.
3. **Encryption at rest and key management** for `data/app.db` and uploads.
4. **Business associate agreement** with the model provider; HIPAA/PHIPA and medical-device review.
5. **Exercise a real provider.** Neither Gemini nor OpenAI has been run from this repo against the live API; model names in `.env.example`/README are unverified. Run the "Testing with a real provider" steps in the README with your own key, then re-run `npm run eval` after any prompt or model change.
6. **Set a webhook** (`URGENT_WEBHOOK_URL`) and decide who is on call; add acknowledgement and escalation.
7. **Canadian product data** (Health Canada DPD beyond DIN checks) and a decision on licensed interaction data (plan "Open decisions" 1) and review timing (2).
8. **Branch and CI**: review the branch, enable the CI workflow in the repository, and merge when satisfied. No pull request was opened.
9. Optional follow-ups: Content-Security-Policy, Express `trust proxy` for the sign-in limiter behind a proxy, UI tests, re-attaching demo photos.

---

# Deployment and iOS preparation (second pass)

Objective: prepare the app for Cloud Run and eventual iOS distribution, using synthetic data only. Branch `claude/festive-shannon-52jcx5` (not merged, not deployed). Based on the plan "Take Home Pharmacist: Tonight's development & deployment roadmap" and the repository's `CLAUDE.md` (merged from `main`). The audit and findings table are in `docs/deployment-readiness-audit.md`; the how-to guides are `docs/deployment.md` and `docs/ios.md`.

## Checklist

### Done in this session

- [x] Verified the existing patient flow in a real browser at phone width (plan, mark taken, chat, emergency text) and the pharmacist flow (sign-in, workspace, review queue).
- [x] **QR / profile access**: pharmacist issues single-use, expiring (1 hour to 7 days), revocable access codes shown as a QR code, link and 20-character code; patient scans or types it. Only a hash is stored; the code rides in the URL fragment; redeeming is rate limited; every step is audit-logged without the code.
- [x] **Reminders made real and honest.** They were not implemented at all, despite the UI promising them (see the audit, finding 14).
- [x] Health endpoints `/healthz` and `/readyz`; `PORT` binding; graceful SIGTERM shutdown; JSON errors for API paths; correct cache headers.
- [x] Storage paths (`DATA_DIR`, `DB_FILE`, `UPLOAD_DIR`) no longer hard-coded.
- [x] Production hardening: secret strength checks, HSTS, Content-Security-Policy (browser-tested), trust proxy, demo patients and the public patient list off unless `DEMO_MODE=true`.
- [x] Reproducible build: removed the unused `esbuild` pin that broke `npm install`; `tsx` moved to dependencies; `package-lock.json` added; Node `>=24` declared; CI uses `npm ci`.
- [x] Container: `Dockerfile` (multi-stage, non-root), `.dockerignore`, entrypoint with Litestream restore/replicate that refuses to run unreplicated in production, `deploy/cloudrun.yaml`, CI job that builds the image and smoke-tests it.
- [x] Native-app readiness: one API client with configurable address (`VITE_API_BASE_URL` or a saved address), bearer-token auth and exact-origin CORS, token kept in Capacitor Preferences, signed-in images fetched with the token, `Notification` support detected.
- [x] Capacitor 8 project generated and synced (`ios/`, `capacitor.config.ts`, `npm run ios:sync`).
- [x] Documentation: README, `.env.example`, `docs/deployment.md`, `docs/ios.md`, `docs/deployment-readiness-audit.md`.
- [x] Clinical safety safeguards unchanged: triage, validation, citation checks, pharmacist approval before patients see anything, and the evaluation gate all pass as before.

### Needs you (deferred: credentials, accounts, Xcode, paid services, approval)

- [ ] **Decide storage.** Litestream is fine for synthetic staging; real data needs a managed database (a code change, not done). See `docs/deployment.md`, "Decisions".
- [ ] Create or choose a Google Cloud project, billing, region; run the steps in `docs/deployment.md` (buckets, service account, secrets, image build, deploy). Nothing was run against Google Cloud.
- [ ] Provide a model key (Gemini or OpenAI) and a model name your key can use; the defaults in this repo are unverified.
- [ ] **Approve going public** (step 9). The service is private until you add the `allUsers` invoker.
- [ ] Check the first CI run of the new `container` job (it builds the image, which could not be done here), and fix anything it reports.
- [ ] On a Mac: choose and set the bundle identifier, create `.env.ios`, run `npm run ios:sync`, open Xcode, sign, run on a simulator and a phone. Check the table in `docs/ios.md`, especially native reminders.
- [ ] Apple: Developer account, Universal Links (so a QR code opens the app), icons and launch screen, TestFlight.
- [ ] Decide: patients-only iOS build (hide the pharmacist tab)? Patient session length vs. single-use codes?
- [ ] Still open from the first pass: real authentication and consent, encryption at rest, agreements and privacy review, clinician review of fixed text, triage lists and the evaluation set, an on-call path for urgent items.

## Decisions made (non-blocking)

1. **Litestream + Cloud Storage for staging persistence**, with the redeploy-overlap caveat stated plainly, rather than rewriting the data layer for Cloud SQL without your decision.
2. **Single-use, hash-stored access codes in the URL fragment**, default 72 hours, patient sessions 24 hours. Chosen over multi-use codes to limit the damage of a lost printout; the cost is that a patient who signs out needs a new code.
3. **Bearer tokens only for clients that ask (`client: "native"`)**; the web app keeps SameSite cookies and never receives the token in the response body.
4. **Reminders never guess times.** A medicine taken more than once a day has one stored time, so it gets no reminder and the patient is told. Notification text is generic because it shows on a locked screen.
5. **npm lockfile added alongside `bun.lock`**, because `CLAUDE.md` names `npm install` as the standard and the Docker/CI builds use `npm ci`. Two lockfiles can drift; run both installs after changing dependencies. **Regenerate `package-lock.json` with npm 11** (the version in Node 24 and the CI/Docker images): `npx npm@11 install --package-lock-only`. A lockfile made by npm 10 lacked platform-specific optional packages that npm 11's `npm ci` requires, and failed CI (run 3).
6. **Production CSP allows `style-src 'unsafe-inline'`** (the UI uses inline styles) and Google Fonts and DailyMed images; scripts are `'self'` only.
7. **Capacitor 8** (current major) rather than 7.

## Verification results (build session)

| Check | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm test` | 307 tests: 306 pass, 0 fail, 1 skipped (live RxNorm/DailyMed, needs `RUN_LIVE=1`) |
| `npm run eval` (release gate) | 105 pass, 0 fail |
| `npm run build` and `npm run build:ios` | succeed; the iOS build contains the baked API address, the plain build does not |
| Clean copy: `npm ci` then lint, tests, build | pass (Node 22.23 here; the project requires 24) |
| Production server from `npm ci --omit=dev` | starts, `/healthz` and `/readyz` OK, SIGTERM shuts down cleanly |
| `npx cap add ios`, `npm run ios:sync` | succeed on Linux; 2 plugins found (local-notifications, preferences) |
| Browser (Playwright, Chromium), dev server | patient flow, QR flow (create, scan, reuse refused, typed code, used-status) pass |
| Browser, production mode with CSP/HSTS | QR flow passes with no CSP violations |
| Browser, simulated native app on a different origin | bearer sign-in with no cookies, token kept across reload, chat over CORS, sign-out discards token, CORS refused for an unlisted origin |

**Not run, and why:** the Docker image build and Litestream (no Docker daemon; GitHub release downloads blocked); anything on Google Cloud (no project or credentials); Xcode, a simulator or a device (no Mac); native reminders and Capacitor plugins against the real iOS bridge; live Gemini/OpenAI calls. The browser checks above are manual scripts and are not part of `npm test` (Playwright is not a project dependency).

## Defects found and fixed along the way

- A fresh clone could not run (missing `demoPhotos.ts`), fixed in the first pass.
- A production start that exited silently after my own edit removed the `startServer()` call; caught by running the production server, fixed.
- Capacitor plugin proxies returned from async helpers would have failed silently on a device; caught by a test, fixed and guarded.
- `PUBLIC_BASE_URL` was read from the process environment at request time, bypassing configuration; caught by a test, fixed.
