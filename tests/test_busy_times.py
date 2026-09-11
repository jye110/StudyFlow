from datetime import datetime, timedelta

import pytest

from studyflow.availability import busy_intervals
from studyflow.models import StudySession, db
from studyflow.scheduler import generate_plan
from studyflow.validation import iso
from tests.conftest import T0, Client
from tests.test_scheduler import task

SETTINGS = {"timezone": "UTC", "start_hour": 9, "daily_minutes": 180, "horizon_days": 30}


def once(client, start=T0, end=T0 + timedelta(minutes=30), **changes):
    response = client.send(
        "POST",
        "/busy-times",
        {
            "kind": "once",
            "name": "Lunch",
            "starts_at": iso(start),
            "ends_at": iso(end),
            **changes,
        },
    )
    assert response.status_code == 201, response.json
    return response.json


def weekly(**changes):
    return {
        "kind": "weekly",
        "weekdays": [3, 4],
        "start_time": "09:30",
        "end_time": "10:30",
        "timezone": "UTC",
        **changes,
    }


def test_once_weekly_and_overlapping_rules_preserve_exact_available_minutes():
    rules = [
        weekly(),
        {
            "kind": "once",
            "starts_at": T0 + timedelta(minutes=15),
            "ends_at": T0 + timedelta(minutes=45),
        },
    ]
    occupied = busy_intervals(rules, T0, T0 + timedelta(days=1))
    assert occupied == [(T0 + timedelta(minutes=15), T0 + timedelta(minutes=90))]
    plan = generate_plan([task(minutes=180)], T0, horizon_days=1, occupied=occupied)
    assert [s["minutes"] for s in plan["sessions"]] == [15, 30, 30, 30, 30, 30, 15]
    assert plan["unscheduled"] == []
    assert plan["sessions"][1]["starts_at"] == T0 + timedelta(minutes=90)


def test_busy_seconds_and_touching_boundaries():
    occupied = [
        (T0 - timedelta(minutes=5), T0),
        (T0 + timedelta(seconds=30), T0 + timedelta(seconds=45)),
    ]
    plan = generate_plan([task(minutes=1)], T0, occupied=occupied)
    assert plan["sessions"][0]["starts_at"] == T0 + timedelta(minutes=1)


def test_weekly_overnight_matches_the_start_weekday():
    start = datetime(2026, 9, 11, 0)
    rule = weekly(weekdays=[3], start_time="23:00", end_time="01:00")
    assert busy_intervals([rule], start, start + timedelta(hours=2)) == [
        (start - timedelta(hours=1), start + timedelta(hours=1))
    ]
    assert not busy_intervals([rule], start + timedelta(days=1), start + timedelta(days=1, hours=2))


def test_weekly_dst_repeated_hour_and_nonexistent_hour():
    rule = weekly(
        weekdays=[6], start_time="01:15", end_time="01:45", timezone="America/Los_Angeles"
    )
    assert busy_intervals([rule], datetime(2026, 11, 1), datetime(2026, 11, 2)) == [
        (datetime(2026, 11, 1, 8, 15), datetime(2026, 11, 1, 9, 45))
    ]
    rule.update(start_time="02:15", end_time="04:00")
    assert busy_intervals([rule], datetime(2026, 3, 8), datetime(2026, 3, 9)) == [
        (datetime(2026, 3, 8, 10, 15), datetime(2026, 3, 8, 11))
    ]


def test_busy_crud_defaults_and_ownership(app, client):
    record = once(client, name="")
    assert record["name"] == "" and record["weekdays"] == []
    path = f"/busy-times/{record['id']}"
    other = Client(app, email="other-busy@example.test")
    assert other.send("GET", "/busy-times").json == []
    for method in ("GET", "PATCH", "DELETE"):
        assert (
            other.send(
                method, path, {"name": "Intrusion"} if method == "PATCH" else None
            ).status_code
            == 404
        )
    updated = client.send("PATCH", path, weekly(weekdays=[4, 3, 3])).json
    assert updated["weekdays"] == [3, 4] and updated["starts_at"] is None
    assert client.send("GET", path).json == updated
    assert client.send("GET", "/schedule").json["busy_times"] == [updated]
    assert client.send("POST", "/busy-times", weekly(), headers={}).status_code == 403
    assert client.send("DELETE", path).status_code == 204
    assert client.send("GET", "/busy-times").json == []


@pytest.mark.parametrize(
    "changes,field",
    [
        ({"kind": "monthly"}, "kind"),
        ({"ends_at": iso(T0)}, "ends_at"),
        ({"starts_at": "2026-09-10T09:00:00"}, "starts_at"),
        ({"name": "x" * 121}, "name"),
        ({"timezone": "Mars/Orbit"}, "timezone"),
        ({**weekly(), "weekdays": []}, "weekdays"),
        ({**weekly(), "weekdays": [True]}, "weekdays"),
        ({**weekly(), "weekdays": [7]}, "weekdays"),
        ({**weekly(), "start_time": "24:00"}, "start_time"),
        ({**weekly(), "end_time": "09:30"}, "end_time"),
    ],
)
def test_invalid_busy_edit_is_atomic(client, changes, field):
    record = once(client)
    path = f"/busy-times/{record['id']}"
    response = client.send("PATCH", path, {"name": "Do not save", **changes})
    assert response.status_code == 422
    assert field in response.json["fields"]
    assert client.send("GET", path).json == record


def test_generation_respects_busy_and_manual_edit_cannot_override(client):
    client.assignment(client.course()["id"])
    once(client)
    response = client.send("POST", "/busy-times", weekly())
    assert response.status_code == 201
    plan = client.plan().json
    assert plan["sessions"][0]["starts_at"] == iso(T0 + timedelta(minutes=90))
    session = plan["sessions"][0]
    response = client.send("PATCH", f"/sessions/{session['id']}", {"starts_at": iso(T0)})
    assert response.status_code == 422 and "starts_at" in response.json["fields"]
    assert client.send("GET", f"/sessions/{session['id']}").json == session
    assert client.send("GET", "/schedule").json["conflicts"] == []


def test_repair_only_conflicts_preserves_other_sessions_and_ignores_other_backlog(client):
    course = client.course()
    client.assignment(course["id"])
    client.assignment(course["id"], title="Other scheduled work")
    original = client.plan().json["sessions"]
    client.assignment(course["id"], title="Not scheduled yet")
    once(client)
    snapshot = client.send("GET", "/schedule").json
    assert snapshot["sessions"] == original
    assert snapshot["conflicts"] == [original[0]["id"]]
    repaired = client.send("POST", "/schedule/repair-conflicts", SETTINGS).json
    assert not repaired["unallocated"]
    assert len(repaired["sessions"]) == len(original)
    for kept in original[1:]:
        assert kept in repaired["sessions"]
    new = [s for s in repaired["sessions"] if s["id"] not in {s["id"] for s in original[1:]}]
    assert len(new) == 1 and new[0]["starts_at"] == iso(T0 + timedelta(hours=2))
    assert client.send("GET", "/schedule").json["conflicts"] == []
    assert (
        client.send("POST", "/schedule/repair-conflicts", SETTINGS).json["sessions"]
        == repaired["sessions"]
    )


def test_repair_shortfall_is_unallocated_and_no_conflicting_slot_is_reused(client):
    client.assignment(client.course()["id"], due_at=iso(T0 + timedelta(hours=2)))
    client.plan()
    once(client, end=T0 + timedelta(hours=2))
    response = client.send("POST", "/schedule/repair-conflicts", SETTINGS)
    assert response.status_code == 200
    assert response.json["sessions"] == []
    assert response.json["unallocated"][0]["minutes"] == 60
    assert client.send("GET", "/schedule").json["unallocated"][0]["minutes"] == 60


def test_active_conflicts_and_history_are_preserved(app, client):
    a = client.assignment(client.course()["id"])
    with app.app_context():
        db.session.add(
            StudySession(assignment_id=a["id"], starts_at=T0 - timedelta(minutes=15), minutes=30)
        )
        db.session.commit()
    once(client, start=T0 - timedelta(hours=1), end=T0 + timedelta(hours=1))
    snapshot = client.send("GET", "/schedule").json
    assert snapshot["active_conflicts"] == [snapshot["sessions"][0]["id"]]
    assert not snapshot["conflicts"]
    assert (
        client.send("POST", "/schedule/repair-conflicts", SETTINGS).json["sessions"]
        == snapshot["sessions"]
    )


def test_busy_rules_respect_earliest_start_and_other_users_do_not_block(app, client):
    client.assignment(
        client.course()["id"], start_mode="custom", start_at=iso(T0 + timedelta(hours=1))
    )
    other = Client(app, email="private-calendar@example.test")
    once(other, end=T0 + timedelta(days=10))
    once(client, start=T0 + timedelta(hours=1), end=T0 + timedelta(hours=2))
    sessions = client.plan().json["sessions"]
    assert sessions[0]["starts_at"] == iso(T0 + timedelta(hours=2))
