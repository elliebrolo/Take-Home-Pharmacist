# TakeHomePharmacist (prototype)

A take-home prototype that turns a pharmacist's consultation transcript into a patient's medication schedule. It has two interfaces:

- **Patient app**: today's schedule with medication images, a medication Q&A assistant, a food check, dose reminders (see [Known limitations](#known-limitations)), and emergency guidance. Patients sign in by scanning a QR code from their pharmacy.
- **Pharmacist workspace**: transcript intake, plan editing and approval, patient access codes (QR), medication image confirmation, a review queue for patient questions, and an FDA label reference.

> **This is a prototype, not a medical device.** It uses only fictional demo patients. Do not enter real patient information. Nothing in it has had clinical validation. See [Known limitations](#known-limitations).

Stack: React 19, Vite, Express, SQLite (`node:sqlite`), Gemini or OpenAI API (optional). Deployable to Google Cloud Run ([docs/deployment.md](docs/deployment.md)) and packageable as an iOS app with Capacitor ([docs/ios.md](docs/ios.md)); the audit behind that work is in [docs/deployment-readiness-audit.md](docs/deployment-readiness-audit.md).

## 1. Installation and environment setup

Requirements:

- **Node.js 24 or newer.** The server uses the built-in `node:sqlite` module. Check with `node -v`.
- npm. `npm install` and `npm ci` both work; `package-lock.json` is the lockfile used by CI and the container (`bun.lock` is kept for bun users, so run `bun install` after changing dependencies).
- Internet access for RxNorm and DailyMed (public NLM services). They are used when a plan is approved and when answers are grounded in FDA labels.
- Optional: an AI provider key, either [Gemini](https://aistudio.google.com/apikey) or [OpenAI](https://platform.openai.com/api-keys). Without one the app still runs; see [Choose the AI provider](#choose-the-ai-provider).

```bash
npm install
cp .env.example .env
```

Edit `.env`. Every value below is optional in development:

| Variable | Purpose |
| --- | --- |
| `LLM_PROVIDER` | `gemini` or `openai`. See below. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini key and model (default `gemini-3.8-flash`, not verified, so set a model your key can use). |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI key and model (default `gpt-5.4-mini`). `OPENAI_BASE_URL` optionally points at a compatible endpoint. |
| `PHARMACIST_PASSCODE` | Pharmacist sign-in passcode. If unset in development, a random one is printed when the server starts. |
| `SESSION_SECRET` | Signs session cookies. Required in production. |
| `PATIENT_CODES` | Optional per-patient codes, for example `PT-8821:code1,PT-9410:code2`. Patients without a code can sign in without one only outside production. |
| `AUDIT_RATE` | Share of validated answers sent to the pharmacist for audit (default `0.2`). |
| `URGENT_WEBHOOK_URL` | Optional https webhook (Slack-style) told when an emergency or urgent item is queued. The message holds only the item number and reason, never patient names or text. See [Urgent-item notifications](#urgent-item-notifications). |
| `LABEL_REFRESH_HOURS` | Hours between automatic re-reads of cached FDA labels (default `24`, `0` turns it off). Changed label text is flagged in the review queue. |
| `DB_FILE` | SQLite file (default `data/app.db`). |
| `PORT` | Server port (default `3000`; Cloud Run sets it). |
| `DEMO_MODE` | `true` lists and creates the fictional demo patients. Default on in development, **off in production**. |
| `DATA_DIR`, `UPLOAD_DIR` | Where the database, uploaded photos and NLM photos live (default `./data`). Point at a persistent volume. |
| `PUBLIC_BASE_URL` | The address patients open, used in QR access links. Default: the address of the request. |
| `CORS_ORIGINS` | Exact origins allowed to call the API from another origin (the iOS app: `capacitor://localhost`). Default none. |
| `PATIENT_SESSION_HOURS` | Patient session length (default 24, max 720). Pharmacists: 8 hours. |
| `TRUST_PROXY` | Proxy hops in front of the app (default 1 in production, 0 otherwise). |
| `VITE_API_BASE_URL` | Build time: API address for a web or iOS build that is not served by the API. See [docs/ios.md](docs/ios.md). |
| `LITESTREAM_REPLICA_URL`, `ALLOW_EPHEMERAL_DB` | Container only: where the database is replicated; see [docs/deployment.md](docs/deployment.md). |

### Choose the AI provider

One setting drives both the chatbot and the consultation transcript parser:

```bash
# OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=...            # your own key
OPENAI_MODEL=gpt-5.4-mini     # optional; this is the default

# or Gemini
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=...
```

- If `LLM_PROVIDER` is unset, the provider whose key is present is used (Gemini if both are set).
- If you choose a provider but its key is missing, or the name is not `gemini`/`openai`, there is **no model**. The app does not switch providers silently.
- The server prints the active provider and model at startup, for example `AI model: openai / gpt-5.4-mini`, or why none is configured.
- Both providers go through the same pipeline: emergency/urgent detection, the patient's approved record and FDA label passages, answer validation, and escalation to the pharmacist. The provider only writes the draft. A model can still be wrong, and the validator is lexical, so it is not a clinical safety guarantee.
- Transcript parsing sends the transcript to the chosen provider. Use only fictional data in this prototype.
- OpenAI models in the GPT-5 family accept only their default temperature, so none is sent. Gemini runs at temperature 0.

`.env` is git-ignored. Never commit real keys or passcodes. Use your own values in `.env`.

### Optional: download the reference pill photos

The demo patients use US reference photos from the NLM RxImage archive. They are not in the repo. Without them the app shows a neutral "No photo" placeholder, which is safe but looks bare.

```bash
npm run nlm:fetch                              # demo drugs only (default)
npm run nlm:fetch -- --match atorvastatin,lisinopril
npm run nlm:fetch -- --all                     # every image, about 350 MB
```

This reads the archive with HTTP range requests, so the full 7.3 GB ZIP is not downloaded. Files go to `data/nlm/` (git-ignored). NLM labels the set research-and-development use only and no longer updates it.

## 2. Start the application

```bash
npm run dev      # development: Express + Vite middleware, http://localhost:3000
```

On start the console prints whether the AI model is configured. If `PHARMACIST_PASSCODE` is not set, it also prints a one-time pharmacist passcode for that run.

Other commands:

```bash
npm run build    # production build into dist/
npm start        # same server entry; set NODE_ENV=production to serve dist/
npm run ios:sync # build for the iOS app and copy it into ios/ (see docs/ios.md)
npm run lint     # TypeScript type check (tsc --noEmit)
npm test         # automated tests
```

In production (`NODE_ENV=production`) the server requires `SESSION_SECRET` (32+ characters) and `PHARMACIST_PASSCODE` (12+ characters), does not list or create demo patients unless `DEMO_MODE=true`, and sends HSTS and a Content-Security-Policy. Run `npm run build` first so `dist/` exists.

Health checks: `GET /healthz` (process is up) and `GET /readyz` (database readable). Neither needs sign-in.

The first run creates `data/app.db` and seeds the three demo patients as approved plans marked "Demo data (not reviewed)".

## 3. Sign in

Open http://localhost:3000. You land on the **Sign in** page with two tabs.

| Role | How |
| --- | --- |
| **I am a patient** | Scan the QR code a pharmacist created (or type the 20-character code), or, in demo mode, choose a demo patient under "Demo only". |
| **I am a pharmacist** | Enter any name (it is recorded when you approve a plan) and the passcode. Use the value of `PHARMACIST_PASSCODE`, or the one printed in the server console. |

Demo patients (all fictional):

| Patient | ID | Medications |
| --- | --- | --- |
| Robert Chen | PT-8821 | atorvastatin, metoprolol succinate ER, lisinopril, aspirin |
| Maria Santos | PT-9410 | metformin XR, glipizide, atorvastatin |
| David Miller | PT-7193 | amoxicillin/clavulanate (Augmentin) |

Use **Sign out** in the header to switch roles. Pharmacist sessions last 8 hours and patient sessions 24 hours (`PATIENT_SESSION_HOURS`). Sign-in and code redemption are each limited to 10 attempts per 10 minutes.

### Patient access codes (QR)

1. Sign in as a pharmacist, pick a patient whose plan is **approved**, and press **Create access code** under *Patient access (QR code)*. Choose how long it stays valid (24 hours, 3 days or 7 days).
2. The code appears once, as a QR code and as `XXXX-XXXX-XXXX-XXXX-XXXX`. You can copy the link or print the card.
3. The patient scans the QR code with the phone camera (or types the code at sign-in) and sees only their own plan.
4. A code works **once**, expires, and can be **revoked** while unused (see *Recent codes*). Only a hash is stored. The code travels after the `#` in the link, which browsers never send to servers, so link scanners cannot use it up.

A lost or used code is replaced by creating a new one. In production this is the only way for a patient to sign in, apart from per-patient codes set in `PATIENT_CODES`.

## 4. Navigate the two interfaces

### Patient app

Three tabs:

- **Today**: doses grouped by Morning, Midday, Evening and Bedtime, with a progress bar. Each medication card has **Mark taken** and **Show details** (form, how to take it, purpose, warnings, the pharmacist's note, refills). Dose reminders can be switched on from this tab: in the iOS app they arrive every day at each medicine's usual time; in a browser only while the page stays open.
- **Ask a question**: the AI assistant. It is labelled "not a pharmacist".
- **Food check**: type a food or drink to check against the patient's medications.

The **Emergency numbers** button in the header opens plain emergency guidance (911, Poison Control, 988, and the pharmacy phone number).

### Pharmacist workspace

- **Patient questions to review** (top): the review queue. A badge shows the number of open items.
- **Demo patients** cards: pick the case to work on.
- **Consultation Transcript Intake**: the transcript, a parse button, and the editable regimen.
- Per-medication **Patient-facing medication image** controls.
- **Drug reference: FDA label text** (expandable).
- **Approval** checkbox and **Approve and publish** button.

## 5. Test the main features by hand

### Medication schedules

1. Sign in as Robert Chen. The **Today** tab shows four medications across time slots.
2. Press **Mark taken** on one card. It turns green and the progress bar moves. Press it again to undo.
3. Press **Show details** on a card to see how to take it, the warnings, and the pharmacist's note.

### Medication images

1. In the patient app, cards show a reference photo (if you ran `npm run nlm:fetch`) with a **Demo image** caption saying it has not been checked by a pharmacist. If the files are missing, a neutral "No photo" placeholder shows instead.
2. In the pharmacist workspace, open a medication's **Patient-facing medication image** section. Three sources are available:
   - **Photograph the pill**: upload a photo of the dispensed pill.
   - **US reference photos**: search the NLM set (needs `nlm:fetch`).
   - **Package image**: a DailyMed label image looked up by NDC.
3. Enter a **DIN** and press **Check** to look it up in Health Canada's Drug Product Database. The app warns if the strength does not match.
4. Confirm a photo, then check the patient app. Patients see only confirmed (or flagged demo) images. Editing the NDC, DIN, name, strength or form removes the confirmation.
5. **Describe the pill** text is shown to the patient when there is no photo.

### Chatbot responses

Sign in as a patient and open **Ask a question**.

- **Without a model (no key for the chosen provider)**: any ordinary question gets a fixed "I can't answer this right now" message and is forwarded to the pharmacist's queue. Emergency wording still triggers the fixed emergency text, because that path needs no model.
- **With a key (Gemini or OpenAI)**: try "Can I take ibuprofen with my medications?", "What is my lisinopril for?", and "When should I take the metoprolol?". Answers cite the patient's approved record (R1, R2…) or FDA label passages (L1, L2…), and appear with a source list.
- **Emergency check**: type something like "I have chest pain and can't breathe". You get the fixed emergency message (call 911) and the item is queued as an emergency.
- **Urgent or needs-pharmacist**: try "I took a double dose by accident". It is escalated and queued.
- The model must return JSON whose source ids come from the list it was given (for example `R2`, `L1`). Answers that fail validation (uncited, unknown ids, unsupported drug names or doses, and so on) get **one automatic corrective retry** with the reasons. If the second try also fails, the patient sees a fixed message and both drafts go to the pharmacist's queue. A model that says the sources do not answer the question is not retried.

### Food check

In **Food check**, enter "grapefruit". The result is always "caution" or "not checked", never "safe". It cites the patient's record or an FDA label passage. Unknown foods are queued for the pharmacist.

### Pharmacist review queue

1. Ask the patient chat a question that is escalated (see above).
2. Sign in as a pharmacist in another browser profile or a private window. The queue shows the item with its reason (emergency, urgent, needs pharmacist, validation failed, model unavailable, or audit sample).
3. Open the item to see the conversation. Type a reply and send it, then **Resolve**. The patient sees your reply in their chat, marked "Written by your pharmacist". The chat polls about every 20 seconds.
4. Audit items can be flagged ok, wrong or unsafe when resolving.

### Pharmacist approval

1. Pick a demo patient card.
2. Edit a medication (for example the dose or a warning), or add one with **Add Medication**.
3. Without an approval the patient never sees your edit. Patients see only the last approved version.
4. Tick the attestation checkbox and press **Approve and publish**. Each medication name is checked against RxNorm and given an RxNorm id. Names that cannot be resolved are rejected with a list.
5. Sign in as that patient to confirm the change.
6. To parse a new transcript, paste it and use the parse button. This needs a configured model (the same provider as the chat). The result is a draft that must be reviewed and approved before it is published.

### Testing with a real provider

1. Set the provider and key in `.env` (see above) and restart. Check the startup line.
2. Sign in as a demo patient and ask the questions listed under **Chatbot responses**. Repeat with the other provider by changing `LLM_PROVIDER` and restarting.
3. Sign in as a pharmacist, paste a short fictional transcript, and use the parse button. Check that the draft contains only what the transcript says, and that nothing reaches the patient until you approve.
4. A wrong key or model name shows up as the fixed "can't answer" or urgent message and a queued item, not as an error page.

### Automated tests

```bash
npm test                 # about 300 tests, run in a few seconds, using scripted fake models (including a fake OpenAI endpoint) and fake label data
npm run eval             # the release gate only: emergency, grounding and out-of-scope cases (also part of npm test)
RUN_LIVE=1 npm test      # also runs the live RxNorm/DailyMed test (needs internet)
npm run lint
```

The tests cover sign-in and access control, consultation approval, triage, label parsing and change detection, answer validation, the review queue, urgent-item notifications, provider selection, and the full pipeline on the OpenAI adapter. They never call a real provider. Passing tests are **not** evidence of clinical safety.

**Release gate.** `npm run eval` (run by CI on every push, see `.github/workflows/ci.yml`) must pass before any change to a prompt, model name, keyword list or validator ships. It requires: every case in `tests/eval/triage-cases.ts` reaches `emergency` from the keyword net alone and still does when the model is wrong or down; no demo patient receives an answer naming another patient's drug; delivered answers cite sources; out-of-scope questions are refused, not guessed. The cases were written by a developer and have **not** been reviewed by a clinician or checked by native speakers. To grow the set, add cases to that file, and export items a pharmacist flagged "wrong" or "unsafe" from `GET /api/review-items-flagged`.

### Urgent-item notifications

By default a pharmacist sees urgent items only while the workspace is open (the queue refreshes every 30 seconds and plays an alert tone when a new emergency or urgent item arrives). To be told elsewhere, set `URGENT_WEBHOOK_URL` to an https incoming webhook. Each emergency or urgent item sends one best-effort message such as "POSSIBLE EMERGENCY item #12 is waiting in the review queue". It contains no patient name, id or message text, so the destination is not treated as holding patient data. A failed delivery never affects the patient and is recorded in the audit log (`notify.failed`). A real deployment needs a monitored on-call path with acknowledgement, not just a webhook.

### Drug label changes

A background job (and the pharmacist-only `POST /api/drug-labels/refresh`) re-reads each cached FDA label from the same DailyMed set. If any section's text changed, or the source label had to be replaced, every patient whose approved plan includes that drug gets a **Drug label changed** item in the review queue. Nothing in a patient's plan changes automatically; the pharmacist decides.

## Known limitations

- **Prototype sign-in only.** A shared pharmacist passcode and an optional per-patient code. A real deployment needs a real identity provider. There is no encryption at rest, no HIPAA/PHIPA review, and no production audit trail.
- **No clinical validation.** The fixed emergency text, hotline numbers (US Poison Control and 988 are US services), the triage keyword lists, and the demo patients' clinical content all need clinical sign-off and Canadian review.
- **Validation is lexical.** The answer validator checks citations, drug names, doses and directive wording against the cited text. It cannot judge meaning.
- **Label knowledge is limited.** One US FDA label per drug (DailyMed), refreshed daily by the background job. Changes are detected by comparing section text, so a wording-only edit is flagged the same as a safety change. No structured drug-drug interaction database.
- **Real providers not exercised.** Neither the Gemini nor the OpenAI path has been run against the live API from this repo, only against fakes. The default model names (`gemini-3.8-flash`, `gpt-5.4-mini`) are unverified. The transcript JSON schema is enforced by Gemini but only requested from OpenAI (non-strict), so the server checks the output shape and the pharmacist reviews every draft.
- **Images.** NLM photos are US products from 2009–2016 and may not look like the Canadian product. They are reference photos only. DailyMed redisplay terms are unconfirmed.
- **Notifications are a basic webhook** (optional). There is no acknowledgement, escalation or on-call schedule.
- **Dose reminders are limited.** Each medicine has one stored usual time. A medicine taken more than once a day gets no reminder (its other times are not recorded and are not guessed); the screen names it. Browsers can only remind while the page is open, so the screen tells patients to set a phone alarm. Native reminders have not been tried on a device.
- **Access codes are bearer credentials.** Anyone holding an unused code can open that patient's plan. They are single-use, expiring and revocable, but this is not identity verification.
- **Database durability (staging).** The container replicates SQLite to Cloud Storage with Litestream; a redeploy briefly overlaps two instances and can lose seconds of writes. Real patient data needs a managed database. See [docs/deployment.md](docs/deployment.md).
- **iOS app unbuilt.** The Capacitor project was generated and synced on Linux but never opened in Xcode, built or run. See [docs/ios.md](docs/ios.md).
- **Experimental SQLite.** `node:sqlite` prints an experimental warning on Node 24.
- UI tests are not included in the repo.
- **Keyword net is not a translation service.** Non-English phrases were written by a developer and are unreviewed. Text in scripts the list cannot read (for example Arabic, Hindi) is never cleared as routine without the model, but the list cannot recognise an emergency in them.
- **Security headers.** `nosniff`, frame and referrer headers always; HSTS and a Content-Security-Policy in production. The policy allows Google Fonts and DailyMed images; add any new external host to `server/core/http.ts`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Cannot find module 'node:sqlite'` or the server fails to start | Upgrade to Node 24 or newer. |
| Forgot the pharmacist passcode | Set `PHARMACIST_PASSCODE` in `.env` and restart, or read the one printed in the console at start. |
| "Too many requests. Please wait a moment." | You hit a rate limit (sign-in: 10 per 10 minutes; chat: 20 per minute). Wait, or restart the server (limits are in memory). |
| Signed out unexpectedly | Sessions last 8 hours. If `SESSION_SECRET` is unset, a random one is made at each start, so restarting signs everyone out. Set it in `.env` to keep sessions across restarts. |
| Chat always says it cannot answer | No model is configured, or the provider call fails. Check the "AI model" line in the server console: it names the provider and model, or says what is missing (a key, or a misspelt `LLM_PROVIDER`). If it names a model, check the key and that the model name is available to it. |
| Transcript parsing fails with 503 or 502 | 503: no model configured. 502: the provider call failed or returned something that was not the expected JSON. Nothing is faked: edit the plan by hand instead. |
| Approval fails with a list of unresolved medicines | RxNorm could not match the name. Use the generic name and strength (for example "metoprolol succinate"). A 503 means RxNorm is unreachable, so try again. |
| Medication images show "No photo" | Run `npm run nlm:fetch`, then reload. Without it the placeholder is the intended fallback. |
| Messy data from earlier testing | Stop the server, delete `data/app.db`, `data/app.db-wal` and `data/app.db-shm`, then restart. Demo patients are re-seeded. Uploaded photos in `data/uploads` are kept. |
| Port 3000 in use | Start with `PORT=3001 npm run dev`. |
