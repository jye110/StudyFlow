from datetime import timedelta

import pytest
from sqlalchemy import select

from studyflow.auth import COOKIE
from studyflow.models import User, db
from tests.conftest import T0, Client


def test_tc01_registration_normalization_duplicate_password_hash(app, client):
    response = client.send(
        "POST",
        "/auth/register",
        {"name": "Again", "email": " A@EXAMPLE.TEST ", "password": "correct password 123"},
    )
    assert response.status_code == 409
    with app.app_context():
        users = list(db.session.scalars(select(User)))
        assert len(users) == 1
        assert users[0].password_hash.startswith("scrypt:")
        assert "correct password" not in users[0].password_hash
    assert "password" not in client.send("GET", "/auth/me").json


@pytest.mark.parametrize(
    "data,field",
    [
        ({"name": "", "email": "a@test.local", "password": "long password"}, "name"),
        ({"name": "A", "email": "bad-email", "password": "long password"}, "email"),
        ({"name": "A", "email": "a@test.local", "password": "short"}, "password"),
        ({"name": "A", "email": "a@test.local", "password": "x" * 129}, "password"),
    ],
)
def test_tc01_invalid_registration(app, data, field):
    c = Client(app, register=False)
    result = c.send("POST", "/auth/register", data)
    assert result.status_code == 422
    assert field in result.json["fields"]
    with app.app_context():
        assert db.session.scalar(select(db.func.count()).select_from(User)) == 0


def test_tc02_tc03_tc28_login_logout_replay(app, client):
    course = client.course()
    assignment = client.assignment(course["id"])
    client.plan()
    old_cookie = client.client.get_cookie(COOKIE).value
    old_csrf = client.token
    assert client.send("POST", "/auth/logout", {}).status_code == 200
    attacker = Client(app, register=False)
    attacker.client.set_cookie(COOKIE, old_cookie)
    attacker.token = old_csrf
    for method, route in [
        ("GET", "/courses"),
        ("GET", "/assignments"),
        ("GET", "/summary"),
        ("PATCH", f"/assignments/{assignment['id']}"),
        ("DELETE", f"/courses/{course['id']}"),
        ("POST", "/schedule/generate"),
        ("PUT", "/schedule/settings"),
        ("POST", f"/assignments/{assignment['id']}/ai-suggestion"),
    ]:
        assert attacker.send(method, route, {} if method != "GET" else None).status_code in (
            401,
            403,
        )
    fresh = Client(app, register=False)
    for credentials in [
        {"email": "a@example.test", "password": "wrong"},
        {"email": "unknown@example.test", "password": "wrong"},
    ]:
        assert fresh.send("POST", "/auth/login", credentials).status_code == 401
        assert fresh.send("GET", "/auth/me").status_code == 401
    login = fresh.send(
        "POST", "/auth/login", {"email": "A@example.test", "password": "correct password 123"}
    )
    assert login.status_code == 200
    assert fresh.send("GET", "/auth/me").json["email"] == "a@example.test"
    assert fresh.client.get_cookie(COOKIE).value != old_cookie


def test_cookie_flags_csrf_reuse_expiry(app, client):
    response = client.send("GET", "/auth/csrf")
    assert response.json["csrf_token"] == client.token
    assert client.client.get_cookie(COOKIE).http_only
    assert client.client.get_cookie(COOKIE).same_site == "Lax"
    app.config["CLOCK"] = lambda: T0 + timedelta(hours=12)
    assert client.send("GET", "/auth/me").status_code == 401
    response = client.send("GET", "/auth/csrf")
    assert response.json["user"] is None


@pytest.mark.parametrize("mode", ["account", "ip"])
def test_tc26_independent_rate_limit_and_expiry(app, client, mode):
    for i in range(5):
        c = Client(app, ip=f"10.0.0.{i}" if mode == "account" else "10.1.1.1", register=False)
        email = "a@example.test" if mode == "account" else f"missing{i}@example.test"
        assert (
            c.send("POST", "/auth/login", {"email": email, "password": "incorrect"}).status_code
            == 401
        )
    c = Client(app, ip="10.9.9.9" if mode == "account" else "10.1.1.1", register=False)
    valid = {"email": "a@example.test", "password": "correct password 123"}
    assert c.send("POST", "/auth/login", valid).status_code == 429
    app.config["CLOCK"] = lambda: T0 + timedelta(minutes=15) - timedelta(seconds=1)
    assert c.send("POST", "/auth/login", valid).status_code == 429
    app.config["CLOCK"] = lambda: T0 + timedelta(minutes=15)
    assert c.send("POST", "/auth/login", valid).status_code == 200


def test_tc26_rolling_window_excludes_expired_failures(app, client):
    c = Client(app, ip="10.7.7.7", register=False)
    for _ in range(4):
        assert (
            c.send(
                "POST", "/auth/login", {"email": "a@example.test", "password": "wrong"}
            ).status_code
            == 401
        )
    app.config["CLOCK"] = lambda: T0 + timedelta(minutes=15)
    assert (
        c.send("POST", "/auth/login", {"email": "a@example.test", "password": "wrong"}).status_code
        == 401
    )
    assert (
        c.send(
            "POST", "/auth/login", {"email": "a@example.test", "password": "correct password 123"}
        ).status_code
        == 200
    )


def test_tc32_csrf_and_origin_matrix(client):
    course = client.course()
    assignment = client.assignment(course["id"])
    session = client.plan().json["sessions"][0]
    routes = [
        ("POST", "/auth/logout"),
        ("POST", "/auth/register"),
        ("POST", "/auth/login"),
        ("POST", "/courses"),
        ("PATCH", f"/courses/{course['id']}"),
        ("DELETE", f"/courses/{course['id']}"),
        ("POST", "/assignments"),
        ("PATCH", f"/assignments/{assignment['id']}"),
        ("DELETE", f"/assignments/{assignment['id']}"),
        ("POST", "/schedule/generate"),
        ("PUT", "/schedule/settings"),
        ("PATCH", f"/sessions/{session['id']}"),
        ("PUT", f"/assignments/{assignment['id']}/breakdown"),
        ("POST", f"/assignments/{assignment['id']}/ai-suggestion"),
    ]
    for method, route in routes:
        for headers in [
            {},
            {"X-CSRF-Token": "wrong"},
            {"X-CSRF-Token": client.token, "Origin": "https://evil.example"},
        ]:
            assert client.send(method, route, {}, headers=headers).status_code == 403
    assert len(client.send("GET", "/courses").json) == 1
    assert len(client.send("GET", "/assignments").json) == 1


@pytest.mark.parametrize(
    "credentials",
    [
        {"email": 123, "password": "a"},
        {"email": "x" * 255, "password": "a"},
        {"email": "a@example.test", "password": "x" * 129},
        {"email": "' OR 1=1 --", "password": "a"},
    ],
)
def test_tc29_tc30_malicious_login(app, credentials):
    c = Client(app, register=False)
    assert c.send("POST", "/auth/login", credentials).status_code == 401
    assert c.send("GET", "/auth/me").status_code == 401


def test_tc33_production_redirect_headers_configuration(app):
    app.config.update(PRODUCTION=True, PUBLIC_ORIGIN="https://studyflow.example.test")
    c = app.test_client()
    result = c.get("/api/health", base_url="http://hostile.example")
    assert result.status_code == 308
    assert result.headers["Location"].startswith("https://studyflow.example.test/")
    result = c.get("/api/health", base_url="https://studyflow.example.test")
    assert result.status_code == 200
    assert "max-age" in result.headers["Strict-Transport-Security"]
    assert "frame-ancestors 'none'" in result.headers["Content-Security-Policy"]


def test_production_proxy_secure_cookie_and_required_origin(app):
    from studyflow import create_app

    with pytest.raises(RuntimeError, match="HTTPS PUBLIC_ORIGIN"):
        create_app({"PRODUCTION": True, "PUBLIC_ORIGIN": ""})
    deployed = create_app(
        {
            "PRODUCTION": True,
            "PUBLIC_ORIGIN": "https://studyflow.example.test",
            "SQLALCHEMY_DATABASE_URI": app.config["SQLALCHEMY_DATABASE_URI"],
        }
    )
    client = deployed.test_client()
    response = client.get("/api/auth/csrf", headers={"X-Forwarded-Proto": "https"})
    assert response.status_code == 200
    assert "Secure" in response.headers["Set-Cookie"]
    assert "HttpOnly" in response.headers["Set-Cookie"]
