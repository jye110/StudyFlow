from collections import defaultdict
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from studyflow.models import StudySession, db
from studyflow.scheduler import generate_plan
from studyflow.validation import iso
from tests.conftest import T0
from tests.test_busy_times import once
from tests.test_scheduler import task

SETTINGS = {"timezone": "UTC", "start_hour": 9, "daily_minutes": 60, "horizon_days": 2}


def test_busy_periods_do_not_consume_daily_study_budget():
    plan = generate_plan(
        [task(minutes=180)],
        T0,
        horizon_days=1,
        occupied=[(T0 + timedelta(hours=1), T0 + timedelta(hours=3))],
    )
    assert not plan["unscheduled"]
    assert sum(s["minutes"] for s in plan["sessions"]) == 180
    assert [s["starts_at"] for s in plan["sessions"]] == [
        T0 + timedelta(minutes=m) for m in (0, 30, 180, 210, 240, 270)
    ]


def test_late_today_and_earliest_start_can_use_later_hours():
    delayed = {**task(minutes=60), "start_mode": "custom", "start_at": T0 + timedelta(hours=6)}
    plan = generate_plan(
        [delayed, task(2, minutes=60)], T0 + timedelta(hours=4), daily_minutes=90, horizon_days=1
    )
    assert sum(s["minutes"] for s in plan["sessions"]) == 90
    assert plan["sessions"][0]["starts_at"] == T0 + timedelta(hours=6)
    assert plan["sessions"][-1]["starts_at"] == T0 + timedelta(hours=4)


def test_midnight_ends_the_day_and_deadlines_still_limit_capacity():
    late = T0.replace(hour=23, minute=40)
    work = {**task(minutes=90), "due_at": late + timedelta(days=1)}
    plan = generate_plan([work], late, horizon_days=1, daily_minutes=60, end_hour=24)
    assert sum(s["minutes"] for s in plan["sessions"]) == 20
    assert plan["unscheduled"][0]["minutes"] == 70
    work["due_at"] = late + timedelta(minutes=7)
    assert generate_plan([work], late, horizon_days=1, end_hour=24)["sessions"][0]["minutes"] == 7


@pytest.mark.parametrize("date", [datetime(2026, 3, 8, 8), datetime(2026, 11, 1, 7)])
def test_daily_budget_uses_local_dates_across_dst_and_splits_at_midnight(date):
    zone = ZoneInfo("America/Los_Angeles")
    work = {**task(minutes=480), "due_at": date + timedelta(days=3)}
    # A preserved session straddles local midnight and reserves 15 minutes today.
    reserved = [(date - timedelta(minutes=15), date + timedelta(minutes=15))]
    plan = generate_plan(
        [work],
        date,
        timezone_name=zone.key,
        start_hour=0,
        daily_minutes=240,
        horizon_days=2,
        occupied=reserved,
        reserved_study=reserved,
    )
    totals = defaultdict(int)
    for s in plan["sessions"]:
        local = s["starts_at"].replace(tzinfo=UTC).astimezone(zone)
        finish = (
            (s["starts_at"] + timedelta(minutes=s["minutes"], microseconds=-1))
            .replace(tzinfo=UTC)
            .astimezone(zone)
        )
        assert local.date() == finish.date()
        totals[local.date()] += s["minutes"]
    assert sorted(totals.values()) == [225, 240]
    assert plan["unscheduled"][0]["minutes"] == 15


@pytest.mark.parametrize("outcome,expected", [("completed", 30), ("pending", 30), ("missed", 60)])
def test_generation_counts_preserved_study_today_even_before_start_hour(
    app, client, outcome, expected
):
    a = client.assignment(client.course()["id"], estimated_minutes=180)
    with app.app_context():
        db.session.add(
            StudySession(
                assignment_id=a["id"],
                starts_at=T0 - timedelta(minutes=30),
                minutes=30,
                outcome=outcome,
            )
        )
        db.session.commit()
    plan = client.send("POST", "/schedule/generate", {**SETTINGS, "horizon_days": 1}).json
    assert sum(s["minutes"] for s in plan["sessions"] if s["starts_at"] >= iso(T0)) == expected


def test_fill_reserves_existing_minutes_and_respects_reduced_budget(client):
    a = client.assignment(
        client.course()["id"], estimated_minutes=240, due_at=iso(T0 + timedelta(days=3))
    )
    once(client, end=T0 + timedelta(hours=3))
    initial = client.send("POST", "/schedule/generate", {**SETTINGS, "horizon_days": 1}).json[
        "sessions"
    ]
    assert sum(s["minutes"] for s in initial) == 60
    assert initial[0]["starts_at"] == iso(T0 + timedelta(hours=3))
    for budget in [60, 30]:
        filled = client.send(
            "POST",
            "/schedule/fill-remaining",
            {**SETTINGS, "daily_minutes": budget, "horizon_days": 1},
        ).json
        assert filled["sessions"] == initial
    assert client.send("GET", f"/assignments/{a['id']}").status_code == 200


def test_conflict_repair_can_fill_later_same_day_without_exceeding_budget(client):
    client.assignment(client.course()["id"])
    original = client.send("POST", "/schedule/generate", SETTINGS).json["sessions"]
    once(client)
    repaired = client.send("POST", "/schedule/repair-conflicts", SETTINGS).json
    assert not repaired["unallocated"]
    assert original[1] in repaired["sessions"]
    assert [s["starts_at"] for s in repaired["sessions"]] == [
        iso(T0 + timedelta(minutes=30)),
        iso(T0 + timedelta(minutes=60)),
    ]


def test_shortening_session_compensates_with_remaining_daily_budget(client):
    client.assignment(
        client.course()["id"], estimated_minutes=120, due_at=iso(T0 + timedelta(days=3))
    )
    first = client.send("POST", "/schedule/generate", SETTINGS).json["sessions"][0]
    assert client.send("PATCH", f"/sessions/{first['id']}", {"minutes": 15}).status_code == 200
    sessions = client.send("GET", "/schedule").json["sessions"]
    totals = defaultdict(int)
    for s in sessions:
        totals[s["starts_at"][:10]] += s["minutes"]
    assert list(totals.values()) == [60, 60]
