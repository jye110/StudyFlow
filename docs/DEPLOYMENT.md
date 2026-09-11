# Deployment and database operations

## Local AI startup requirement

For local shell startup, set temporary `OPENAI_API_KEY` and `OPENAI_MODEL` environment variables before starting the backend in the same terminal. Repeat this when opening a new terminal. Restart the backend after changing either value; an existing process cannot read changes from another terminal. Local startup does not save credentials or automatically load `.env`. See the README's **Optional live AI** section for the masked PowerShell input and startup commands. These variables are optional for core planning and required only for live AI suggestions. Docker Compose has its own `.env` handling, described below.

## Local MySQL

Start Docker Desktop. Copy `.env.example` to `.env` and replace both MySQL passwords. The supplied Compose connection URL expects alphanumeric password values; use a manually URL-encoded `DATABASE_URL` for other characters.

```powershell
docker compose up --build
```

MySQL is internal to the Compose network; only the application binds `127.0.0.1:5000`. The application applies the initial Alembic migration before serving. To seed a demonstration account:

```powershell
docker compose exec app flask --app wsgi seed-demo
```

If you already have a MySQL server, create a dedicated schema and user, then export `DATABASE_URL` with the `mysql+pymysql://` scheme. Use `charset=utf8mb4` and keep the database account limited to the StudyFlow schema. Run `flask --app wsgi db upgrade` before starting the server. MySQL transactions use READ COMMITTED so data read after obtaining the owner lock reflects the previous writer's completed changes.

## HTTPS deployment

The production Compose file is a separate complete configuration. It exposes Caddy only, with no direct Flask or database ports. Use a Linux server with Docker, a DNS hostname pointing to it, and inbound ports 80 and 443 available. Set `SITE_HOST`, `MYSQL_PASSWORD`, and `MYSQL_ROOT_PASSWORD` in the project `.env`. Optional API credentials stay in that file/environment.

```sh
docker compose --env-file .env -f deploy/compose.production.yaml up --build -d
```

Caddy obtains the certificate, redirects HTTP to HTTPS, and allows only TLS 1.2 and 1.3. Flask requires `PUBLIC_ORIGIN=https://...`, enables Secure cookies and HSTS, and trusts exactly one forwarded address/protocol hop. Caddy overwrites those headers. Do not expose the app container directly, add untrusted proxy hops, or disable certificate verification.

Verify on the actual hostname before acceptance:

```sh
curl -I http://YOUR_HOST
curl -I https://YOUR_HOST
openssl s_client -connect YOUR_HOST:443 -servername YOUR_HOST -tls1_2
openssl s_client -connect YOUR_HOST:443 -servername YOUR_HOST -tls1_1
```

Record the redirect chain, certificate, negotiated protocol, rejection of legacy TLS, browser cookie flags, absence of mixed content, and a full registration/planning/logout smoke flow. Local header tests do not prove these properties on a live deployment. Neither production deployment nor external AI configuration was performed during this task.

## MySQL acceptance tests

Use a **disposable test schema**, not the application database. `TEST_DATABASE_URL` explicitly authorizes the pytest fixture to drop and recreate the schema's application tables before each test. The CI workflow uses its own MySQL service and `studyflow_test` schema.

```powershell
$env:TEST_DATABASE_URL = 'mysql+pymysql://TEST_USER:TEST_PASSWORD@127.0.0.1:3306/studyflow_test?charset=utf8mb4'
.\.venv\Scripts\python.exe -m pytest -q --cov=studyflow --cov-report=json:tmp/coverage.json
Remove-Item Env:TEST_DATABASE_URL
```

## Schema changes

Version `7d327d8dafc4` is the initial schema. To prepare a future change, update models, generate and inspect a migration, test it on a disposable copy, and back up the real database before upgrade:

```sh
flask --app wsgi db migrate -m "Describe schema change"
flask --app wsgi db upgrade
flask --app wsgi db check
```

Never use `db downgrade base` on retained data: it drops the application tables. A future incompatible deployment should be rolled back using its reviewed migration or a tested backup, not by deleting the MySQL volume.

## Backup and restore rehearsal

Use a credential file or an interactive password prompt so secrets do not appear in shell history. Example with locally installed MySQL clients:

```sh
mysqldump --host=127.0.0.1 --user=BACKUP_USER --password --single-transaction --routines --triggers --result-file=studyflow-backup.sql studyflow
mysql --host=127.0.0.1 --user=RESTORE_USER --password studyflow_restore
```

At the MySQL client prompt, execute `SOURCE /absolute/path/studyflow-backup.sql;` into the prepared isolated restore schema. Point a separate test application at that schema, compare IDs and every field against a pre-backup manifest, and run ownership/CRUD/planning tests. Do not restore over the live schema during a rehearsal. Restrict backup file access: it contains account email addresses, password hashes, sessions, and coursework. The backup/restore rehearsal remains unexecuted in this workspace.

## Operational limits

This is a course application with a target of ten concurrent students. Lists are not paginated; there are no account recovery, administrator, email notification or background cleanup services. Expired session rows are pruned when a new session is issued. Login rate-limit records may accumulate for unique attack identifiers, so long-running public deployments should add retention and perimeter abuse controls. The basic planner requires no AI service. An AI key enables billable provider requests initiated by signed-in users; configure provider budget limits before public use.
