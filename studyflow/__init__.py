import os
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, redirect, request, send_from_directory
from flask_migrate import Migrate
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from .models import db
from .validation import APIError


@event.listens_for(Engine, "connect")
def sqlite_foreign_keys(connection, _):
    if isinstance(connection, sqlite3.Connection):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=15000")


def create_app(config=None):
    app = Flask(__name__, instance_relative_config=True, static_folder=None)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    production = os.environ.get("APP_ENV") == "production"
    app.config.update(
        SQLALCHEMY_DATABASE_URI=os.environ.get("DATABASE_URL", "sqlite:///studyflow.db"),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SQLALCHEMY_ENGINE_OPTIONS={"pool_pre_ping": True},
        MAX_CONTENT_LENGTH=32768,
        PRODUCTION=production,
        ALLOWED_ORIGIN=os.environ.get("ALLOWED_ORIGIN", "http://127.0.0.1:5173"),
        PUBLIC_ORIGIN=os.environ.get("PUBLIC_ORIGIN", ""),
        OPENAI_API_KEY=os.environ.get("OPENAI_API_KEY", ""),
        OPENAI_MODEL=os.environ.get("OPENAI_MODEL", ""),
    )
    if config:
        app.config.update(config)
    if app.config["SQLALCHEMY_DATABASE_URI"].startswith("mysql"):
        # Reads after the owner lock must see the preceding transaction's new plan.
        app.config["SQLALCHEMY_ENGINE_OPTIONS"]["isolation_level"] = "READ COMMITTED"
    if app.config["PRODUCTION"] and not app.config["PUBLIC_ORIGIN"].startswith("https://"):
        raise RuntimeError("Production requires an HTTPS PUBLIC_ORIGIN.")
    if app.config["PRODUCTION"]:
        # Production Compose exposes only the trusted Caddy proxy, never the app port.
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=0)
    db.init_app(app)
    Migrate(app, db)
    from .api import api
    from .auth import auth, check_csrf, load_session
    from .cli import register_cli

    app.register_blueprint(auth)
    app.register_blueprint(api)
    register_cli(app)

    @app.before_request
    def protect_request():
        if app.config["PRODUCTION"] and not request.is_secure:
            # Fixed configured origin prevents Host-header-controlled redirects.
            return redirect(app.config["PUBLIC_ORIGIN"].rstrip("/") + request.full_path, code=308)
        if not request.path.startswith("/api/") or request.path == "/api/health":
            return None
        if request.method not in ("GET", "HEAD", "OPTIONS") and db.engine.dialect.name == "sqlite":
            db.session.connection().exec_driver_sql("BEGIN IMMEDIATE")
        load_session()
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            check_csrf()
        return None

    @app.after_request
    def response_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; "
            "form-action 'self'"
        )
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        if app.config["PRODUCTION"]:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        return response

    @app.errorhandler(APIError)
    def api_error(error):
        db.session.rollback()
        return jsonify({"error": error.message, "fields": error.fields}), error.status

    @app.errorhandler(IntegrityError)
    def conflict(_):
        db.session.rollback()
        return jsonify(
            {
                "error": "This change conflicts with existing data. Refresh and try again.",
                "fields": {},
            }
        ), 409

    @app.errorhandler(SQLAlchemyError)
    def database_error(error):
        db.session.rollback()
        app.logger.error("Database request failed: %s", type(error).__name__)
        return jsonify(
            {"error": "Unable to save this change. Please try again.", "fields": {}}
        ), 503

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify({"error": error.description, "fields": {}}), error.code

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "StudyFlow"})

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path.startswith("api/"):
            raise APIError("Endpoint not found.", 404)
        directory = Path(__file__).resolve().parent.parent / "frontend" / "dist"
        if not (directory / "index.html").exists():
            return (
                "Build the React client with npm run build in frontend, or use the Vite server.",
                503,
            )
        target = directory / path
        if target.is_file() and directory in target.resolve().parents:
            return send_from_directory(directory, path)
        return send_from_directory(directory, "index.html")

    return app
