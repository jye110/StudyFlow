"""Check saved study intervals against planning preferences without moving them."""

from datetime import UTC, timedelta
from zoneinfo import ZoneInfo

from .availability import local_boundary, merge_intervals


def settings_conflicts(sessions, instant, settings):
    zone = ZoneInfo(settings["timezone"])
    today = instant.replace(tzinfo=UTC).astimezone(zone).date()
    window_end = local_boundary(today + timedelta(days=settings["horizon_days"]), "00:00", zone)
    intervals = merge_intervals(
        [
            (s["starts_at"], s["starts_at"] + timedelta(minutes=s["minutes"]))
            for s in sessions
            if s["outcome"] != "missed"
        ]
    )
    day_usage = {}
    conflicts = []
    for session in sessions:
        start = session["starts_at"]
        if start < instant or session["outcome"] == "missed":
            continue
        end = start + timedelta(minutes=session["minutes"])
        reasons = set()
        if end > window_end:
            reasons.add("outside_window")
        day = start.replace(tzinfo=UTC).astimezone(zone).date()
        last_day = (end - timedelta(microseconds=1)).replace(tzinfo=UTC).astimezone(zone).date()
        while day <= last_day:
            midnight = local_boundary(day, "00:00", zone)
            next_day = local_boundary(day + timedelta(days=1), "00:00", zone)
            allowed_start = local_boundary(day, f"{settings['start_hour']:02d}:00", zone)
            allowed_end = (
                next_day
                if settings["end_hour"] == 24
                else local_boundary(day, f"{settings['end_hour']:02d}:00", zone)
            )
            if max(start, midnight) < allowed_start or min(end, next_day) > allowed_end:
                reasons.add("outside_hours")
            if day not in day_usage:
                day_usage[day] = sum(
                    max(0, (min(b, next_day) - max(a, midnight)).total_seconds() / 60)
                    for a, b in intervals
                )
            if day_usage[day] > settings["daily_minutes"]:
                reasons.add("daily_budget")
            day += timedelta(days=1)
        if reasons:
            conflicts.append({"session_id": session["id"], "reasons": sorted(reasons)})
    return conflicts
