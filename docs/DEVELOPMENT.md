# Development and testing

[Back to README](../README.md)

## Development servers

Complete the [initial setup](../README.md#quick-start) first.

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

## Automated checks

Run from the project root after installing dependencies:

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

Frontend unit tests can also be run from `frontend/`:

```powershell
npm.cmd run test:calendar
npm.cmd run test:study-totals
npm.cmd run test:study-history
```

See [verification records](VERIFICATION.md) for results, performance measurements and acceptance work, and [deployment instructions](DEPLOYMENT.md) for MySQL integration tests.
