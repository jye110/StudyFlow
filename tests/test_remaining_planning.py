from datetime import timedelta

from sqlalchemy.exc import OperationalError

from studyflow.models import db
from studyflow.validation import iso
from tests.conftest import T0, Client
from tests.test_busy_times import once

SETTINGS = {"timezone": "UTC", "start_hour": 9, "daily_minutes": 180, "horizon_days": 30}


def fill(client, **settings):
    return client.send("POST", "/schedule/fill-remaining", {**SETTINGS, **settings})


def test_reducing_estimate_trims_latest_sessions_and_preserves_other_work(client):
    course = client.course()
    a = client.assignment(course["id"], estimated_minutes=90)
    b = client.assignment(course["id"])
    original = client.plan().json["sessions"]
    result = client.send("PATCH", f"/assignments/{a['id']}", {"estimated_minutes": 45})
    assert result.status_code == 200
    schedule = client.send("GET", "/schedule").json
    target = [s for s in schedule["sessions"] if s["assignment_id"] == a["id"]]
    assert target == [original[0], {**original[1], "minutes": 15}]
    assert [s for s in schedule["sessions"] if s["assignment_id"] == b["id"]] == original[3:]
    assert schedule["unallocated"] == []


def test_estimate_below_started_minutes_keeps_history_and_removes_future(app, client):
    a = client.assignment(client.course()["id"], estimated_minutes=90)
    original = client.plan().json["sessions"]
    app.config["CLOCK"] = lambda: T0 + timedelta(minutes=15)
    assert (
        client.send("PATCH", f"/assignments/{a['id']}", {"estimated_minutes": 20}).status_code
        == 200
    )
    assert client.send("GET", "/schedule").json["sessions"] == [original[0]]
    assert fill(client).json["sessions"] == [original[0]]


def test_reduction_and_later_start_share_one_consistent_adjustment(client):
    a = client.assignment(client.course()["id"], estimated_minutes=90)
    original = client.plan().json["sessions"]
    response = client.send(
        "PATCH",
        f"/assignments/{a['id']}",
        {
            "estimated_minutes": 45,
            "start_mode": "custom",
            "start_at": iso(T0 + timedelta(minutes=30)),
        },
    )
    assert response.status_code == 200
    assert client.send("GET", "/schedule").json["sessions"] == [
        original[1],
        {**original[2], "minutes": 15},
    ]


def test_increase_then_fill_preserves_existing_sessions_and_is_idempotent(client):
    a = client.assignment(client.course()["id"], estimated_minutes=45)
    original = client.plan().json["sessions"]
    assert (
        client.send("PATCH", f"/assignments/{a['id']}", {"estimated_minutes": 107}).status_code
        == 200
    )
    before = client.send("GET", "/schedule").json
    assert before["sessions"] == original
    assert before["unallocated"][0]["minutes"] == 62
    result = fill(client)
    assert result.status_code == 200
    assert result.json["unallocated"] == []
    assert result.json["sessions"][:2] == original
    assert sum(s["minutes"] for s in result.json["sessions"]) == 107
    assert fill(client).json == result.json
    assert client.send("GET", "/schedule").json["settings"] == {**SETTINGS, "end_hour": 22}


def test_fill_respects_busy_start_dates_and_overdue_priority_without_moving_existing(client):
    course = client.course()
    client.assignment(course["id"], estimated_minutes=30)
    original = client.plan().json["sessions"]
    upcoming = client.assignment(course["id"], estimated_minutes=30)
    overdue = client.assignment(
        course["id"], estimated_minutes=30, due_at=iso(T0 - timedelta(days=1))
    )
    later = client.assignment(
        course["id"],
        estimated_minutes=30,
        start_mode="custom",
        start_at=iso(T0 + timedelta(hours=2)),
    )
    once(client, start=T0 + timedelta(minutes=30), end=T0 + timedelta(hours=1))
    result = fill(client).json
    assert not result["unallocated"]
    assert original[0] in result["sessions"]
    added = [s for s in result["sessions"] if s["id"] != original[0]["id"]]
    assert [s["assignment_id"] for s in added] == [overdue["id"], upcoming["id"], later["id"]]
    assert [s["starts_at"] for s in added] == [
        iso(T0 + timedelta(hours=1)),
        iso(T0 + timedelta(minutes=90)),
        iso(T0 + timedelta(hours=2)),
    ]


def test_fill_does_not_repair_existing_conflicts_and_reports_remaining_capacity(client):
    course = client.course()
    client.assignment(course["id"], estimated_minutes=30)
    original = client.plan().json["sessions"]
    a = client.assignment(course["id"], due_at=iso(T0 + timedelta(minutes=45)))
    once(client, start=T0, end=T0 + timedelta(minutes=30))
    result = fill(client).json
    assert original[0] in result["sessions"]
    assert result["unallocated"][0]["assignment_id"] == a["id"]
    assert result["unallocated"][0]["minutes"] == 45
    assert client.send("GET", "/schedule").json["conflicts"] == [original[0]["id"]]


def test_fill_owner_scope_csrf_and_validation(app, client):
    client.assignment(client.course()["id"])
    original = client.plan().json["sessions"]
    other = Client(app, email="fill-owner@example.test")
    other.assignment(other.course()["id"])
    assert fill(other).status_code == 200
    assert client.send("GET", "/schedule").json["sessions"] == original
    assert client.send("POST", "/schedule/fill-remaining", SETTINGS, headers={}).status_code == 403
    assert fill(client, daily_minutes=0).status_code == 422
    assert client.send("GET", "/schedule").json["sessions"] == original


def test_estimate_and_fill_rollback_on_transaction_failure(client, monkeypatch):
    a = client.assignment(client.course()["id"], estimated_minutes=90)
    original = client.plan().json["sessions"]

    def fail():
        raise OperationalError("injected", {}, Exception("failure"))

    with monkeypatch.context() as patch:
        patch.setattr(db.session, "commit", fail)
        assert (
            client.send("PATCH", f"/assignments/{a['id']}", {"estimated_minutes": 45}).status_code
            == 503
        )
    assert client.send("GET", f"/assignments/{a['id']}").json["estimated_minutes"] == 90
    assert client.send("GET", "/schedule").json["sessions"] == original
    client.assignment(a["course_id"])
    with monkeypatch.context() as patch:
        patch.setattr(db.session, "commit", fail)
        assert fill(client).status_code == 503
    assert client.send("GET", "/schedule").json["sessions"] == original
