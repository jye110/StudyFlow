from datetime import datetime, timedelta
from time import perf_counter

import pytest

from studyflow.scheduler import generate_plan

T0 = datetime(2026, 9, 10, 9)


def task(id=1, minutes=60, hours=24, priority="High", status="Not Started"):
    return {
        "id": id,
        "title": f"Assignment {id}",
        "estimated_minutes": minutes,
        "due_at": T0 + timedelta(hours=hours),
        "priority": priority,
        "status": status,
        # The scheduling oracle has an explicit immediate start, independent of UI defaults.
        "start_mode": "custom",
        "start_at": datetime(2000, 1, 1),
    }


def test_tc07_f2_independent_oracle():
    work = [
        task(3, 90, 48, "Medium"),
        task(4, 30, 12, status="Completed"),
        task(2, 30, 24, "Low", "In Progress"),
        task(1),
    ]
    plan = generate_plan(work, T0)
    expected_ids = [1, 1, 2, 3, 3, 3]
    assert [s["assignment_id"] for s in plan["sessions"]] == expected_ids
    assert [s["minutes"] for s in plan["sessions"]] == [30] * 6
    assert [s["starts_at"] for s in plan["sessions"]] == [
        T0 + timedelta(minutes=30 * i) for i in range(6)
    ]
    assert plan["unscheduled"] == []


def test_62_minutes_includes_a_two_minute_final_session():
    plan = generate_plan([task(minutes=62)], T0)
    assert [session["minutes"] for session in plan["sessions"]] == [30, 30, 2]
    assert plan["unscheduled"] == []


@pytest.mark.parametrize("work", [[], [task(status="Completed")]])
def test_tc07_empty_and_completed(work):
    assert generate_plan(work, T0) == {"sessions": [], "unscheduled": []}


def test_tc07_ties_one_minute_and_deadline():
    plan = generate_plan([task(3, 1, 24, "Low"), task(2, 1), task(1, 1)], T0)
    assert [s["assignment_id"] for s in plan["sessions"]] == [1, 2, 3]
    assert sum(s["minutes"] for s in plan["sessions"]) == 3
    assert plan["sessions"][2]["starts_at"] == T0 + timedelta(minutes=2)
    exact = task(minutes=31)
    exact["due_at"] = T0 + timedelta(minutes=30)
    result = generate_plan([exact], T0)
    assert result["sessions"][0]["minutes"] == 30
    assert result["unscheduled"][0]["minutes"] == 1


def test_tc07_overload_not_silently_dropped_or_overlapped():
    result = generate_plan([task(1, 240), task(2, 240)], T0, horizon_days=1, daily_minutes=60)
    assert sum(s["minutes"] for s in result["sessions"]) == 60
    assert sum(s["minutes"] for s in result["unscheduled"]) == 420
    assert result["sessions"][1]["starts_at"] == T0 + timedelta(minutes=30)


def test_overdue_work_is_scheduled_before_upcoming_work():
    plan = generate_plan([task(1, 30, -1), task(2, 60, 24)], T0)
    assert [s["assignment_id"] for s in plan["sessions"]] == [1, 2, 2]
    assert not plan["unscheduled"]


def test_regeneration_credits_history_and_avoids_ongoing_session():
    plan = generate_plan(
        [task(minutes=60)],
        T0,
        credited={1: 30},
        occupied=[(T0 - timedelta(minutes=15), T0 + timedelta(minutes=15))],
    )
    assert plan["sessions"] == [
        {"assignment_id": 1, "starts_at": T0 + timedelta(minutes=15), "minutes": 30}
    ]


def test_dst_local_start_remains_nine():
    start = datetime(2026, 10, 31, 15)
    work = task(minutes=120)
    work["due_at"] = datetime(2026, 11, 3)
    plan = generate_plan([work], start, timezone_name="America/Los_Angeles", daily_minutes=60)
    assert plan["sessions"][0]["starts_at"] == datetime(2026, 10, 31, 16)
    assert plan["sessions"][2]["starts_at"] == datetime(2026, 11, 1, 17)


def test_tc17_200_assignment_unit_performance():
    tasks = [task(i, 30, 720) for i in range(1, 201)]
    start = perf_counter()
    plan = generate_plan(tasks, T0, daily_minutes=240)
    assert perf_counter() - start < 5
    assert len(plan["sessions"]) == 200
    assert sum(s["minutes"] for s in plan["sessions"]) == 6000
    assert not plan["unscheduled"]
