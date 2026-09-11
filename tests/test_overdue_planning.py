from datetime import timedelta

from studyflow.scheduler import generate_plan
from studyflow.validation import iso
from tests.conftest import T0
from tests.test_busy_times import SETTINGS, once
from tests.test_scheduler import task


def test_low_priority_overdue_beats_high_priority_upcoming_and_reports_capacity():
    work = [task(1, 30, 24, "High"), task(2, 62, -24, "Low")]
    plan = generate_plan(work, T0, daily_minutes=60, horizon_days=1)
    assert [s["assignment_id"] for s in plan["sessions"]] == [2, 2]
    assert [s["minutes"] for s in plan["sessions"]] == [30, 30]
    assert [(a["assignment_id"], a["minutes"]) for a in plan["unscheduled"]] == [(2, 2), (1, 30)]
    assert "overdue work" in plan["unscheduled"][0]["reason"]


def test_overdue_order_stays_deterministic_and_completed_work_is_excluded():
    plan = generate_plan(
        [
            task(5, 30, 24, "High"),
            task(4, 30, -24, "Low"),
            task(3, 30, -24, "High"),
            task(2, 30, -24, "High"),
            task(1, 30, -48, "Low"),
            task(6, 30, -72, status="Completed"),
        ],
        T0,
    )
    assert [s["assignment_id"] for s in plan["sessions"]] == [1, 2, 3, 4, 5]


def test_overdue_still_respects_start_preferences_busy_time_and_history_credit():
    overdue = {**task(1, 62, -24), "start_mode": "custom", "start_at": T0 + timedelta(hours=1)}
    plan = generate_plan(
        [overdue, task(2, 30, 24)],
        T0,
        credited={1: 30},
        occupied=[(T0 + timedelta(hours=1), T0 + timedelta(hours=2))],
    )
    sessions = [s for s in plan["sessions"] if s["assignment_id"] == 1]
    assert [s["minutes"] for s in sessions] == [30, 2]
    assert sessions[0]["starts_at"] == T0 + timedelta(hours=2)
    assert next(s for s in plan["sessions"] if s["assignment_id"] == 2)["starts_at"] == T0
    assert not plan["unscheduled"]


def test_exact_deadline_is_not_overdue_until_it_passes():
    work = task(minutes=1, hours=0)
    assert generate_plan([work], T0)["sessions"] == []
    assert generate_plan([work], T0 + timedelta(seconds=1))["sessions"][0][
        "starts_at"
    ] == T0 + timedelta(minutes=1)


def test_api_overdue_can_generate_edit_and_repair_without_changing_due_date(client):
    course = client.course()
    client.assignment(course["id"], title="Upcoming", priority="High")
    overdue = client.assignment(
        course["id"], title="Overdue", priority="Low", due_at=iso(T0 - timedelta(days=1))
    )
    original = client.plan().json["sessions"]
    assert [s["assignment_id"] for s in original[:2]] == [overdue["id"]] * 2
    path = f"/sessions/{original[0]['id']}"
    result = client.send("PATCH", path, {"starts_at": iso(T0 + timedelta(hours=2))})
    assert result.status_code == 200
    after_edit = client.send("GET", "/schedule").json["sessions"]
    once(client, start=T0 + timedelta(hours=2), end=T0 + timedelta(hours=3))
    response = client.send("PATCH", path, {"starts_at": iso(T0 + timedelta(hours=2, minutes=15))})
    assert response.status_code == 422
    conflicts = client.send("GET", "/schedule").json["conflicts"]
    repaired = client.send("POST", "/schedule/repair-conflicts", SETTINGS)
    assert repaired.status_code == 200 and not repaired.json["unallocated"]
    for kept in after_edit:
        if kept["id"] not in conflicts:
            assert kept in repaired.json["sessions"]
    assignment = client.send("GET", f"/assignments/{overdue['id']}").json
    assert assignment["due_at"] == overdue["due_at"] and assignment["overdue"] is True
    assert client.send("GET", "/summary").json["overdue_count"] == 1


def test_overdue_custom_start_can_be_future_and_remains_a_constraint(client):
    a = client.assignment(
        client.course()["id"],
        due_at=iso(T0 - timedelta(days=1)),
        start_mode="custom",
        start_at=iso(T0 + timedelta(days=2)),
    )
    plan = client.plan().json
    assert plan["sessions"][0]["starts_at"] == iso(T0 + timedelta(days=2))
    session = plan["sessions"][0]
    assert (
        client.send("PATCH", f"/sessions/{session['id']}", {"starts_at": iso(T0)}).status_code
        == 422
    )
    path = f"/assignments/{a['id']}"
    assert client.send("PATCH", path, {"due_at": iso(T0 + timedelta(days=1))}).status_code == 422
    assert client.send("GET", path).json["due_at"] == a["due_at"]
