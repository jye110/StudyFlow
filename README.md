# StudyFlow

StudyFlow is Group 5's Software Engineering course project, built with React, Flask and SQLAlchemy. It helps students manage assignments, plan study time and track progress, with optional AI task breakdowns.

## Main features

- Manage courses, assignments, deadlines, priorities and estimated study time.
- Generate study plans around daily study hours, personal commitments and assignment start dates, with overdue work scheduled first.
- View and edit study sessions and personal events in a weekly calendar.
- Fill unscheduled work or regenerate the future plan; check conflicts when applying new settings.
- Confirm completed study, track remaining work and view study-time charts.
- Generate assignment-specific AI breakdowns from Notes and review them before saving.

## Quick start

Requires **Python 3.12+** and **Node.js 24**. Run from the project folder:

```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

```sh
# macOS / Linux
sh start.sh
```

Open **http://127.0.0.1:5000** and register an account. The first run installs dependencies, builds the frontend and applies database migrations. Stop with Ctrl+C; on Windows, add `-SkipBuild` on later starts if the frontend has not changed.

Local data is saved in `instance/studyflow.db` (SQLite) and persists between restarts. MySQL deployment is also supported; see [deployment instructions](docs/DEPLOYMENT.md).

## Optional live AI

Core planning works without an API key. To enable AI, set these temporary environment variables **before startup, in the same PowerShell window**:

```powershell
$studyFlowKey = Read-Host "Enter API Key" -AsSecureString
$env:OPENAI_API_KEY = [System.Net.NetworkCredential]::new("", $studyFlowKey).Password
$env:OPENAI_MODEL = "gpt-4o-mini"
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Repeat the configuration in each new terminal; restart the backend after changing it. Local startup does not save the key or automatically load `.env`. A ChatGPT subscription does not provide this API configuration.

Add specific assignment requirements to **Notes**, then select **Task breakdown → Request AI suggestion**. Insufficient detail prompts you to add more; suggestions are saved only after **Accept breakdown**. See the [user guide](docs/USER_GUIDE.md#ai-task-breakdowns) for details and the data sent to AI.

## Demonstration data

After initial setup, optionally create an account with three sample courses and seven assignments:

```powershell
.\.venv\Scripts\python.exe -m flask --app wsgi seed-demo
```

The default email is `demo@studyflow.local`; you choose the password when prompted. Existing accounts are never overwritten, and ordinary registration starts with an empty workspace.

## Tests and documentation

Run backend tests from the project root after setup:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

- [User guide](docs/USER_GUIDE.md): planning rules, calendar, study confirmation and AI.
- [Development and testing](docs/DEVELOPMENT.md): development servers, lint, coverage and browser tests.
- [Deployment](docs/DEPLOYMENT.md): Docker/MySQL, HTTPS, migrations and backups.
- [Verification](docs/VERIFICATION.md): test results and acceptance work.

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
