# Deployment readiness audit

Audit of the repository for Cloud Run hosting and Capacitor iOS packaging, with what was changed and what remains. Synthetic data only. Written on the development branch after the changes it lists; "was" describes the state before.

## Stack

| Layer | What |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind 4; a single-page app that builds to static files in `dist/` (suitable for Capacitor). |
| Backend | Express 4 on Node 24, TypeScript run through `tsx`. One process serves the API and, in production, `dist/`. |
| Storage | SQLite (`node:sqlite`) for records, chat, review queue, audit log and label cache; files for pharmacist photo uploads and an optional NLM photo set. |
| External services | RxNorm and DailyMed (public), Gemini or OpenAI (optional, key required), Health Canada DPD (DIN checks), optional alert webhook. |
| Commands | `npm ci`, `npm run dev`, `npm run build`, `NODE_ENV=production npm start` (needs `dist/`), `npm test`, `npm run eval`, `npm run lint`. |

## Findings

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| 1 | **No health check.** `/healthz` returned 200 only because the Vite fallback served the home page. | High for Cloud Run | Fixed: real `/healthz` and `/readyz` (database), uncached, no configuration disclosed. |
| 2 | **Port and shutdown.** Listened without an explicit host; no SIGTERM handling, so the database was never closed on a Cloud Run stop. | Medium | Fixed: binds `0.0.0.0:$PORT`; graceful shutdown closes SQLite. |
| 3 | **Storage paths hard-coded** to `./data` (the photo code ignored `DB_FILE`). | High | Fixed: `DATA_DIR`, `DB_FILE`, `UPLOAD_DIR` through one module. |
| 4 | **Container disk is temporary**, so SQLite in the container loses everything on restart. | High | Mitigated for staging: Litestream replication to Cloud Storage; the container refuses to start in production without it. **Remaining:** overlap during redeploys can lose seconds of writes; real data needs a managed database (decision for you). |
| 5 | **`npm install` failed** (unused `esbuild` pin conflicted with Vite's peer range); `tsx`, needed at runtime, was a dev dependency; no npm lockfile. | High (blocked CI and builds) | Fixed. |
| 6 | **Patient names listed to anyone** (`/api/auth/patients`) and demo patients created in any environment. | High for real use | Fixed: gated by `DEMO_MODE`, off in production. |
| 7 | **Production patient sign-in had no usable path** (open demo sign-in is disabled in production; per-patient codes had to be set by hand in an env var). | High (missing essential function) | Fixed: pharmacist-issued QR/typed access codes. |
| 8 | **Weak secrets accepted** in production (any non-empty string). | Medium | Fixed: 32+ and 12+ characters enforced. |
| 9 | **Cookies cannot work from a native app** (`SameSite=Strict`, cross-site API). | Blocker for iOS | Fixed: opt-in bearer token (never sent to the web app), exact-origin CORS allowlist, no credentialed CORS. |
| 10 | **Sign-in rate limit used the proxy's address** behind Cloud Run. | Medium | Fixed: `trust proxy` one hop in production (`TRUST_PROXY`). |
| 11 | **No Content-Security-Policy or HSTS.** | Medium | Fixed for production; the full sign-in, QR, plan and chat flows were run in a browser under the policy with no violations. |
| 12 | **API errors returned the web page or an HTML stack page.** | Low | Fixed: JSON 404/400/413/500 for API paths. |
| 13 | **Static caching:** `index.html` was cacheable. | Low | Fixed: `no-cache` for the page, immutable for hashed assets. |
| 14 | **Dose reminders were not implemented.** The screen promised "a reminder before each dose" but only one test notification was sent. | **High (patient safety)** | Fixed: real scheduling (native daily notifications; browser timers while the page is open, and the screen says so); multi-dose medicines get no guessed reminder; notification text never names a drug. |
| 15 | **Tab bar clipped** at phone width ("Food check" cut off). | Low | Fixed. |
| 16 | **Capacitor plugin proxies** can break when returned from async helpers (found while writing tests; would have failed silently on a device). | Medium | Fixed and guarded by tests. |
| 17 | No `localhost` or fixed-port URLs in source; all 21 `fetch` calls were relative. | Info | All now go through one API client with `VITE_API_BASE_URL` / a saved server address. |

## Still open (not fixable in code alone)

- Real authentication, MFA, per-person pharmacist accounts; consent text.
- Managed database for real data; encryption/key management; tested backup and restore.
- Agreements and reviews: business associate agreements, privacy review, device determination.
- Clinician review of fixed wording, triage lists, evaluation cases, demo clinical content.
- Universal Links so a QR code opens the iOS app directly (needs Apple account).
- Reminders on a device (needs a Mac and a phone), App Store/TestFlight steps.
- A monitored on-call path for urgent items.
- The container image has not been built, and Litestream, the bucket mount and Secret Manager wiring have not been exercised, in the build session (no Docker daemon or Google Cloud project). CI builds and smoke-tests the image.

## Verification

See `docs/implementation-log.md` for the commands run and their results.
