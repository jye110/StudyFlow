# Verification record

## GitHub upload preparation

The complete SQLite backend suite passed: 225 tests. All 18 frontend unit tests passed (calendar geometry, assignment study totals and study history). Eight Chrome/Edge browser cases for AI Notes, applying settings, session assignment information and session outcomes passed together after giving each workflow its own synthetic account. This prevents cross-test changes to study history when GitHub Actions runs the entire browser suite. ESLint, Python lint/format and required backend coverage checks passed. GitHub Actions now also runs the frontend unit suites. MySQL and the full browser suite remain covered by the supplied CI workflow; this local preparation did not run MySQL.

Reviewed the upload file list: local `.env`, databases, dependencies, test output and packaged deliverables are excluded. A scan of source files found no OpenAI/GitHub credential patterns or private-key headers.

## Follow-up: assignment information in calendar session dialogs

Added a shared read-only assignment information card to future, active and ended study-session dialogs. It shows title, course, due date/time, priority, status, estimated/remaining time, unscheduled time, awaiting-confirmation time, Notes and expandable accepted task breakdowns. Long Notes wrap and scroll as plain text. Remaining/confirmation totals update after study confirmation. Existing session editing and check-in controls remain available below the information.

Validation: four isolated Chrome/Edge browser cases passed across the new session-details flow and the existing session-outcome regression. Checks cover calendar clicks, future/active/ended dialogs, exact totals before/after confirmation, long Notes and line breaks, HTML displayed as text, empty Notes, accepted steps, no mutation on opening/canceling, and mobile overflow. Desktop/mobile screenshots inspected. Frontend production build and ESLint passed. Backend/API unchanged; no migration or backend restart required for this display change.

## Follow-up: apply plan settings and review conflicts

Renamed Use settings to Apply settings. Applying now saves preferences and checks future study sessions against local study hours, daily quota, planning horizon and Busy time, without moving sessions. The dialog offers Regenerate plan or Keep current plan when conflicts exist. Keeping or dismissing preserves the saved preferences and all sessions; regeneration remains an explicit action and preserves started history. No database migration is needed.

Validation: 57 affected backend tests passed (planning settings, security, end-hour and daily-budget suites), including owner isolation, CSRF/revoked-session access, invalid-input atomicity, no implicit scheduling, preserved sessions, busy-time reasons, daily accounting, midnight/horizon boundaries and DST. Six Chrome/Edge browser cases passed across applying settings, end-hour planning and calendar layout. One Edge assertion initially matched both a loading status and the toast; scoped it to the toast and reran that case successfully. Mobile conflict dialog inspected. Production build, ESLint and affected Python Ruff passed. Browser runs use an isolated fixture database. Restart the local backend from the configured terminal to activate the new settings endpoint.

## Follow-up: assignment Notes required for AI

AI requests now require nonblank Notes in both the request UI and backend. Empty Notes return 422 before provider invocation or throttling. The model receives title, Notes, estimated minutes and priority, and returns a structured readiness assessment: insufficient information produces an actionable Notes reminder and no steps; sufficient information produces a task-specific breakdown for explicit acceptance. Added Edit notes shortcuts and updated the data-sharing disclosure. Existing accepted breakdowns remain unchanged on clarification or errors. No credential persistence or schema migration was added.

Validation: 79 affected backend tests passed across AI, API and authentication/security. Cases cover empty/whitespace Notes, retry after adding Notes, outbound field allowlist, provider clarification, preservation of saved steps, malformed/contradictory responses, provider failures and throttling. Both Chrome and Edge isolated browser tests passed for disabled requests, backend rejection, clarification, editing Notes, retry and explicit acceptance. Mobile clarification screenshot inspected. Production frontend build, ESLint and affected Python Ruff checks passed. Browser provider results and backend HTTP responses are mocked; these checks establish application behavior, not live model accuracy. Restart the backend in the terminal containing the API environment variables to activate this change.

## Follow-up: study history bar chart

Added a Progress chart with Last 7 days daily totals and Last 30 days weekly totals, using confirmed completed study only. Totals follow browser-local dates, split overnight sessions, clip range boundaries and preserve empty days/weeks. Clicking or keyboard-activating a bar shows details; range summaries and empty-state guidance are included.

Validation: five JavaScript unit tests passed for date/range boundaries, outcome exclusion, future exclusion, overnight splitting, monthly aggregation, DST elapsed minutes and axis scale limits. Both Chrome/Edge browser cases passed, checking exact daily/weekly totals, switching ranges, empty weeks, keyboard selection, mobile overflow and session confirmation/correction reflected after reload. Desktop and mobile screenshots inspected; mobile spacing refined. Build, ESLint and fixture Ruff passed. Tests use dedicated synthetic history in the isolated fixture server. Application backend/schema unchanged; backend suite not rerun for this client display change.

## Follow-up: daily study end time

Added Finish studying by to Plan settings and the toolbar summary, defaulting to 22:00. End hours range from 01:00 to 24:00 and must be later than the daily start. Automatic generation, fill, repair and compensation end sessions by this local boundary while retaining the daily cumulative budget and assignment start/deadline rules. Existing saved settings and older requests default to 22:00; normalized settings persist on planning actions. Existing retained sessions/manual anchors remain unchanged until an explicit action.

Validation: all 202 backend tests passed, including 16 new end-time cases for exact cutoff/partial sessions, busy gaps and next-day overflow, preserved study outside the window, DST, invalid-setting atomicity, saved settings, every replan path and legacy defaults. Four Chrome/Edge browser cases passed: end-setting cancellation/application/persistence, invalid options, a three-hour task split across three 18:00–19:00 windows, mobile settings and existing calendar viewport/zoom behavior. Mobile screenshot inspected. Production build, ESLint and Ruff passed. Local server restarted; no schema migration was required.

## Follow-up: one-hour earliest-start buffer

Replaced the Now label with 1 hour later. The legacy stored/API mode remains `now`, while generation, fill, conflict repair and compensation impose request time plus one hour on new allocations. Manually moving a session enforces the same buffer; duration-only edits and retained sessions keep their starts. Switching another start choice to this option removes conflicting future sessions; unrelated edits do not. Relative-week and custom-date semantics remain unchanged.

Validation: the 186-case backend run passed 184 tests and identified two fixture assumptions after general scheduler fixtures were changed to explicit immediate custom starts. Corrected the past-date DST fixture and made the missing-custom-date validation fixture explicitly use the default mode; all 43 scheduler/start/daily-budget/buffer tests then passed. Eight new buffer cases cover implicit/explicit defaults, minute rounding, imminent deadlines, overdue work, all planning actions, retained sessions, manual moves, compensation and changing choices. Both Chrome/Edge isolated UI cases passed for the new default label, persistence and a 09:00 request producing sessions no earlier than 10:00. Production build, ESLint and Ruff passed. The local server was restarted. No schema migration or automatic rewriting of existing plans was performed.

## Follow-up: total daily study budget

Changed Time each day from a continuous clock window to total study minutes per local day. Candidates run from the selected start until local midnight, skipping busy time. Preserved pending/completed sessions consume the daily budget (including earlier today); missed sessions do not. Generation, fill, conflict repair and compensation share the budget. Existing sessions/manual anchors remain preserved even if over budget. The settings hint and summary now describe this behavior.

Validation: all 178 backend tests passed, including 11 new cases covering skipped busy hours, late-today scheduling, assignment earliest starts, midnight/deadline limits, DST/local-date accounting, preserved history outcomes, repeated fill with reduced budgets, repair and session compensation. Updated the old continuous-window busy-time expectation to the approved new behavior. Both Chrome/Edge browser budget flows passed on an isolated database: 09:00–12:00 busy time still allows 180 minutes from 12:00–15:00, and later filling preserves existing sessions and places surplus work on the next day. Production build, ESLint and backend/test Ruff passed. Local server restarted; no schema migration or automatic rewrite of existing plans.

## Follow-up: authenticated password change

Added Change password below the sidebar account name, with current/new/confirmation fields, validation feedback and a mobile dialog. The API verifies the current password, enforces existing password length rules and confirmation, throttles failures, rehashes the password, rotates the current session/CSRF token and revokes other sessions atomically.

Validation: all 167 backend tests passed, including 11 new cases for password/session rotation, old credentials and session replay, account isolation, data preservation, invalid inputs, authentication/CSRF/origin enforcement, throttling and transaction rollback. Both Chrome/Edge browser cases passed on isolated synthetic accounts, covering desktop entry/cancellation, empty fields on reopen, mobile validation, successful change, reload, old/new login and other-device invalidation. Mobile screenshot inspected. Production build, ESLint and backend/test Ruff passed. The local server was restarted with the updated API; no database migration was required.

## Follow-up: calendar start times beside titles

Every study and personal calendar event now shows its local start time in 24-hour HH:mm format alongside the title, including compact events. The time remains fixed-width while long titles truncate. Existing tooltips and editors retain full details. Production build, ESLint and four Chrome/Edge calendar CRUD/layout cases passed; the desktop 12-hour screenshot was inspected.

## Follow-up: touching calendar events incorrectly split into columns

Fractional hour scales could put a calculated bottom edge infinitesimally beyond the next event's top, incorrectly assigning touching sessions to separate lanes. Added a 0.0000001-pixel tolerance to both overlap-group and lane-reuse comparisons. Actual visual overlaps, including minimum clickable heights, retain separate lanes.

Validation: reproduced the failure before the fix with consecutive half-hour sessions at a 218px / 6-hour scale. All 10 calendar unit tests then passed, including a sweep of viewport-derived fractional scales, real overlaps, lane reuse, short events and midnight clipping. Both Chrome/Edge calendar flows passed on the isolated temporary server, with added rendered-width checks for consecutive sessions following an overlapping meeting. ESLint and production build passed. No scheduling data or backend changes.

## Follow-up: zero-remaining completion reminder

Assignments and Dashboard Up next show an amber completion reminder with Mark complete when an open assignment has zero remaining study. The button uses the existing assignment status action. No automatic completion is introduced.

Validation: both Chrome/Edge outcome workflows passed with added assertions for no reminder while work remains, reaching zero without automatic status changes, removing the reminder after increasing the estimate, completion from both pages, reopening and persistence after reload. The mobile Dashboard screenshot was inspected and the Assignments overflow check passed. Production build and ESLint passed. Backend/schema unchanged.

## Follow-up: remaining study in assignment lists

Replaced the Assignments completed-study tile with Remaining study and the Dashboard Up next duration with the same remaining value. Remaining study is estimated minutes minus confirmed completed minutes, clamped to zero; manually completed assignments show zero. Pending, future and missed sessions do not reduce remaining study. Unscheduled and awaiting-confirmation totals retain their existing meanings.

Validation: three updated totals unit tests passed, including separate assignments, no study, excess confirmed time, pending/missed sessions and manual completion. Both Chrome/Edge outcome workflows passed, checking both pages before confirmation, after missed study and after completion correction, including reload and mobile layout. Mobile screenshot inspected. ESLint and production build passed. No backend or schema changes.

## Follow-up: compact top navigation

Reduced the shared desktop header from 76px to 52px and mobile header from 64px to 48px. The calendar automatically uses the released space. Production build and both existing Chrome/Edge calendar layout cases passed, covering four viewport sizes and all hour views. Desktop screenshot inspected.

## Follow-up: adaptive calendar hour views

Added default 12-hour visibility with 6h/12h/24h controls. The available grid height determines the shared scale for labels, events and empty click targets; the 24-hour grid remains scrollable. The initial view starts at 08:00 (00:00 for 24h), including after viewport or view changes. Plan refreshes retain the selected view.

Validation: eight calendar geometry unit tests passed. The eight-case targeted Chrome/Edge run passed six cases and caught scroll-position drift in two layout cases; both layout cases passed after correcting resize positioning. These cover all three zoom levels at 1366×768, 1280×720, 390×844 and 360×640, viewport bounds, exact visible-hour ratios, starting scroll position and noon-slot form values. Other passing cases cover busy-event editing, additive planning with retained zoom and responsive navigation. Desktop and small-mobile screenshots were inspected. Build and ESLint passed. Backend/schema unchanged; backend tests were not rerun. See `evidence/calendar-zoom-regression.json`.

## Follow-up: calendar-focused Schedule layout

Moved planning settings into a cancel/apply dialog and check-ins, conflicts, unallocated detail and Busy time into side panels. A compact toolbar keeps fill/regeneration actions visible; the calendar grows into the remaining viewport height and scrolls internally. Long rule/history lists no longer affect the initial calendar position. Added unique dialog labels and nested keyboard-event handling so event editors and confirmation dialogs work inside side panels.

Validation: the 22-case Chrome/Edge suite initially passed 20 cases; two responsive-navigation checks caught a hidden mobile page heading. Restored a compact visible heading, tightened date-header spacing, then rechecked both responsive flows and both new layout flows. Layout assertions cover 1366×768, 1280×720, 390×844 and 360×640 with 20 pending sessions and 20 busy rules. Checks include calendar/button viewport bounds, horizontal overflow, draft cancellation/application, unchanged sessions before an explicit plan action, long side-panel scrolling, nested Escape behavior and focus restoration. Existing busy CRUD, repair, check-in, compensation, remaining-work and confirmation workflows were adapted to the new panel entry points. Build, ESLint and fixture Ruff passed. No application backend or schema change was made. See `evidence/schedule-layout-regression.json`.

## Follow-up: per-assignment study time totals

The Assignments list now displays confirmed completed study, unscheduled work and ended sessions awaiting confirmation for each assignment. Values are grouped by assignment ID from the existing schedule response; unscheduled time uses the server's existing backlog calculation. Future/active sessions do not count as awaiting confirmation, and manually completing an assignment does not invent completed study. Pending totals update at the session-end boundary using the existing 15-second UI clock.

Validation: three focused JavaScript tests passed, covering separate assignments/outcomes, the exact end-time boundary with timezone offsets, and manual assignment completion. Four targeted Chrome/Edge browser cases passed, verifying the displayed values before/after check-in and refill plus responsive-page regression. Desktop and 390-pixel mobile screenshots were inspected. Build and ESLint passed. No backend or schema change was needed; the previous backend suite was not rerun for this display-only change. See `evidence/assignment-study-totals-regression.json`.

## Follow-up: student-confirmed session outcomes

Ended sessions now remain pending until the student confirms Completed or Not completed. Completed records self-reported study and promotes Not Started to In Progress; assignment completion remains manual. Missed sessions stay in history but no longer credit the estimate. Additive planning, regeneration, compensation and estimate trimming use this rule consistently. Correcting a missed check-in to completed removes any excess future allocation atomically. The dashboard review prompt, Schedule queue, historical-session dialog, calendar indicators and separate confirmed-study total expose the behavior.

Validation: 156 backend tests passed. Twelve new cases cover pending history, status progression without automatic completion, repeat confirmations, all planning paths, corrections, estimate changes, completed assignments, exact end-time validation, immutable history, owner/CSRF/payload protection and transaction rollback. All 20 Chrome/Edge browser cases passed, including real API check-ins, missing-time refill, correction, reload, progress and mobile dialog coverage on an isolated synthetic database. The mobile dialog screenshot was inspected. Build, ESLint and Ruff passed. Migration `e6284ba7cd13` was applied after a SQLite backup; all original rows were compared with the backup and remained unchanged, 229 sessions defaulted to pending, and foreign-key checks passed. See `evidence/session-outcomes-regression.json`.

## Follow-up: assignment estimate reduction and additive scheduling

Reducing an estimate now trims excess minutes from the assignment's latest future sessions, preserving started/active history and other assignments. Increasing an estimate leaves existing sessions in place. Schedule remaining fills only missing work, preserving all existing session IDs, times and durations; the separate full regeneration action still requires confirmation. Filling honors busy periods, earliest starts, overdue priority, deadlines and planning capacity, and reports any remaining shortfall.

Validation: 144 Python tests passed, including eight new cases covering exact trimming, simultaneous start changes, history, estimate increases, idempotence, owner/CSRF/validation, constraints, existing conflicts and transaction rollback. All 16 existing Chrome/Edge cases passed; the two new browser cases passed after correcting a test text matcher to the existing duration format. New browser checks cover editing estimates, displayed backlog, additive planning, preserved IDs, reload, full-regeneration confirmation and mobile overflow. Build, ESLint and Ruff passed. No migration was needed. See `evidence/remaining-planning-regression.json`.

## Follow-up: event deletion and automatic session compensation

Personal-event editors now include deletion with confirmation; weekly deletion clearly covers the entire series. Study-session editing and deletion automatically rebalance later affected work against assignment estimates, preserving the edited anchor, earlier sessions and history. The released slot is not immediately refilled. Busy times, earliest starts, overdue-first ordering, planning windows and applicable deadlines remain enforced. Saved planning settings persist across requests/restarts, and shortfalls are reported explicitly.

Validation: all 136 Python tests and all 16 Chrome/Edge browser tests passed. New cases cover shorter/longer/deleted sessions, exact remaining totals, earlier/history preservation, busy-time exclusion, earliest starts, deadline shortfalls, saved settings, ownership/CSRF and transaction rollback. Browser coverage includes cancel/confirm of repeating-event deletion, session resizing/deletion and totals after reload. Earlier tests that assumed no downstream adjustment were updated to the approved behavior. Frontend build/ESLint and Python Ruff passed. The local database was backed up before additive migration `d5173a96bc02`; original rows were checked against the backup. See `evidence/session-compensation-regression.json`.

## Follow-up: weekly time grid and click-to-add events

Replaced the calendar's per-day card lists with a 24-hour grid, a sticky time axis/date row, course-colored study blocks, personal-event blocks, overlap lanes and midnight splitting. Clicking an empty half-hour prefills a personal event; existing events open their editors, including weekly rules. Mobile users can scroll horizontally while the time axis stays fixed. A bounded owner-scoped occurrence endpoint reuses the existing recurrence calculation.

Validation: 125 backend tests passed, including six new occurrence/range/ownership cases; five JavaScript layout tests passed for positioning, overlap, short events and midnight boundaries. The 12 existing Chrome/Edge workflows and two new calendar flows passed. After the final scroll/default-time refinements, both calendar and busy-time flows were rechecked (four cases). Desktop and 390-pixel mobile calendar screenshots were visually inspected. Build, ESLint and Ruff passed; no database migration was required. See `evidence/time-calendar-regression.json`.

## Follow-up: overdue work is schedulable and ordered first

Approved behavior change: incomplete overdue assignments can use future study slots and take precedence over upcoming work, while retaining their original deadline and overdue label. Within each group the existing deadline/priority/ID order is preserved. Earliest starts, busy time, capacity and history rules still apply. Manual edits and selective conflict repair support overdue work. Upcoming work continues to have a hard deadline. Custom start dates may be after an already-passed deadline. This supersedes older evidence describing overdue work as automatically unallocatable.

Validation: all 119 Python tests passed, including six new overdue-planning cases and the updated previous overdue test. All 12 Chrome/Edge browser tests passed on the rebuilt frontend; the 62-minute flow now verifies overdue scheduling and uses a busy interval to test a real capacity failure. Build, ESLint and Ruff passed. No schema migration was needed. See `evidence/overdue-planning-regression.json`.

## Follow-up: personal busy time and conflict repair

Added owner-scoped one-time and weekly busy-time CRUD, multiple weekdays, overnight intervals, timezone-aware exclusions, conflict reporting, and repair of only conflicting future sessions. Generation and manual session edits avoid busy periods. Started sessions and nonconflicting sessions remain preserved; unavailable capacity is reported as unallocated work.

Validation: all 113 backend tests passed, including 20 new cases for interval boundaries, overlapping rules, DST, ownership/CSRF, atomic validation, manual-edit rejection, repair preservation/idempotence and shortfalls. Chrome and Edge passed both the 10 existing workflow cases and 2 new busy-time flows. The final busy-form footer adjustment was rechecked in both browsers; its 390-pixel layout was visually inspected. Build, ESLint and Ruff passed. The local SQLite database was backed up before revision `c3910e5624ab`; all 33 original users, 28 courses, 33 assignments and 35 study-session rows matched the backup after migration. Automated browser tests added only synthetic records. MySQL/HTTPS/human acceptance remains outstanding. See `evidence/busy-times-regression.json`.

## Follow-up: assignment earliest start choices

Implemented the approved Now / One week before deadline / Custom date choices, relative deadline updates, custom-date validation, and enforcement in automatic and manual scheduling. Changing the bound removes conflicting future sessions while preserving history. Unused early slots remain available to other work, and capacity shortfalls never move work before its chosen start.

Validation: the full Python suite passed (93 tests), including 14 new start-preference cases. The full Chrome/Edge suite passed (10 tests), including selecting, saving, reopening and scheduling all three choices. Frontend build, ESLint and Python Ruff checks passed. The local SQLite database was backed up and upgraded with an additive migration; the existing 25 assignments defaulted to Now and the existing user/course/assignment/session rows were preserved. Existing MySQL/HTTPS/human acceptance limitations below still apply. See `evidence/start-preferences-regression.json`.

## Follow-up fix: unscheduled work shown as a warning

A reported 62-minute assignment had zero sessions because no plan had been generated for it. The Schedule page incorrectly styled all unallocated minutes as a capacity warning. It now shows a neutral “ready to schedule” prompt before an attempt, explains that saving an assignment does not schedule it automatically, and shows a capacity warning with returned reasons only after generation leaves unallocated work. The session description now says “up to 30 minutes,” making partial final sessions explicit.

Follow-up validation: all 10 standalone scheduler tests passed, including the exact 30 + 30 + 2 minute allocation; the focused regression passed in both Chrome and Edge and also verified the true overdue/failure warning. Frontend build and lint passed. See `evidence/schedule-warning-regression.json`. The full-suite results below record the initial implementation; this follow-up used targeted regression tests.

Execution date: September 10, 2026. Executor: Codex automated tools; independent human reviewer: **not yet recorded**. Baseline: SRS v2.0 and QA/testing plan v1.1. This file records development evidence, not release approval or a claim that all 27 Must requirements have passed the prescribed deployment acceptance gate.

## Executed local checks

| Check | Result | Evidence |
| --- | --- | --- |
| Python unit/API/security tests | 78 passed; overall statement coverage 94% | `evidence/backend.xml`, `evidence/coverage-summary.json` |
| Critical-module statement coverage | Authentication 98.31%; scheduler 100% in the executed suite | `evidence/coverage-summary.json` |
| React build and ESLint | Passed | Reproduce with `npm run build` and `npm run lint` |
| Python Ruff checks and formatting | Passed | Reproduce with README commands |
| Initial migration and schema drift | SQLite upgrade succeeded; `flask db check` reported no pending changes | `migrations/versions/7d327d8dafc4_initial_studyflow_schema.py` |
| Chrome and Edge browser flows | 6 passed; acceptance, responsive and AI-review tests in both browsers | `evidence/browser-summary.json` |
| Automated accessibility scan | Zero WCAG 2 A/AA and 2.1 AA findings on the five populated primary pages in Chrome | `evidence/accessibility.json` |
| Layout inspection | Desktop pages and 390px mobile dashboard inspected; four-width browser checks | `frontend/e2e/workflow.spec.js`; screenshots in local `tmp/screenshots/` |
| 20-record process restart | 20/20 retained after logout/login and one actual Flask/Waitress process restart | `evidence/system-results.json`, TC-19 |
| 200-assignment HTTP plan generation | Five runs, maximum 0.105 seconds; allocations reconciled | `evidence/system-results.json`, TC-17 |
| Ten-user HTTP load | 60 s warm-up, 300 s measured, 1 s think time; 2,944 requests, zero errors; nearest-rank p95 0.057 s | `evidence/system-results.json`, TC-16 |
| Deployment configuration | Local and production Compose files parsed successfully | `compose.yaml`, `deploy/compose.production.yaml` |

Performance/restart environment: Windows 11, Python 3.12.0, SQLite, Waitress with 12 threads, 20 logical CPUs, loopback HTTP, AI disabled. Raw samples include status codes. These measurements describe this local development run; they do not establish MySQL, internet, HTTPS, or release-candidate performance. The system run preceded final presentation/production-configuration refinements; rerun it against a frozen candidate for formal acceptance. Browser results include exact browser versions where available.

## Functional requirement mapping

“Local pass” below refers only to the implemented automated checks, not every manual or deployment variant in the supplied QA plan.

| Requirement | Test ID | Implementation and evidence | Local status |
| --- | --- | --- | --- |
| FR-01 Account registration | TC-01 | `auth.py`; normalization, duplicate, invalid-input and hash checks; browser registration | Pass |
| FR-02 Sign in | TC-02 | `auth.py`; valid/invalid/unknown credentials, protected identity | Pass |
| FR-03 Sign out | TC-03 | Server deletion, new login, captured-cookie replay | Pass |
| FR-04 Personal course CRUD | TC-04 | `api.py`; CRUD/cascade/ownership and browser cancel/delete | Pass |
| FR-05 Assignment CRUD | TC-05 | Round-trip six required fields and notes, update/delete; browser flow | Pass |
| FR-06 Invalid-field handling | TC-06 | Boundary matrix, no partial writes, retained form values | Pass |
| FR-07 Rule-based planning | TC-07 | F2 independent oracle: 6 sessions/180 min; empty, completed, ties, one-minute and overload cases | Pass |
| FR-08 Session adjustment | TC-08 | Valid edit, reload, overlap/deadline/input rejection, foreign session | Pass |
| FR-09 Regeneration | TC-09 | Replacement, history credit, repeated and concurrent generation | Pass |
| FR-10 Status transitions | TC-10 | All three statuses and reopening; invalid enum rejection | Pass |
| FR-11 Completion cleanup | TC-11 | Future cleanup, preserved history, repeat completion, injected transaction failure | Pass |
| FR-12 Overdue labeling | TC-12 | Before/equal/after due timestamp, equivalent timezone, completed exclusion | Pass |
| FR-13 Summary | TC-13 | F2 plus overdue fixture; 180→120 planned minutes and ownership | Pass |
| FR-14 Optional AI review | TC-14 | Transient response, dismiss, explicit acceptance, reload and idempotence; provider fixture in UI | Pass with deterministic provider |
| FR-15 AI failure fallback | TC-15 | Disabled, timeout, connection, 429/500, empty, malformed, wrong schema, markup, incomplete responses | Pass with fault injection |

## Nonfunctional and security mapping

| Requirement | Test ID | Evidence / outstanding work | Status |
| --- | --- | --- | --- |
| NFR-01 10-user latency | TC-16 | Local 0.057 s p95, zero errors; class deployment measurement remains | Local pass; deployment pending |
| NFR-02 200 assignments | TC-17 | All five 200-item HTTP runs under 5 s; total allocations verified | Local pass; deployment pending |
| NFR-03 First-time usability | TC-18 | Five real testers, four successful ≤300 s tasks required | Not run; participants required |
| NFR-04 Persistence | TC-19 | Actual local process restart with 20 exact serialized records | SQLite pass; MySQL pending |
| NFR-05 AI-off operation | TC-20 | Core test suite runs without provider credentials | Local pass |
| NFR-06 Browser compatibility | TC-21 | Actual Chrome/Edge automation; actual Firefox and Safari unavailable | Partial; Firefox/Safari required |
| NFR-07 Keyboard and labels | TC-22 | Dialog tab wrapping/Escape, named controls, inert hidden navigation, axe scan | Partial; complete manual control inventory required |
| NFR-08 Responsive layout | TC-23 | 390/768/1280/1440 widths, five pages, long stored text, AI dialog | Automated matrix pass; full manual state matrix pending |
| NFR-09 Independent scheduler | TC-24 | Pure module imported in pytest without React or AI | Pass |
| NFR-10 Coverage and CI | TC-25 | Per-module local coverage threshold enforced; GitHub workflow supplied | Coverage pass; remote CI not executed |
| SEC-01 Login limiting | TC-26 | Separate account and source-IP triggers, rolling boundary, correct-password lock and expiry | Local pass |
| SEC-02 Ownership | TC-27 | Cross-user reads/writes/deletes, foreign course assignment creation, schedule and AI paths | Local pass |
| SEC-03 Session invalidation | TC-28 | Old-cookie replay across protected reads/writes and fresh-session control | Local pass |
| SEC-04 Input validation | TC-29 | Types, lengths, enums, dates, unknown fields, malformed JSON and immutable rejected state | Local pass |
| SEC-05 SQL injection | TC-30 | Parameter-bound ORM operations; malicious login and stored text; MySQL execution pending | SQLite/code inspection pass |
| SEC-06 XSS | TC-31 | React text interpolation; stored script/image sentinel never executes in browser tests | Local pass |
| SEC-07 CSRF | TC-32 | Missing/bad token and disallowed Origin across every mutation family | Local pass |
| SEC-08 TLS/HTTPS | TC-33 | Redirect/header/proxy unit checks and Caddy config; no public TLS hostname | Configuration tested; deployment blocked |
| SEC-09 AI minimization | TC-34 | Allowlist and sentinel checks; no account data in provider payload | Local pass |

## Interface and design checks

| Requirement / verification | Evidence and limitation |
| --- | --- |
| UI-01 / VC-01 Navigation | All six destinations including sign-out, desktop sidebar and mobile menu |
| UI-02 / VC-02 Field errors | Server field map, visible inline errors, React state retained after rejection |
| UI-03 / VC-03 Session details | Date/time, title, course and minutes displayed in schedule and summary |
| UI-04 / VC-04 AI controls | AI label, accept/dismiss, no saved breakdown before acceptance |
| DC-01 / VC-05 Client/server authorization | Browser → Flask; every data endpoint owner-scoped on the server |
| DC-02 / VC-06 Technology | React + Flask + SQLAlchemy; MySQL path supplied; local SQLite extension recorded in ADR 001 |
| DC-03 / VC-07 AI isolation | Scheduler has no Flask, AI or database dependency; AI-off suite passes |
| DC-04 / VC-08 Secrets | Environment configuration; `.env` ignored; no live keys supplied or embedded |
| DC-05 / VC-09 Migration/integrity | Alembic initial migration, foreign keys, cascade and rollback tests; actual MySQL upgrade/restore rehearsal pending |

## Remaining formal acceptance work

The Docker engine was unavailable, so the MySQL integration CI job and container build have not been executed here. No reachable production hostname or certificates were supplied. The group must run MySQL tests and migration/backup/restore checks, exercise HTTPS/TLS on the actual host, run actual Firefox and Safari acceptance, recruit five first-time testers, complete the keyboard/label inventory and manual viewport states, and have non-author reviewers assess security and scheduling. The optional live AI adapter also needs a controlled real-provider smoke test if demonstrated.

Do not record invented participants, reviewer approval, Safari/WebKit equivalence, or a successful GitHub run. The supplied workflow has not been pushed or run remotely. Use these local results to prepare the release candidate and record the actual outcomes after team execution.

## Defects found and corrected during implementation

- The navigation link's accessible name changed with its assignment count. A stable accessible name now supports consistent navigation.
- The skip link altered the current route. It now focuses main content without routing.
- Hidden mobile navigation remained keyboard-reachable, and tapping the active destination did not close it. Inert state and an explicit close handler address both.
- Dialog focus could leave the form after the last control. Explicit wrapping keeps Tab and Shift+Tab within the dialog and preserves Escape/return focus.
- Secondary text contrast failed the first automated audit. Colors were darkened and the primary-page audit then passed.
- MySQL regeneration required fresh reads after the owner lock. READ COMMITTED is configured to avoid stale transaction snapshots; its actual MySQL execution remains a CI/deployment check.

These corrections are development observations, not a substitute for the QA plan's independent defect closure process.
