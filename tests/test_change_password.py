from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.security import check_password_hash

from studyflow.auth import COOKIE
from studyflow.models import User, db
from tests.conftest import T0, Client

OLD = "correct password 123"
NEW = "a different password 456"
PAYLOAD = {"current_password": OLD, "new_password": NEW, "confirm_password": NEW}


def login(client, secret):
    return client.send("POST", "/auth/login", {"email": "a@example.test", "password": secret})


def test_change_rotates_session_revokes_other_devices_and_preserves_data(app, client):
    course = client.course()
    second = Client(app, register=False)
    assert login(second, OLD).status_code == 200
    other_user = Client(app, email="other@example.test")
    cookie, token = client.client.get_cookie(COOKIE).value, client.token
    response = client.send("POST", "/auth/change-password", PAYLOAD)
    assert response.status_code == 200
    assert OLD not in response.get_data(as_text=True) and NEW not in response.get_data(as_text=True)
    assert client.token != token and client.client.get_cookie(COOKIE).value != cookie
    assert client.send("GET", "/courses").json[0]["id"] == course["id"]
    assert second.send("GET", "/auth/me").status_code == 401
    assert other_user.send("GET", "/auth/me").status_code == 200
    replay = Client(app, register=False)
    replay.client.set_cookie(COOKIE, cookie)
    assert replay.send("GET", "/auth/me").status_code == 401
    assert (
        client.send(
            "POST", "/courses", {"name": "After change"}, headers={"X-CSRF-Token": token}
        ).status_code
        == 403
    )
    fresh = Client(app, register=False)
    assert login(fresh, OLD).status_code == 401
    assert login(fresh, NEW).status_code == 200
    with app.app_context():
        user = db.session.scalar(select(User).where(User.email == "a@example.test"))
        assert check_password_hash(user.password_hash, NEW)


@pytest.mark.parametrize(
    "updates,status",
    [
        ({"current_password": "wrong password"}, 400),
        ({"new_password": "short"}, 422),
        ({"new_password": "x" * 129}, 422),
        ({"confirm_password": "does not match"}, 422),
        ({"new_password": OLD, "confirm_password": OLD}, 422),
        ({"user_id": 999}, 422),
        ({"current_password": None}, 422),
    ],
)
def test_invalid_change_leaves_credentials_and_session_unchanged(app, client, updates, status):
    cookie = client.client.get_cookie(COOKIE).value
    assert (
        client.send("POST", "/auth/change-password", {**PAYLOAD, **updates}).status_code == status
    )
    assert client.client.get_cookie(COOKIE).value == cookie
    assert client.send("GET", "/auth/me").status_code == 200
    assert login(Client(app, register=False), OLD).status_code == 200


def test_password_change_requires_auth_csrf_and_allowed_origin(app, client):
    anonymous = Client(app, register=False)
    assert anonymous.send("POST", "/auth/change-password", PAYLOAD).status_code == 401
    assert client.send("POST", "/auth/change-password", PAYLOAD, headers={}).status_code == 403
    assert (
        client.send(
            "POST",
            "/auth/change-password",
            PAYLOAD,
            headers={"X-CSRF-Token": client.token, "Origin": "https://untrusted.example"},
        ).status_code
        == 403
    )


def test_wrong_current_password_is_rate_limited(app, client):
    for _ in range(5):
        assert (
            client.send(
                "POST", "/auth/change-password", {**PAYLOAD, "current_password": "wrong password"}
            ).status_code
            == 400
        )
    assert client.send("POST", "/auth/change-password", PAYLOAD).status_code == 429
    app.config["CLOCK"] = lambda: T0 + timedelta(minutes=16)
    assert client.send("POST", "/auth/change-password", PAYLOAD).status_code == 200


def test_commit_failure_rolls_back_password_and_revocation(app, client, monkeypatch):
    second = Client(app, register=False)
    assert login(second, OLD).status_code == 200
    with monkeypatch.context() as patch:

        def fail():
            raise SQLAlchemyError("simulated commit failure")

        patch.setattr(db.session, "commit", fail)
        assert client.send("POST", "/auth/change-password", PAYLOAD).status_code == 503
    assert second.send("GET", "/auth/me").status_code == 200
    assert login(Client(app, register=False), OLD).status_code == 200
