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
