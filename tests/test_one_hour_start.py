from datetime import timedelta

import pytest

from studyflow.scheduler import generate_plan
from studyflow.validation import iso
from tests.conftest import T0
from tests.test_busy_times import once
from tests.test_scheduler import task

SETTINGS = {"timezone": "UTC", "start_hour": 9, "daily_minutes": 180, "horizon_days": 2}


@pytest.mark.parametrize("explicit", [True, False])
def test_one_hour_default_rounds_up_without_losing_buffer(explicit):
    work = task()
    work.pop("start_mode")
    if explicit:
        work["start_mode"] = "now"
    instant = T0 + timedelta(seconds=15)
    plan = generate_plan([work], instant)
    assert plan["sessions"][0]["starts_at"] == T0 + timedelta(hours=1, minutes=1)


def test_buffer_never_overrides_deadline_but_overdue_work_can_wait():
    work = {**task(minutes=30), "start_mode": "now", "due_at": T0 + timedelta(minutes=45)}
    plan = generate_plan([work], T0)
    assert not plan["sessions"] and plan["unscheduled"][0]["minutes"] == 30
    work["due_at"] = T0 - timedelta(minutes=1)
    assert generate_plan([work], T0)["sessions"][0]["starts_at"] == T0 + timedelta(hours=1)


def create_default(client):
    response = client.send(
        "POST",
        "/assignments",
        {
            "course_id": client.course()["id"],
            "title": "Leave some breathing room",
            "estimated_minutes": 60,
            "due_at": iso(T0 + timedelta(days=2)),
            "priority": "High",
            "status": "Not Started",
        },
    )
    assert response.status_code == 201
    assert response.json["start_mode"] == "now"
    return response.json


@pytest.mark.parametrize("action", ["generate", "fill-remaining", "repair-conflicts"])
def test_all_planning_actions_use_request_time_and_preserve_retained_sessions(app, client, action):
    a = create_default(client)
    first = client.send("POST", "/schedule/generate", SETTINGS).json["sessions"]
    assert first[0]["starts_at"] == iso(T0 + timedelta(hours=1))
    app.config["CLOCK"] = lambda: T0 + timedelta(minutes=30)
    if action == "fill-remaining":
        client.send("PATCH", f"/assignments/{a['id']}", {"estimated_minutes": 120})
        assert client.send("GET", "/schedule").json["sessions"] == first
    if action == "repair-conflicts":
        once(client, start=T0 + timedelta(hours=1), end=T0 + timedelta(minutes=90))
    result = client.send("POST", f"/schedule/{action}", SETTINGS).json
    retained_ids = {s["id"] for s in first} if action != "generate" else set()
    added = [s for s in result["sessions"] if s["id"] not in retained_ids]
    assert added
    assert all(s["starts_at"] >= iso(T0 + timedelta(minutes=90)) for s in added)
    if action == "fill-remaining":
        assert all(s in result["sessions"] for s in first)
    if action == "repair-conflicts":
        assert first[1] in result["sessions"]


def test_manual_move_respects_buffer_but_existing_session_can_be_shortened(app, client):
    create_default(client)
    first = client.send("POST", "/schedule/generate", SETTINGS).json["sessions"][0]
    path = f"/sessions/{first['id']}"
    assert (
        client.send("PATCH", path, {"starts_at": iso(T0 + timedelta(minutes=59))}).status_code
        == 422
    )
    app.config["CLOCK"] = lambda: T0 + timedelta(minutes=30)
    assert client.send("PATCH", path, {"minutes": 15}).status_code == 200
    sessions = client.send("GET", "/schedule").json["sessions"]
    assert sessions[0]["starts_at"] == first["starts_at"]
    assert all(s["starts_at"] >= iso(T0 + timedelta(minutes=90)) for s in sessions[1:])


def test_switching_to_one_hour_removes_early_future_sessions_only(client):
    a = client.assignment(client.course()["id"])
    assert client.plan().json["sessions"][0]["starts_at"] == iso(T0)
    assert client.send("PATCH", f"/assignments/{a['id']}", {"start_mode": "now"}).status_code == 200
    assert client.send("GET", "/schedule").json["sessions"] == []
    assert client.plan().json["sessions"][0]["starts_at"] == iso(T0 + timedelta(hours=1))
