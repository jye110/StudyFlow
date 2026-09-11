import os
from datetime import datetime

import pytest
from flask_migrate import upgrade

from studyflow import create_app
from studyflow.models import db

T0 = datetime(2026, 9, 10, 9)


@pytest.fixture
def app(tmp_path):
    # TEST_DATABASE_URL must point to a disposable database; the fixture resets its schema.
    uri = os.environ.get("TEST_DATABASE_URL", "sqlite:///" + str(tmp_path / "test.db"))
    application = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": uri,
            "CLOCK": lambda: T0,
            "OPENAI_API_KEY": "",
            "OPENAI_MODEL": "",
            "PRODUCTION": False,
        }
    )
    with application.app_context():
        if os.environ.get("TEST_DATABASE_URL"):
            db.drop_all()
            db.session.execute(db.text("DROP TABLE IF EXISTS alembic_version"))
            db.session.commit()
        upgrade()
    yield application
    with application.app_context():
        db.session.remove()
        db.engine.dispose()


class Client:
    def __init__(self, app, email="a@example.test", ip="127.0.0.1", register=True):
        self.client = app.test_client()
        self.ip = ip
        self.token = self.client.get("/api/auth/csrf").json["csrf_token"]
        if register:
            result = self.send(
                "POST",
                "/auth/register",
                {"name": "Student A", "email": email, "password": "correct password 123"},
            )
            assert result.status_code == 201, result.json
            self.token = result.json["csrf_token"]

    def send(self, method, path, data=None, **kwargs):
        result = self.client.open(
            "/api" + path,
            method=method,
            json=data,
            headers=kwargs.pop("headers", {"X-CSRF-Token": self.token}),
            environ_overrides={"REMOTE_ADDR": self.ip},
            **kwargs,
        )
        if result.is_json and isinstance(result.json, dict) and result.json.get("csrf_token"):
            self.token = result.json["csrf_token"]
        return result

    def course(self, **kwargs):
        result = self.send(
            "POST",
            "/courses",
            {"name": "Software Engineering", "code": "CS 2101", "color": "#2563eb", **kwargs},
        )
        assert result.status_code == 201, result.json
        return result.json

    def assignment(self, course_id, **kwargs):
        result = self.send(
            "POST",
            "/assignments",
            {
                "course_id": course_id,
                "title": "Review requirements",
                "notes": "",
                "due_at": "2026-09-11T09:00:00Z",
                "estimated_minutes": 60,
                "priority": "High",
                "status": "Not Started",
                # General fixtures allow immediate study; one-hour-default tests omit this explicitly.
                "start_mode": "custom",
                "start_at": "2026-09-10T09:00:00Z",
                **kwargs,
            },
        )
        assert result.status_code == 201, result.json
        return result.json

    def plan(self):
        return self.send(
            "POST",
            "/schedule/generate",
            {"timezone": "UTC", "start_hour": 9, "daily_minutes": 180, "horizon_days": 30},
        )


@pytest.fixture
def client(app):
    return Client(app)
