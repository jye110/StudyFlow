#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
  .venv/bin/python -m pip install -r requirements.txt
fi
(cd frontend && npm ci && npm run build)
.venv/bin/python -m flask --app wsgi db upgrade
exec .venv/bin/waitress-serve --listen=127.0.0.1:5000 --threads=12 wsgi:app
