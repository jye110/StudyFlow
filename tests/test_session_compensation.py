from datetime import timedelta

import pytest
from sqlalchemy.exc import OperationalError

from studyflow.models import db
from studyflow.validation import iso
from tests.conftest import T0, Client
from tests.test_busy_times import once


@pytest.mark.parametrize("minutes", [15, 45, 75])
def test_resize_session_balances_remaining_estimate_without_reusing_released_time(client, minutes):
    assignment = client.assignment(client.course()["id"], estimated_minutes=90)
    first = client.plan().json["sessions"][0]
    result = client.send("PATCH", f"/sessions/{first['id']}", {"minutes": minutes})
    assert result.status_code == 200
    assert result.json["replanned"]["remaining_minutes"] == 0
    sessions = client.send("GET", "/schedule").json["sessions"]
    assert sum(s["minutes"] for s in sessions) == 90
    assert sessions[0]["id"] == first["id"] and sessions[0]["minutes"] == minutes
    resume = T0 + timedelta(minutes=max(30, minutes))
    assert all(s["starts_at"] >= iso(resume) for s in sessions if s["id"] != first["id"])
    assert client.send("GET", f"/assignments/{assignment['id']}").json["estimated_minutes"] == 90


def test_delete_session_compensates_later_and_does_not_delete_assignment(client):
    a = client.assignment(client.course()["id"])
    original = client.plan().json["sessions"]
    result = client.send("DELETE", f"/sessions/{original[0]['id']}")
    assert result.status_code == 200 and result.json["replanned"]["remaining_minutes"] == 0
    sessions = client.send("GET", "/schedule").json["sessions"]
    assert sum(s["minutes"] for s in sessions) == 60
    assert all(s["starts_at"] >= iso(T0 + timedelta(minutes=30)) for s in sessions)
    assert client.send("GET", f"/sessions/{original[0]['id']}").status_code == 404
    assert client.send("GET", f"/assignments/{a['id']}").status_code == 200


def test_resize_preserves_earlier_session_and_active_history(app, client):
    client.assignment(client.course()["id"], estimated_minutes=90)
    original = client.plan().json["sessions"]
    app.config["CLOCK"] = lambda: T0 + timedelta(minutes=15)
    result = client.send("PATCH", f"/sessions/{original[1]['id']}", {"minutes": 15})
    assert result.status_code == 200
    sessions = client.send("GET", "/schedule").json["sessions"]
    assert original[0] in sessions
    assert sum(s["minutes"] for s in sessions) == 90
    assert client.send("DELETE", f"/sessions/{original[0]['id']}").status_code == 422


def test_compensation_honors_busy_times_and_earliest_start(client):
    course = client.course()
    a = client.assignment(course["id"])
    b = client.assignment(course["id"], start_mode="custom", start_at=iso(T0 + timedelta(hours=2)))
    original = client.plan().json["sessions"]
    once(client, start=T0 + timedelta(minutes=30), end=T0 + timedelta(hours=1))
    result = client.send("PATCH", f"/sessions/{original[0]['id']}", {"minutes": 15})
    assert result.status_code == 200
    sessions = client.send("GET", "/schedule").json["sessions"]
    assert sum(s["minutes"] for s in sessions if s["assignment_id"] == a["id"]) == 60
    assert all(
        s["starts_at"] >= iso(T0 + timedelta(hours=1))
        for s in sessions
        if s["id"] != original[0]["id"]
    )
    assert all(
        s["starts_at"] >= iso(T0 + timedelta(hours=2))
        for s in sessions
        if s["assignment_id"] == b["id"]
    )
    assert not client.send("GET", "/schedule").json["conflicts"]


def test_compensation_reports_deadline_shortfall_instead_of_scheduling_late(client):
    client.assignment(
        client.course()["id"], estimated_minutes=30, due_at=iso(T0 + timedelta(minutes=30))
    )
    first = client.plan().json["sessions"][0]
    response = client.send("DELETE", f"/sessions/{first['id']}")
    assert response.status_code == 200
    assert response.json["replanned"]["remaining_minutes"] == 30
    schedule = client.send("GET", "/schedule").json
    assert schedule["sessions"] == [] and schedule["unallocated"][0]["minutes"] == 30


def test_compensation_reuses_saved_study_settings(client):
    client.assignment(client.course()["id"], due_at=iso(T0 + timedelta(days=7)))
    settings = {
        "timezone": "America/Los_Angeles",
        "start_hour": 18,
        "daily_minutes": 90,
        "horizon_days": 14,
    }
    first = client.send("POST", "/schedule/generate", settings).json["sessions"][0]
    assert client.send("GET", "/schedule").json["settings"] == {**settings, "end_hour": 22}
    result = client.send("PATCH", f"/sessions/{first['id']}", {"minutes": 15})
    assert result.status_code == 200 and result.json["replanned"]["remaining_minutes"] == 0
    sessions = client.send("GET", "/schedule").json["sessions"]
    assert [s["starts_at"] for s in sessions] == [
        "2026-09-11T01:00:00Z",
        "2026-09-11T01:30:00Z",
        "2026-09-11T02:00:00Z",
    ]


def test_compensation_transaction_rolls_back_edit_and_later_replan(app, client, monkeypatch):
    client.assignment(client.course()["id"])
    original = client.plan().json["sessions"]

    def fail():
        raise OperationalError("injected", {}, Exception("failure"))

    with monkeypatch.context() as patch:
        patch.setattr(db.session, "commit", fail)
        assert (
            client.send("PATCH", f"/sessions/{original[0]['id']}", {"minutes": 45}).status_code
            == 503
        )
    assert client.send("GET", "/schedule").json["sessions"] == original


def test_compensation_is_owner_scoped_and_csrf_protected(app, client):
    client.assignment(client.course()["id"])
    first = client.plan().json["sessions"][0]
    other = Client(app, email="session-owner@example.test")
    assert other.send("DELETE", f"/sessions/{first['id']}").status_code == 404
    assert client.send("DELETE", f"/sessions/{first['id']}", headers={}).status_code == 403
    assert client.send("GET", f"/sessions/{first['id']}").status_code == 200


def test_compensation_rejects_overlapping_an_earlier_session(client):
    client.assignment(client.course()["id"])
    original = client.plan().json["sessions"]
    response = client.send(
        "PATCH", f"/sessions/{original[1]['id']}", {"starts_at": iso(T0 + timedelta(minutes=15))}
    )
    assert response.status_code == 422
    assert client.send("GET", "/schedule").json["sessions"] == original
