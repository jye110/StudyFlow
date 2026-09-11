# StudyFlow

StudyFlow is Group 5's Software Engineering course application: a React client, Flask REST API, relational database, deterministic study scheduler, and optional AI task breakdowns. It implements the Release 1 feature scope in the SRS v2.0 and records implementation decisions and test evidence alongside the source.

## Run on Windows

Prerequisites: Python 3.12+ and Node.js 24. From this folder:

To enable AI suggestions, first set the temporary `OPENAI_API_KEY` and `OPENAI_MODEL` environment variables in this same PowerShell window, as shown under **Optional live AI** below. Core planning works without them.

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Open **http://127.0.0.1:5000**. Create an account in the interface. On the first run, the script installs dependencies, builds React, and applies database migrations. Subsequent starts may use `-SkipBuild` if the frontend has not changed. Stop with Ctrl+C.

For macOS/Linux, run `sh start.sh` with Python 3.12+ and Node.js 24 installed.

The default database is `instance/studyflow.db` (SQLite), which persists through restarts. This convenience mode is the only architectural extension to the prescribed React/Flask/MySQL stack. MySQL remains supported for the class deployment and its acceptance tests.

## Demonstration data

To create a synthetic account with three courses and seven assignments:

```powershell
.\.venv\Scripts\python.exe -m flask --app wsgi seed-demo
```

The command creates an account with the default email `demo@studyflow.local` and prompts you to choose its password. If that account already exists, the command stops without changing any data. Demonstration data is optional and is not created automatically on installation. Accounts registered through the interface start with an empty workspace.

## What students can do

- Register, sign in, and sign out with revocable server-side sessions.
- Create, edit, and delete their own courses and assignments.
- Search and filter assignments; set deadlines, priority, estimated minutes, notes, and status.
- See each assignment's **Remaining study**, **Not scheduled**, and **Awaiting confirmation** minutes. Remaining study subtracts confirmed study from the estimate, never below zero; completed assignments show zero. Dashboard **Up next** shows the same remaining time. Only ended, unconfirmed sessions await confirmation. **Not scheduled** matches Schedule's backlog.
- Open assignments with zero remaining study show **Study time reached · Confirm completion** and a **Mark complete** button in Assignments and Up next. Completion remains a student decision; increasing the estimate removes the reminder when more work remains.
- Choose when each assignment can start: 1 hour later (default), One week before deadline, or Custom date.
- Add, edit, or delete one-time and weekly Busy time on Schedule; automatically avoid personal plans and reschedule only conflicting future sessions.
- Use the weekly time-grid calendar with a fixed time axis; click an empty half-hour to add a personal event or click an existing event to edit it.
- Clicking a study session also shows its assignment title, course, deadline, priority, status, estimated/remaining study time, unscheduled time, awaiting-confirmation time and Notes. Accepted task breakdowns can be expanded. These details are available for future, active and ended sessions.
- Schedule keeps the calendar and **Schedule remaining / Regenerate plan** in the first screen. **Plan settings** opens a dialog; **Check-in**, **Conflicts**, **Busy time**, and the remaining-time total open side panels without lengthening the page.
- **Apply settings** saves planning preferences and checks future sessions against study hours, the daily study total, the planning window and Busy time. Conflicts prompt **Regenerate plan** or **Keep current plan**; existing sessions move only after regeneration is confirmed. Keeping the plan retains the newly saved settings for later scheduling. Canceling the settings editor discards its draft.
- The calendar defaults to a **12h** view starting at 08:00. Switch between **6h / 12h / 24h**; hour heights adapt to the available space. Scroll inside the calendar to reach other hours. Filling or regenerating a plan preserves the selected view.
- Generate or regenerate a study plan with overdue work first, choose daily start/end times and a total daily study budget, and adjust future sessions.
- Use **Schedule remaining** to fill unscheduled work without moving existing sessions; reducing an assignment estimate automatically trims its latest future sessions.
- Confirm ended study sessions as **Completed** or **Not completed**. Missed minutes return to unscheduled work; confirmed study moves Not Started assignments to In Progress, while final assignment completion stays manual.

- Review unallocated work when deadlines or capacity prevent a complete plan.
- Complete or reopen assignments and see progress and overdue summaries.
- Request an optional AI breakdown, then explicitly accept or dismiss it.

After a session ends, the dashboard shows a review prompt and Schedule lists it under **Study session check-in**. You can also click the past calendar event. Pending confirmations keep their planned minutes reserved; time passing never marks study as completed. **Not completed** leaves the historical event visible and makes its minutes available to **Schedule remaining**. **Completed** records self-reported study and updates a Not Started assignment to In Progress. Even when every session is done, mark the assignment complete yourself. Reviewed outcomes can be corrected; correcting missed study to completed trims any newly redundant future time. Existing sessions migrate to pending. Progress displays confirmed study minutes separately from completed-assignment estimates.

In the assignment form, **Earliest start** controls when automatic and manually moved sessions may begin. **1 hour later** gives newly planned sessions at least one hour after each planning request; fill preserves existing sessions, and editing a session's duration can keep its existing start. Previously selected Now uses this same one-hour rule for new scheduling. **One week before deadline** follows deadline edits; if that time has already passed, planning starts from now. **Custom date** starts at local midnight on the selected date. For work not yet overdue it must be on or before the deadline; overdue work may choose a later start. Switching start choices removes only future sessions that are too early; use Schedule remaining to arrange the missing work without moving other sessions. Insufficient capacity remains visible as unallocated time and never causes the planner to start earlier than requested.

On **Schedule → Busy time → Add busy time**, choose **Does not repeat** for dated arrangements or **Every week** for selected weekdays. You can add several intervals per day; names are optional. Repeating intervals use the saved timezone, and an earlier end clock time continues into the next day. **Time each day** is a total study budget: planning skips busy periods and continues looking for free time between the selected start and end times (default end: 22:00). For example, 3 hours from 09:00 with busy time from 10:00 to 12:00 can produce study from 09:00–10:00 and 12:00–14:00. Existing pending/completed study on that local day counts toward the budget, including earlier study; missed sessions do not. Saving busy time flags existing conflicts without moving sessions. Use **Reschedule conflicting sessions** to move only the conflicting future study time while keeping other sessions in place. If it cannot fit, the displaced work is reported as unallocated. Started sessions remain history. Deleting a busy time makes it available for the next planning action.

Overdue assignments remain schedulable and take precedence over upcoming assignments, including higher-priority upcoming work. Their original deadlines and overdue labels remain visible. For both groups the planner respects earliest starts and busy time; upcoming work must still finish before its deadline. Use Generate/Regenerate to apply this ordering to your plan.

## Development

Inside a personal event's editor, **Delete event** removes that arrangement after confirmation; for weekly events it deletes the whole repeating series. Study-session editors also include **Delete session**. Saving a new duration or deleting a future study session automatically compensates later study time: for a 60-minute assignment, changing the first 30-minute session to 20 leaves 40 minutes to arrange later; changing it to 45 leaves 15. Earlier sessions and the edited session stay in place, and later affected sessions are replanned using the latest saved plan settings. Shortfalls appear as unallocated work. The released slot stays free during this adjustment; explicit full regeneration may use it again. Past/active study sessions remain protected.

Reducing an assignment's **Estimated time** removes excess future study minutes from the latest sessions first: a 90-minute plan of 30 + 30 + 30 becomes 30 + 15 when reduced to 45. Started sessions remain history, even if their total exceeds the new estimate. Increasing the estimate keeps existing sessions and shows additional minutes waiting to be scheduled. On **Schedule**, choose **Schedule remaining** to allocate only those missing minutes (including newly added assignments), preserving all existing sessions. It uses the study settings above and avoids busy times and occupied slots; insufficient capacity stays visible. Explicit fill can reuse gaps released by earlier edits. Use **Regenerate plan** only when you want to replace the entire future plan.

The calendar shows all 24 hours with dates across the top and time on the left. Study sessions use course colors; personal events are purple and block study time. Click an empty half-hour to open **Add event** with its date/time already filled in, or use the **Add event** button. Repeat options and conflict handling are shared with Busy time. Editing a repeating event changes the full weekly rule. Overlapping events appear side by side; overnight events continue onto the next day. Very short study sessions have a minimum visible height and show their precise duration when opened. On phones, swipe inside the calendar to see other days; the time axis stays visible. Empty slots support arrow-key navigation and Enter to add.

Use two terminals. The Vite development proxy forwards `/api` to Flask without CORS workarounds.

```powershell
# Terminal 1, project root
.\.venv\Scripts\python.exe -m flask --app wsgi db upgrade
.\.venv\Scripts\python.exe -m flask --app wsgi run --host 127.0.0.1 --port 5000

# Terminal 2
cd frontend
npm.cmd ci
npm.cmd run dev
```

Visit `http://127.0.0.1:5173`. Environment variables are read by Flask at process startup. `.env.example` is a configuration reference; local shell variables must be exported explicitly. Docker Compose reads `.env` automatically.

## MySQL and deployment

Copy `.env.example` to `.env`, replace the database passwords with distinct random values, and start Docker Desktop. Use alphanumeric passwords here, or URL-encode special characters in a manually supplied `DATABASE_URL`.

```powershell
docker compose up --build
```

This starts MySQL 8.4 and the built application at port 5000. The database has a persistent named volume; do not remove the volume if you want to retain its data. Stop the locally running server first if it already occupies port 5000.

See [deployment instructions](docs/DEPLOYMENT.md) for HTTPS, migration, backup, and restore procedures. Docker/MySQL deployment was provided but not executed locally because the Docker engine was unavailable.

## Optional live AI

The planner works without credentials. To enable the optional live adapter, set `OPENAI_API_KEY` and `OPENAI_MODEL` in the backend environment, then restart it. Choose a model available to your API project that supports the Responses API and structured outputs. The app never exposes the key to React. A ChatGPT subscription does not configure this application’s API access.

**Local startup requirement:** configure both variables before starting the backend, in the same terminal. They are temporary: a new terminal requires configuration again, and an already-running backend does not pick up later changes. Local startup does not automatically load `.env` or save the API key. Stop any existing StudyFlow backend on port 5000 before starting the configured replacement.

In PowerShell, from the project folder (the key prompt hides input and keeps the key out of command history):

```powershell
$studyFlowKey = Read-Host "Enter API Key" -AsSecureString
$env:OPENAI_API_KEY = [System.Net.NetworkCredential]::new("", $studyFlowKey).Password
$env:OPENAI_MODEL = "gpt-4o-mini"
powershell -ExecutionPolicy Bypass -File .\start.ps1 -SkipBuild
```

Omit `-SkipBuild` on the first run or after frontend changes. After startup, open **Assignments → Task breakdown → Request AI suggestion** to verify the live connection. Suggestions are saved only after **Accept breakdown**. The message "AI assistance is unavailable" means the running backend is missing one or both configuration values.

Notes are required for AI suggestions, though they remain optional when creating an assignment. Empty or whitespace-only Notes disable the request button and are rejected by the backend before any provider call. Add the specific assignment topic, required work and expected deliverable. The AI assesses whether the title and Notes provide enough information: unclear Notes return a reminder explaining what to add, with an **Edit notes** shortcut, instead of generic study advice. This assessment is performed by the model, not a minimum text-length rule.

Only assignment title, Notes, estimated minutes, and priority are sent when requesting AI; account records, passwords, and sessions are excluded. The request dialog discloses this before sending. Suggestions are marked as AI-generated and become persistent only on acceptance; clarification or failure does not replace an accepted breakdown. The integration follows the [official structured outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs). Automated tests use deterministic provider responses; they verify application behavior rather than guarantee model judgment on every brief.

## Test and inspect

Progress includes a **Study time** bar chart: **Last 7 days** shows daily totals and **Last 30 days** groups the selected dates into Monday–Sunday weeks. Only confirmed completed sessions count. Dates use the browser timezone, overnight study is split by date, and the first/last week includes only dates in the range. Click a bar for its exact total.

To change your password, use **Change password** below your name at the bottom of the sidebar (open the navigation menu on phones). Enter your current password, a different new password of 10–128 characters, and its confirmation. The current device stays signed in with a refreshed session; other devices must sign in again.

```powershell
.\.venv\Scripts\python.exe -m pytest -q --cov=studyflow --cov-report=term-missing --cov-report=json:tmp/coverage.json
.\.venv\Scripts\python.exe tools/check_coverage.py
.\.venv\Scripts\python.exe -m ruff check studyflow tests tools/system_verify.py tools/check_coverage.py wsgi.py
cd frontend
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

Browser check-in tests automatically start a separate loopback server on port 5001 using temporary synthetic data and a fixed test clock. Other workflows use the normal application on port 5000. Keep port 5001 free when running the suite; the isolated check-in fixture never writes to the user's database.

The browser suite expects the built app running at port 5000 and Chrome/Edge installed. Override `BASE_URL` to test another local instance. It creates synthetic accounts; use a disposable database when running it repeatedly. CI configures an isolated MySQL database for backend tests and runs Chrome/Edge acceptance tests.

`python tools/system_verify.py` starts and stops its own isolated SQLite-backed server. It checks a real process restart with 20 assignments, five HTTP scheduler runs at 1/50/200 assignments, and a 10-user workload with 60 seconds of warm-up followed by 300 measured seconds. It writes raw measurements to `docs/evidence/system-results.json`.

## Project guide

| Location | Purpose |
| --- | --- |
| `frontend/src/` | React pages, forms, API client, responsive styles |
| `studyflow/auth.py` | Sessions, CSRF, authentication, rate limits |
| `studyflow/api.py` | Owner-scoped CRUD, schedule, progress and AI endpoints |
| `studyflow/scheduler.py` | Pure deterministic scheduler |
| `studyflow/ai.py` | Optional external-provider adapter |
| `studyflow/models.py` | Relational model and constraints |
| `migrations/` | Versioned Alembic migration |
| `tests/`, `frontend/e2e/` | Unit, API, security and browser tests |
| `tools/system_verify.py` | HTTP load and restart evidence |
| `docs/ARCHITECTURE.md` | Design decisions and requirement clarifications |
| `docs/API.md` | API contract and validation rules |
| `docs/VERIFICATION.md` | Requirement mapping, results and remaining acceptance work |
| `docs/AI_ASSISTANCE.md` | Coding assistance record for the course report |

The implementation and local tests are not a signed release acceptance. The original QA plan still calls for actual MySQL and HTTPS deployment evidence, Safari/Firefox testing, five first-time participants, and independent human review. Those outcomes must not be inferred from the automated local checks.
