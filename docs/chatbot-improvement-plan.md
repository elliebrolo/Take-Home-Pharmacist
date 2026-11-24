# Chatbot Safety and Reliability Plan

Status: implemented as a prototype, NOT clinically validated. See "Implementation status" at the end for what is done, what is partial, and what is still open.

## Why this plan exists

A code review of the current chatbot (`server.ts`, `src/components/PatientChatbot.tsx`) found:

- Answers come from keyword-matched canned essays, then Gemini, then templates. None of the hardcoded clinical text cites a source.
- Most canned answers hardcode one demo patient's cardiac regimen (Robert Chen) and are shown to every patient.
- Emergency triage is substring matching: "no chest pain" triggers a 911 alert, while misspellings and non-English text match nothing.
- Unknown foods default to "safe"; the transcript parser fallback invents a medication entry.
- The bot is presented under the pharmacist's name and photo, with no "not medical advice" notice.
- No authentication; the browser supplies the regimen with each request; no conversation history.

The six phases below are ordered so the cheapest hazard removals come first and each later phase builds on the one before.

## Phase 0: Remove the active hazards

- Delete `findInstantClinicalAnswer` and `generateConsultationGuidance` (the essays that hardcode Robert Chen's regimen), and the "safe by default" branches in `evaluateClinicalFoodInteraction`.
- Replace every fallback with one honest message: "I can't answer that right now, please call your pharmacy." This covers no API key, timeouts and unknown foods.
- Stop presenting the bot as Dr. Jenkins: remove the photo and name from the chat header, label it as an AI assistant, and add a visible "not a substitute for your pharmacist" notice.
- Remove the fictional clinics, wait times and 555 hotlines. Keep 911, Poison Control and 988, plus the pharmacy's own number from the consultation record.

## Phase 1: Server-side foundation

Everything is currently React state, and the browser sends the regimen with each request.

- Add a database (SQLite is enough to start) for patients, consultations, chat messages, review items and an audit log.
- Add login with two roles, patient and pharmacist. The server loads the consultation by the authenticated patient's ID and never accepts `consultationData` from the client.
- Store full conversation history and send it with each turn, so follow-ups work.

## Phase 2: Sourced drug database

- **Identity:** normalise every medication to an RxNorm concept ID (RxCUI) when the pharmacist saves a consultation. Unresolved names block approval.
- **Content:** ingest FDA structured product labels (DailyMed / openFDA `drug/label`) per RxCUI, split by section: boxed warning, interactions, dosing, adverse reactions, patient counselling.
- **Provenance:** every stored passage keeps its label set ID, section, version date and URL. The drug catalogue tab and food checker read from this store, and the hand-written `DRUG_CATALOG` is deleted.
- **Refresh:** a scheduled job re-pulls labels and flags changed sections for consultations that depend on them.

## Phase 3: Per-patient grounded answers

- Each answer is built from only two sources: the patient's approved consultation record and label passages retrieved for that patient's RxCUIs.
- The model returns structured output: answer text plus a citation per claim (transcript quote or label section). The UI shows the citations.
- A validation step rejects answers with uncited claims, drug names not in the patient's regimen, or quotes attributed to the pharmacist that are not in the transcript. A rejected answer becomes "I don't have that in your notes" and goes to the review queue.
- The prompt drops "explain the pharmacological why" and "180 to 300 words". It never advises stopping or changing a dose; it refers that to the pharmacist.

## Phase 4: LLM triage with a conservative default

- A separate classification call runs before any answer, with the regimen and recent history, returning one of `emergency`, `urgent`, `needs_pharmacist`, `routine` plus a reason.
- Anything other than a confident `routine` escalates: timeouts, parse failures and low confidence are all treated as `urgent`.
- Keep a small keyword list as a second net that can only raise the level, never lower it.
- Emergency text is fixed, pharmacist-approved wording, not generated.

## Phase 5: Pharmacist review

- **Before release:** an AI-parsed transcript is a draft. The patient sees nothing until a pharmacist checks each medication against the transcript and signs off; the record stores who approved it and when.
- **During use:** a queue in the pharmacist portal receives all non-routine triage results, rejected answers and questions the bot could not answer. The pharmacist's reply appears in the patient's chat, marked as coming from a human.
- **After the fact:** a sampled share of routine answers goes to the queue for audit, with a "wrong / unsafe" flag that feeds the test set.

## Phase 6: Evaluation gate

- Build a test set: emergency phrasings (misspellings, negations such as "no chest pain", other languages), questions for each demo patient, and out-of-scope questions.
- Release criteria: zero missed emergencies, no answer naming a drug outside the patient's regimen, every claim cited. Run it on every prompt or model change.

## Open decisions

1. **Interaction data.** Free FDA labels give sourced text but no structured drug–drug or drug–food interaction tables; the free NIH interaction API was retired in 2024. Recommendation: start with labels and treat a licensed database (First Databank, Medi-Span, DrugBank) as the upgrade path if this goes beyond a demo.
2. **Review timing.** Holding every answer for pharmacist approval is safest but makes chat slow. Recommendation: instant answers only for validated routine questions, with everything else held for a human.

## Out of scope

A real deployment would also need HIPAA compliance, including a business associate agreement with the model provider, and a check on whether this counts as a regulated medical device.

## Implementation status

| Phase | State | Where |
| --- | --- | --- |
| 0 Remove hazards | Done. Canned answers, hardcoded drug/food rules (server and client), fictional clinics/hotlines, "Dr. Jenkins" chat identity and the invented-medication parser fallback are removed. Fallback is one honest message with the pharmacy's own number. | `server.ts`, `server/chat/fixedText.ts`, `src/components/*` |
| 1 Server foundation | Partial. SQLite (`node:sqlite`), signed-cookie sessions with patient/pharmacist roles, server-side records and chat history, audit log, rate limits. Auth is a prototype passcode scheme, not a real identity provider. Baseline security headers added; no CSP. | `server/core/*`, `server/routes/account.ts` |
| 2 Sourced drug data | Partial. RxNorm ids at approval; FDA label sections from DailyMed cached with set id, version, date and URL, refreshed weekly on use. One manufacturer's label per drug. A daily job (`LABEL_REFRESH_HOURS`) and `POST /api/drug-labels/refresh` re-read the same label and flag changed sections to the pharmacist of every affected patient. No drug-drug interaction database (see Open decisions). | `server/knowledge/*` |
| 3 Grounded answers | Done, with lexical validation only. Numbered sources, per-block citations, checks for uncited blocks, unprovided sources, drug names or doses absent from the cited text, stop/skip/"safe" instructions, invented quotes and identity claims. Rejected drafts go to the pharmacist, never the patient. | `server/chat/answer.ts`, `validate.ts` |
| 4 Triage | Done. Model classification plus keyword net that can only raise the level; model failure, bad output or low confidence means urgent; negation handled; a few Spanish/French/Chinese phrases. Emergency wording is fixed text that still needs clinical sign-off. | `server/chat/triage.ts` |
| 5 Pharmacist review | Done for the main paths. Drafts are invisible to patients until a pharmacist attests and RxNorm resolves every drug; queue for escalations, blocked answers, unanswerable questions and a sampled audit (default 20%) with ok/wrong/unsafe flags; replies appear in the patient chat marked as written by a person. | `server/core/consultations.ts`, `server/routes/review.ts`, `src/components/ReviewQueue.tsx` |
| 6 Evaluation gate | Done as a regression gate, NOT clinically validated. `npm run eval` runs 105 eval tests (56 emergency phrasings in 8 languages, negations, escalation and out-of-scope cases, per-patient grounding) and CI (`.github/workflows/ci.yml`) runs it with lint, tests and build on every push. The cases are developer-written; a clinician-reviewed set is still required. Flagged review items can be exported as regression cases. | `tests/eval.test.ts`, `tests/eval/`, `GET /api/review-items-flagged` |

Still open: real authentication and consent, encryption of data at rest, a business associate agreement with the model provider, a clinician-reviewed evaluation set (the current one is developer-written; non-English phrases are unreviewed), clinician review of every fixed text and of the demo consultations (which contain unreferenced clinical claims written as sample data), Canadian product data (Health Canada DPD is used for DIN checks only), and an on-call path with acknowledgement and escalation (an optional webhook now announces urgent items, nothing more). See `docs/implementation-log.md` for decisions waiting on the project owner.
