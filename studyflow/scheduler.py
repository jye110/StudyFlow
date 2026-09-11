"""Pure deterministic scheduler. No Flask, database or AI dependency.

Inputs and outputs use naive UTC datetimes. Calendar windows use an IANA zone,
so the study day retains its local start across daylight-saving transitions.
"""

from bisect import bisect_right
from collections import defaultdict
from datetime import UTC, timedelta
from zoneinfo import ZoneInfo

from .availability import local_boundary, merge_intervals

PRIORITIES = {"High": 0, "Medium": 1, "Low": 2}


def earliest_start(assignment, instant=None):
    mode = assignment.get("start_mode", "now")
    # Keep the stored/API value for compatibility; the UI calls this "1 hour later".
    if mode == "now" and instant is not None:
        return instant + timedelta(hours=1)
    if mode == "week_before":
        return assignment["due_at"] - timedelta(days=7)
    if mode == "custom":
        return assignment["start_at"]
    return None


def generate_plan(
    assignments,
    now,
    *,
    timezone_name="UTC",
    start_hour=9,
    end_hour=22,
    daily_minutes=180,
    horizon_days=30,
    credited=None,
    occupied=None,
    reserved_study=None,
):
    zone = ZoneInfo(timezone_name)
    credited = credited or {}
    occupied = merge_intervals(occupied or [])
    occupied_ends = [end for _, end in occupied]
    reserved_study = merge_intervals(reserved_study or [])
    daily_used = defaultdict(float)
    local_day = now.replace(tzinfo=UTC).astimezone(zone).date()
    slots = []
    for day_index in range(horizon_days):
        day = local_day + timedelta(days=day_index)
        midnight = local_boundary(day, "00:00", zone)
        day_end = local_boundary(day + timedelta(days=1), "00:00", zone)
        end = day_end if end_hour == 24 else local_boundary(day, f"{end_hour:02d}:00", zone)
        start = local_boundary(day, f"{start_hour:02d}:00", zone)
        # Preserved study (including earlier today) consumes the daily budget;
        # personal busy time only blocks slots and does not consume study minutes.
        daily_used[day] = sum(
            max(0, (min(b, day_end) - max(a, midnight)).total_seconds() / 60)
            for a, b in reserved_study
        )
        # Whole-minute slots make one-minute estimates and partial deadlines exact.
        for minute in range(int((end - start).total_seconds() // 60)):
            point = start + timedelta(minutes=minute)
            index = bisect_right(occupied_ends, point)
            overlaps = index < len(occupied) and occupied[index][0] < point + timedelta(minutes=1)
            if point >= now and not overlaps:
                slots.append((point, day))
    sessions, unscheduled = [], []
    used = set()
    active = sorted(
        (a for a in assignments if a["status"] != "Completed"),
        key=lambda a: (a["due_at"] >= now, a["due_at"], PRIORITIES[a["priority"]], a["id"]),
    )
    for assignment in active:
        overdue = assignment["due_at"] < now
        earliest = earliest_start(assignment, now)
        remaining = max(0, assignment["estimated_minutes"] - credited.get(assignment["id"], 0))
        block_start, block_minutes, block_day = None, 0, None
        for point, day in slots:
            if not remaining or (
                not overdue and point + timedelta(minutes=1) > assignment["due_at"]
            ):
                break
            # Leave earlier slots available for other assignments that can start now.
            if (
                point in used
                or daily_used[day] + 1 > daily_minutes
                or (earliest is not None and point < earliest)
            ):
                continue
            if block_start is not None and (
                block_minutes == 30
                or point != block_start + timedelta(minutes=block_minutes)
                or day != block_day
            ):
                sessions.append(
                    {
                        "assignment_id": assignment["id"],
                        "starts_at": block_start,
                        "minutes": block_minutes,
                    }
                )
                block_start, block_minutes = None, 0
            if block_start is None:
                block_start = point
                block_day = day
            block_minutes += 1
            remaining -= 1
            used.add(point)
            daily_used[day] += 1
        if block_start is not None:
            sessions.append(
                {
                    "assignment_id": assignment["id"],
                    "starts_at": block_start,
                    "minutes": block_minutes,
                }
            )
        if remaining:
            unscheduled.append(
                {
                    "assignment_id": assignment["id"],
                    "title": assignment["title"],
                    "minutes": remaining,
                    "reason": "Not enough available study time for overdue work in this planning window"
                    if overdue
                    else (
                        "Not enough time between the earliest start and deadline in this planning window"
                        if earliest is not None and earliest > now
                        else "Not enough time before the deadline in this planning window"
                    ),
                }
            )
    return {"sessions": sessions, "unscheduled": unscheduled}
