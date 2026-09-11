from datetime import timedelta

import pytest

from studyflow.models import StudySession, db
from studyflow.scheduler import generate_plan
from studyflow.validation import iso
from tests.conftest import T0
from tests.test_scheduler import task


@pytest.mark.parametrize("mode", ["now", "week_before", "custom"])
def test_start_modes_leave_earlier_slots_for_other_work(mode):
    delayed = task(1, minutes=60, hours=24 * 14)
    delayed.update(start_mode=mode, start_at=T0 + timedelta(days=7))
    other = task(2, minutes=60, hours=24 * 15)
    plan = generate_plan([delayed, other], T0, daily_minutes=60)
    by_id = {key: [s for s in plan["sessions"] if s["assignment_id"] == key] for key in (1, 2)}
    assert by_id[1][0]["starts_at"] == T0 + (
        timedelta(hours=1) if mode == "now" else timedelta(days=7)
    )
    assert by_id[2][0]["starts_at"] == T0 + timedelta(days=1 if mode == "now" else 0)
    assert not plan["unscheduled"]
    slots = [s["starts_at"] for s in plan["sessions"]]
    assert len(slots) == len(set(slots))


@pytest.mark.parametrize("start", [T0 - timedelta(days=1), T0])
def test_past_start_uses_now(start):
    work = {**task(), "start_mode": "custom", "start_at": start}
    assert generate_plan([work], T0)["sessions"][0]["starts_at"] == T0
    work["start_mode"] = "week_before"
    assert generate_plan([work], T0)["sessions"][0]["starts_at"] == T0


def test_start_boundary_and_insufficient_time_never_schedule_early():
    work = {
        **task(minutes=62),
        "start_mode": "custom",
        "start_at": T0 + timedelta(minutes=30, seconds=1),
        "due_at": T0 + timedelta(minutes=60),
    }
    plan = generate_plan([work], T0)
    assert plan["sessions"] == [
        {"assignment_id": 1, "starts_at": T0 + timedelta(minutes=31), "minutes": 29}
    ]
    assert plan["unscheduled"][0]["minutes"] == 33
    assert "earliest start" in plan["unscheduled"][0]["reason"]
    work.update(start_at=T0 + timedelta(days=14), due_at=T0 + timedelta(days=15))
    plan = generate_plan([work], T0, horizon_days=7)
    assert plan["sessions"] == []
    assert plan["unscheduled"][0]["minutes"] == 62


@pytest.mark.parametrize(
    "changes,field",
    [
        ({"start_mode": "unknown"}, "start_mode"),
        ({"start_mode": "custom"}, "start_at"),
        ({"start_mode": "custom", "start_at": "bad"}, "start_at"),
        ({"start_mode": "custom", "start_at": "2026-09-10T09:00:00"}, "start_at"),
        ({"start_mode": "custom", "start_at": "2026-09-12T00:00:00Z"}, "start_at"),
    ],
)
def test_invalid_start_updates_are_atomic(client, changes, field):
    assignment = client.assignment(client.course()["id"], start_mode="now")
    path = f"/assignments/{assignment['id']}"
    response = client.send("PATCH", path, {"title": "Must not persist", **changes})
    assert response.status_code == 422
    assert field in response.json["fields"]
    assert client.send("GET", path).json == assignment


def test_custom_start_persists_normalizes_timezone_and_can_be_cleared(client):
    assignment = client.assignment(
        client.course()["id"],
        start_mode="custom",
        start_at="2026-09-10T10:00:00-07:00",
        due_at="2026-09-24T23:00:00Z",
    )
    path = f"/assignments/{assignment['id']}"
    assert client.send("GET", path).json["start_at"] == "2026-09-10T17:00:00Z"
    plan = client.plan().json
    assert all(s["starts_at"] >= "2026-09-10T17:00:00Z" for s in plan["sessions"])
    before = client.send("GET", path).json
    assert client.send("PATCH", path, {"due_at": iso(T0)}).status_code == 422
    assert client.send("GET", path).json == before
    result = client.send("PATCH", path, {"start_mode": "now"})
    assert result.json["start_at"] is None
    assert client.plan().json["sessions"][0]["starts_at"] == iso(T0 + timedelta(hours=1))


def test_relative_start_follows_deadline_and_rejects_early_manual_move(client):
    assignment = client.assignment(
        client.course()["id"], start_mode="week_before", due_at=iso(T0 + timedelta(days=14))
    )
    plan = client.plan().json
    assert plan["sessions"][0]["starts_at"] == iso(T0 + timedelta(days=7))
    session = plan["sessions"][0]
    response = client.send("PATCH", f"/sessions/{session['id']}", {"starts_at": iso(T0)})
    assert response.status_code == 422
    assert "starts_at" in response.json["fields"]
    assert client.send("GET", f"/sessions/{session['id']}").json == session
    client.send(
        "PATCH", f"/assignments/{assignment['id']}", {"due_at": iso(T0 + timedelta(days=21))}
    )
    assert client.send("GET", "/schedule").json["sessions"] == []
    assert client.plan().json["sessions"][0]["starts_at"] == iso(T0 + timedelta(days=14))


def test_later_start_removes_only_conflicting_future_sessions_and_preserves_history(app, client):
    course = client.course()
    assignment = client.assignment(course["id"], due_at=iso(T0 + timedelta(days=14)))
    other = client.assignment(course["id"], title="Other work")
    with app.app_context():
        db.session.add(
            StudySession(
                assignment_id=assignment["id"], starts_at=T0 - timedelta(hours=1), minutes=30
            )
        )
        db.session.commit()
    client.plan()
    path = f"/assignments/{assignment['id']}"
    assert (
        client.send(
            "PATCH", path, {"start_mode": "custom", "start_at": iso(T0 + timedelta(days=7))}
        ).status_code
        == 200
    )
    schedule = client.send("GET", "/schedule").json
    own = [s for s in schedule["sessions"] if s["assignment_id"] == assignment["id"]]
    assert len(own) == 1 and own[0]["starts_at"] < iso(T0)
    assert len([s for s in schedule["sessions"] if s["assignment_id"] == other["id"]]) == 2
    assert schedule["unallocated"] == [
        {"assignment_id": assignment["id"], "title": assignment["title"], "minutes": 30}
    ]
    plan = client.plan().json
    assert (
        sum(s["minutes"] for s in plan["sessions"] if s["assignment_id"] == assignment["id"]) == 60
    )
