import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from functools import wraps

from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy import select
from werkzeug.security import check_password_hash, generate_password_hash

from .models import LoginLimit, LoginSession, User, db
from .validation import APIError, body, email, password, text, validate

auth = Blueprint("auth", __name__, url_prefix="/api/auth")
COOKIE = "studyflow_session"
GENERIC_ERROR = (
    "Email or password is incorrect. Check your email spelling and password capitalization."
)
# Equal-cost password verification even when the email is unknown.
DUMMY_HASH = generate_password_hash("not-a-real-account-password")


def now():
    clock = current_app.config.get("CLOCK")
    return clock() if clock and current_app.testing else datetime.now(UTC).replace(tzinfo=None)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def load_session():
    raw = request.cookies.get(COOKIE, "")
    record = db.session.get(LoginSession, digest(raw)) if raw else None
    g.login = record if record and record.expires_at > now() else None
    g.user = db.session.get(User, g.login.user_id) if g.login and g.login.user_id else None


def require_user(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if not g.user:
            raise APIError("Sign in to continue.", 401)
        return fn(*args, **kwargs)

    return wrapped


def lock_user():
    # Serialize related mutations per owner on MySQL; SQLite uses BEGIN IMMEDIATE.
    db.session.execute(select(User).where(User.id == g.user.id).with_for_update()).scalar_one()


def check_csrf():
    token = request.headers.get("X-CSRF-Token", "")
    if not g.login or not secrets.compare_digest(token, g.login.csrf):
        raise APIError("Your form session expired. Refresh the page and try again.", 403)
    origin = request.headers.get("Origin")
    allowed = {
        request.host_url.rstrip("/"),
        current_app.config["ALLOWED_ORIGIN"],
        current_app.config.get("PUBLIC_ORIGIN"),
    }
    if origin and origin not in allowed:
        raise APIError("This request origin is not allowed.", 403)


def user_json(user):
    return {"id": user.id, "email": user.email, "name": user.name}


def issue_session(user=None, status=200):
    if g.login:
        db.session.delete(g.login)
    db.session.execute(db.delete(LoginSession).where(LoginSession.expires_at <= now()))
    raw, csrf = secrets.token_urlsafe(32), secrets.token_hex(32)
    db.session.add(
        LoginSession(
            token_hash=digest(raw),
            csrf=csrf,
            user_id=user.id if user else None,
            expires_at=now() + timedelta(hours=12 if user else 1),
        )
    )
    db.session.commit()
    response = jsonify({"user": user_json(user) if user else None, "csrf_token": csrf})
    response.status_code = status
    response.set_cookie(
        COOKIE,
        raw,
        httponly=True,
        secure=current_app.config["PRODUCTION"],
        samesite="Lax",
        max_age=43200 if user else 3600,
        path="/",
    )
    return response


@auth.get("/csrf")
def csrf():
    if g.login:
        return jsonify({"csrf_token": g.login.csrf, "user": user_json(g.user) if g.user else None})
    return issue_session()


@auth.post("/register")
def register():
    values = validate(
        body(["email", "password", "name"]),
        {"email": email, "password": password, "name": lambda v: text(v, 80)},
    )
    if db.session.scalar(select(User.id).where(User.email == values["email"])):
        raise APIError(
            "An account with this email already exists.",
            409,
            {"email": "Use another email or sign in."},
        )
    user = User(
        email=values["email"],
        name=values["name"],
        password_hash=generate_password_hash(values["password"]),
    )
    db.session.add(user)
    db.session.flush()
    return issue_session(user, 201)


def limit_rows(account):
    keys = sorted([digest("email:" + account), digest("ip:" + (request.remote_addr or "unknown"))])
    dialect = db.engine.dialect.name
    from sqlalchemy.dialects.mysql import insert as mysql_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    for key in keys:
        if dialect == "mysql":
            stmt = mysql_insert(LoginLimit).values(key=key, failures=[])
            stmt = stmt.on_duplicate_key_update(key=key)
        else:
            stmt = sqlite_insert(LoginLimit).values(key=key, failures=[]).on_conflict_do_nothing()
        db.session.execute(stmt)
    return list(
        db.session.scalars(
            select(LoginLimit)
            .where(LoginLimit.key.in_(keys))
            .order_by(LoginLimit.key)
            .with_for_update()
        )
    )


@auth.post("/login")
def login():
    data = body(["email", "password"])
    account = data.get("email", "")
    candidate = data.get("password", "")
    fields = {}
    try:
        account = email(account)
    except ValueError:
        fields["email"] = (
            "Enter your email address."
            if isinstance(account, str) and not account.strip()
            else "Enter a valid email address, such as name@example.com."
        )
    if not isinstance(candidate, str) or not candidate:
        fields["password"] = "Enter your password."
    elif len(candidate) > 128:
        fields["password"] = "Password must be 128 characters or fewer."
    if fields:
        raise APIError("Check the highlighted fields.", 422, fields)
    rows = limit_rows(account)
    instant = now()
    if any(row.blocked_until and row.blocked_until > instant for row in rows):
        db.session.commit()
        raise APIError(
            "Too many failed sign-in attempts. Please wait up to 15 minutes before trying again.",
            429,
        )
    user = db.session.scalar(select(User).where(User.email == account))
    if not check_password_hash(user.password_hash if user else DUMMY_HASH, candidate) or not user:
        for row in rows:
            cutoff = (instant - timedelta(minutes=15)).isoformat()
            failures = [t for t in row.failures if t > cutoff]
            failures.append(instant.isoformat())
            row.failures = failures
            if len(failures) >= 5:
                row.blocked_until = instant + timedelta(minutes=15)
        db.session.commit()
        raise APIError(GENERIC_ERROR, 401)
    return issue_session(user)


@auth.get("/me")
@require_user
def me():
    return jsonify(user_json(g.user))


@auth.post("/change-password")
@require_user
def change_password():
    values = validate(
        body(["current_password", "new_password", "confirm_password"]),
        {"current_password": password, "new_password": password, "confirm_password": password},
    )
    if values["new_password"] != values["confirm_password"]:
        raise APIError(
            "Passwords do not match.", 422, {"confirm_password": "Enter the same new password."}
        )
    if values["new_password"] == values["current_password"]:
        raise APIError(
            "Choose a different password.", 422, {"new_password": "Use a different password."}
        )
    rows = limit_rows(g.user.email)
    instant = now()
    if any(row.blocked_until and row.blocked_until > instant for row in rows):
        db.session.commit()
        raise APIError("Too many attempts. Try again in 15 minutes.", 429)
    user = db.session.scalar(
        select(User)
        .where(User.id == g.user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    # Recheck the session after acquiring the account lock, in case another password change revoked it.
    active = db.session.scalar(
        select(LoginSession)
        .where(LoginSession.token_hash == g.login.token_hash)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not active or active.expires_at <= now():
        raise APIError("Sign in to continue.", 401)
    if not check_password_hash(user.password_hash, values["current_password"]):
        for row in rows:
            cutoff = (instant - timedelta(minutes=15)).isoformat()
            row.failures = [t for t in row.failures if t > cutoff] + [instant.isoformat()]
            if len(row.failures) >= 5:
                row.blocked_until = instant + timedelta(minutes=15)
        db.session.commit()
        raise APIError(
            "Current password is incorrect.",
            400,
            {"current_password": "Check your current password."},
        )
    user.password_hash = generate_password_hash(values["new_password"])
    db.session.execute(
        db.delete(LoginSession).where(
            LoginSession.user_id == user.id, LoginSession.token_hash != active.token_hash
        )
    )
    return issue_session(user)


@auth.post("/logout")
@require_user
def logout():
    db.session.delete(g.login)
    db.session.commit()
    response = jsonify({"message": "Signed out."})
    response.delete_cookie(
        COOKIE, path="/", secure=current_app.config["PRODUCTION"], httponly=True, samesite="Lax"
    )
    return response
