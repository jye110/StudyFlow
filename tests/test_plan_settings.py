from datetime import datetime, timedelta

import pytest

from studyflow.models import StudySession, db
from studyflow.plan_settings import settings_conflicts
from tests.conftest import T0, Client
from tests.test_busy_times import once

SETTINGS = {
    "timezone": "UTC",
    "start_hour": 9,
    "end_hour": 22,
    "daily_minutes": 180,
    "horizon_days": 30,
}


def session(id, start, minutes=30, outcome="pending"):
    return {"id": id, "starts_at": start, "minutes": minutes, "outcome": outcome}


def test_apply_saves_preferences_without_moving_sessions_and_reports_busy_time(app, client):
    client.assignment(client.course()["id"])
    client.plan()
    once(client)
    before = client.send("GET", "/schedule").json
    reply = client.send("PUT", "/schedule/settings", {**SETTINGS, "start_hour": 10})
    assert reply.status_code == 200
    assert len(reply.json["conflicts"]) == 2
    assert reply.json["conflicts"][0]["reasons"] == ["outside_hours", "busy_time"]
    after = client.send("GET", "/schedule").json
    assert after["sessions"] == before["sessions"]
    assert after["settings"]["start_hour"] == 10
    other = Client(app, email="other-settings@example.test")
    assert other.send("GET", "/schedule").json["settings"] is None
    assert other.send("PUT", "/schedule/settings", SETTINGS).json["conflicts"] == []
    assert client.send("GET", "/schedule").json["settings"]["start_hour"] == 10


def test_no_conflicts_does_not_generate_a_plan(client):
    client.assignment(client.course()["id"])
    response = client.send("PUT", "/schedule/settings", SETTINGS)
    assert response.json == {"settings": SETTINGS, "conflicts": []}
    assert client.send("GET", "/schedule").json["sessions"] == []
    client.plan()
    assert client.send("PUT", "/schedule/settings", SETTINGS).json["conflicts"] == []


@pytest.mark.parametrize(
    "change",
    [
        {"end_hour": 8},
        {"daily_minutes": 0},
        {"timezone": "invalid"},
        {"horizon_days": 91},
        {"start_hour": True},
        {"unexpected": 1},
    ],
)
def test_invalid_apply_preserves_settings_and_sessions(client, change):
    client.assignment(client.course()["id"])
    client.plan()
    before = client.send("GET", "/schedule").json
    assert client.send("PUT", "/schedule/settings", {**SETTINGS, **change}).status_code == 422
    assert client.send("GET", "/schedule").json == before


def test_budget_counts_earlier_pending_completed_but_not_missed_and_only_flags_future():
    sessions = [
        session(1, T0 - timedelta(hours=2), outcome="completed"),
        session(2, T0 - timedelta(hours=1)),
        session(3, T0 - timedelta(minutes=30), outcome="missed"),
        session(4, T0),
    ]
    assert settings_conflicts(sessions, T0, {**SETTINGS, "daily_minutes": 60}) == [
        {"session_id": 4, "reasons": ["daily_budget"]}
    ]
    assert settings_conflicts(sessions, T0, {**SETTINGS, "daily_minutes": 90}) == []
    # Retained overlaps are merged, matching the planner's daily accounting.
    sessions.append(session(5, T0 - timedelta(hours=2), outcome="completed"))
    assert settings_conflicts(sessions, T0, {**SETTINGS, "daily_minutes": 90}) == []


def test_daily_windows_midnight_and_horizon_boundaries():
    settings = {**SETTINGS, "start_hour": 0, "end_hour": 24, "horizon_days": 1}
    midnight = T0.replace(hour=0) + timedelta(days=1)
    assert settings_conflicts([session(1, midnight - timedelta(minutes=30))], T0, settings) == []
    assert settings_conflicts([session(1, midnight)], T0, settings) == [
        {"session_id": 1, "reasons": ["outside_window"]}
    ]
    crossing = [session(1, midnight - timedelta(minutes=15))]
    assert settings_conflicts(crossing, T0, {**settings, "start_hour": 9}) == [
        {"session_id": 1, "reasons": ["outside_hours", "outside_window"]}
    ]
    assert settings_conflicts([session(1, T0, 60)], T0, {**SETTINGS, "end_hour": 10}) == []
    assert settings_conflicts([session(1, T0, 61)], T0, {**SETTINGS, "end_hour": 10}) == [
        {"session_id": 1, "reasons": ["outside_hours"]}
    ]


@pytest.mark.parametrize(
    "instant, starts",
    [
        (datetime(2026, 3, 7, 17), [datetime(2026, 3, 7, 17), datetime(2026, 3, 8, 16)]),
        (datetime(2026, 10, 31, 16), [datetime(2026, 10, 31, 16), datetime(2026, 11, 1, 17)]),
    ],
)
def test_checks_new_timezone_using_local_hours_across_dst(instant, starts):
    sessions = [session(i, start) for i, start in enumerate(starts)]
    settings = {**SETTINGS, "timezone": "America/Los_Angeles", "end_hour": 10}
    assert settings_conflicts(sessions, instant, settings) == []
    assert (
        len(settings_conflicts(sessions, instant, {**settings, "start_hour": 10, "end_hour": 11}))
        == 2
    )


def test_regeneration_after_apply_keeps_started_history_and_uses_saved_preferences(app, client):
    a = client.assignment(client.course()["id"], estimated_minutes=90)
    with app.app_context():
        db.session.add(
            StudySession(assignment_id=a["id"], starts_at=T0 - timedelta(minutes=10), minutes=30)
        )
        db.session.commit()
    client.plan()
    before = client.send("GET", "/schedule").json["sessions"]
    applied = client.send("PUT", "/schedule/settings", {**SETTINGS, "start_hour": 12}).json
    assert applied["conflicts"]
    result = client.send("POST", "/schedule/generate", applied["settings"])
    assert result.status_code == 200
    assert before[0] in result.json["sessions"]
    assert all(s["starts_at"][11:13] == "12" for s in result.json["sessions"][1:])
