# Chatbot Safety and Reliability Plan

Status: proposed, not started. Saved for future implementation; UI improvements from peer evaluation take priority first.

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
