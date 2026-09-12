from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from studyflow.scheduler import generate_plan
from studyflow.validation import iso
from tests.conftest import T0
from tests.test_busy_times import once
from tests.test_scheduler import task

SETTINGS = {
    "timezone": "UTC",
    "start_hour": 9,
    "end_hour": 10,
    "daily_minutes": 180,
    "horizon_days": 3,
}


def test_default_end_is_22_and_partial_final_session_stops_exactly():
    instant = T0.replace(hour=21, minute=45)
    plan = generate_plan([task(minutes=60)], instant, horizon_days=1)
    assert plan["sessions"] == [{"assignment_id": 1, "starts_at": instant, "minutes": 15}]
    assert plan["unscheduled"][0]["minutes"] == 45
    assert not generate_plan([task()], instant.replace(hour=22, minute=0), horizon_days=1)[
        "sessions"
    ]


def test_busy_time_cannot_push_study_past_end_and_next_day_can_take_surplus():
    work = {**task(minutes=90), "due_at": T0 + timedelta(days=3)}
    busy = [(T0 + timedelta(minutes=20), T0 + timedelta(minutes=50))]
    plan = generate_plan([work], T0, end_hour=10, occupied=busy)
    assert [s["minutes"] for s in plan["sessions"]] == [20, 10, 30, 30]
    assert plan["sessions"][2]["starts_at"] == T0 + timedelta(days=1)
    assert not plan["unscheduled"]


def test_preserved_study_after_end_still_counts_toward_daily_total():
    reserved = [(T0.replace(hour=23), T0.replace(hour=23, minute=30))]
    plan = generate_plan(
        [task(minutes=90)],
        T0,
        end_hour=10,
        daily_minutes=60,
        reserved_study=reserved,
        occupied=reserved,
        horizon_days=1,
    )
    assert sum(s["minutes"] for s in plan["sessions"]) == 30


@pytest.mark.parametrize("instant", [datetime(2026, 3, 7, 17), datetime(2026, 10, 31, 16)])
def test_end_time_follows_local_clock_across_dst(instant):
    zone = ZoneInfo("America/Los_Angeles")
    work = {**task(minutes=120), "due_at": instant + timedelta(days=3)}
    plan = generate_plan([work], instant, timezone_name=zone.key, start_hour=9, end_hour=10)
    assert len(plan["sessions"]) == 4
    for s in plan["sessions"]:
        start = s["starts_at"].replace(tzinfo=UTC).astimezone(zone)
        end = (
            (s["starts_at"] + timedelta(minutes=s["minutes"])).replace(tzinfo=UTC).astimezone(zone)
        )
        assert start.hour == 9 and end.hour <= 10
        if end.hour == 10:
            assert end.minute == 0


@pytest.mark.parametrize("end", [9, 8, 0, 25, True, "22", None])
def test_invalid_end_settings_do_not_change_saved_plan(client, end):
    client.assignment(client.course()["id"])
    client.plan()
    original = client.send("GET", "/schedule").json
    response = client.send("POST", "/schedule/generate", {**SETTINGS, "end_hour": end})
    assert response.status_code == 422 and "end_hour" in response.json["fields"]
    assert client.send("GET", "/schedule").json == original


@pytest.mark.parametrize("action", ["fill-remaining", "repair-conflicts", "compensate"])
def test_end_is_saved_and_all_replanning_paths_obey_it(client, action):
    a = client.assignment(client.course()["id"], due_at=iso(T0 + timedelta(days=3)))
    first = client.send("POST", "/schedule/generate", SETTINGS).json["sessions"][0]
    assert client.send("GET", "/schedule").json["settings"] == SETTINGS
    if action == "fill-remaining":
        client.send("PATCH", f"/assignments/{a['id']}", {"estimated_minutes": 120})
        response = client.send("POST", "/schedule/fill-remaining", SETTINGS)
    elif action == "repair-conflicts":
        once(client, end=T0 + timedelta(hours=1))
        response = client.send("POST", "/schedule/repair-conflicts", SETTINGS)
    else:
        response = client.send("DELETE", f"/sessions/{first['id']}")
    assert response.status_code == 200
    sessions = client.send("GET", "/schedule").json["sessions"]
    assert any(s["starts_at"][:10] > iso(T0)[:10] for s in sessions)
    for s in sessions:
        start = datetime.fromisoformat(s["starts_at"])
        assert start.hour == 9
        end = start + timedelta(minutes=s["minutes"])
        assert end.hour < 10 or (end.hour == 10 and end.minute == 0)


def test_legacy_settings_default_to_22_for_generation_and_compensation(client):
    client.assignment(client.course()["id"])
    first = client.plan().json["sessions"][0]
    assert client.send("GET", "/schedule").json["settings"]["end_hour"] == 22
    assert (
        client.send(
            "PATCH",
            f"/sessions/{first['id']}",
            {
                "minutes": 15,
                "settings": {
                    "timezone": "UTC",
                    "start_hour": 9,
                    "daily_minutes": 180,
                    "horizon_days": 30,
                },
            },
        ).status_code
        == 200
    )
    assert client.send("GET", "/schedule").json["settings"]["end_hour"] == 22
