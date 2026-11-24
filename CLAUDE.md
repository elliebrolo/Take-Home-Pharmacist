# Take-Home-Pharmacist — Project Instructions

## Purpose and scope

Take-Home-Pharmacist is a patient-facing medication education prototype for older adults with polypharmacy, with a pharmacist workspace for reviewing and approving medication plans and answering escalated questions. It is not a clinically validated product or medical device. Use fictional demo data only.

Read `README.md` and the relevant implementation plan before making changes. Treat the current code and tests as the source of truth for existing behavior. If documentation conflicts with implementation, investigate and document the discrepancy.

## Architecture

- Frontend: React, TypeScript, Vite, and Tailwind CSS (`src/`).
- Backend: Express and TypeScript (`server.ts`, `server/`).
- Persistence: SQLite via `node:sqlite`; Node.js 24 or newer.
- AI providers: Gemini and OpenAI behind a shared pipeline (`server/chat/`).
- Clinical references: approved consultation records, RxNorm, and DailyMed label passages (`server/knowledge/`).
- Shared types: `src/types/pharmacy.ts`.
- Automated tests: `tests/`; development and implementation plans: `docs/`.

Keep frontend presentation, backend business logic, data access, and provider-specific integrations separated. Maintain support for both AI providers unless an approved plan explicitly changes that requirement.

## Clinical safety and privacy invariants

- Never introduce unsourced clinical answers, fabricated citations, invented clinician identities, or hardcoded drug interaction advice. Ground patient-facing medication information in approved records and traceable references.
- Preserve conservative triage, escalation, validation, and pharmacist oversight. Do not weaken these controls to make a demo work or tests pass.
- Do not publish AI-generated consultation drafts before pharmacist review and approval. Do not present unverified medication photos as verified.
- Fail safely when information, providers, or external services are unavailable. Do not substitute fabricated results or imply that a medication or food combination is safe without adequate evidence.
- Preserve access control and patient data separation. Never commit credentials, passcodes, real patient data, local databases, or uploaded patient files. Use `.env.example` for documented configuration placeholders.
- Treat all work as prototype development; passing software tests does not establish clinical safety. Flag changes to clinical guidance or real-world deployment for human review.

## Development workflow

1. Inspect the relevant code, tests, and working-tree status before editing.
2. Implement the requested changes in small, coherent steps. Prefer the simplest maintainable solution and reuse existing components or utilities.
3. Add or update tests for changed behavior, including relevant failure paths and safety regressions. Use scripted models and fictional fixtures by default; do not require live API keys for routine tests.
4. Run the applicable verification commands and fix regressions introduced by the changes.
5. Update `README.md`, configuration examples, and relevant documentation when behavior, setup, or architecture changes.

## Commands

```bash
npm install        # install dependencies
npm run dev        # start local development server
npm run lint       # TypeScript type checking
npm test           # automated tests
npm run build      # production build
```

Report the actual results of linting, tests, and builds. Explicitly identify checks that could not be run and why; do not claim that unexecuted checks passed. Use live integrations only when appropriately configured and authorized.

## UI and accessibility

- Design for older adults with varied health and digital literacy: plain language, legible text, clear navigation, distinct actionable controls, and accessible touch targets.
- Preserve consistent visual patterns and responsive layouts across patient and pharmacist interfaces.
- Avoid communicating important status or warnings through color alone. Keep keyboard navigation and accessible names intact.
- Do not add unnecessary complexity or features outside the requested scope.

## Repository hygiene

- Keep source files in their relevant architecture directories and implementation plans in `docs/`.
- Avoid duplicate implementations, obsolete experiments, temporary artifacts, generated build output, and large downloaded datasets in version control.
- Remove obsolete code only after confirming it is no longer referenced. Move historically useful, inactive documentation to `docs/archive/` when appropriate; do not archive active dependencies.
- Preserve unrelated user changes. Do not perform destructive Git operations or delete persistent data without explicit approval.

## Autonomous implementation and handoff

- When asked to execute an approved plan, proceed in dependency order. Resolve minor ambiguities with documented, conservative assumptions. Flag decisions with material safety, privacy, architectural, cost, or deployment implications for human review and continue independent work where possible.
- Work on a separate development branch unless explicitly directed otherwise. Use concise Conventional Commit messages (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`) that describe the user-visible or engineering outcome.
- Do not merge into `main`, deploy publicly, or publish patient data without explicit approval.
- At handoff, summarize completed changes, verification results, known limitations, unresolved blockers, and remaining actions requiring human involvement. Keep the summary actionable and distinguish implementation from validation.
