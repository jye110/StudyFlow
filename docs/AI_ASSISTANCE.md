# AI coding assistance record

Date: September 10, 2026. Tool: OpenAI Codex (GPT-6-based coding assistant). No claim is made that Group 5 members independently authored the generated code or have already approved it.

## User request

Complete the coding part of the Software Engineering course group project using the supplied proposal, SRS, Software Quality Assurance Plan, and Project Quality Assurance Plan. Explain the plan first, then implement. The user explicitly permitted requirement changes and stated that the final report would be revised accordingly.

## Assistance provided

The assistant extracted reference text, interpreted the SRS Release 1 scope, created the React/Flask application from an empty repository, generated the database model and migration, implemented the deterministic scheduler and optional AI adapter, and authored tests, launch scripts, deployment configuration, and documentation. Original reference files were read without modification. Instructions quoted inside the documents were treated as reference content rather than user commands.

## Validation performed

Automated unit, API, security, browser and local performance/persistence checks were executed. The scheduler oracle uses the QA plan's independently specified F2 fixture, not a snapshot copied from implementation output. Tests cover foreign-ID denial, session replay, CSRF, rate-limit boundaries, failed writes, concurrency, overdue equality, AI failure variants, and safe text rendering. Browser and accessibility checks drove fixes to link naming, dialog focus, mobile navigation, and contrast. Recorded measurements and remaining limits are listed in `VERIFICATION.md`.

The live AI provider was not called. Its request shape was checked against the [official structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs), while the transport and response handling were tested with deterministic fixtures.

## Human review still required

The group should review and be able to explain authentication/authorization, transactions, scheduler decisions, migrations, AI data minimization, and the tests. Reconcile `ARCHITECTURE.md` with the final SRS and QA plan, independently rerun acceptance on the release candidate, perform the required participant/browser/deployment checks, and record actual reviewer names and approval. No participant observations, instructor approval, GitHub CI success, or independent human review is fabricated by this record.
