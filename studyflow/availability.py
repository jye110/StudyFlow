"""Expand personal availability exclusions into half-open UTC intervals."""

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo


def merge_intervals(intervals):
    merged = []
    for start, end in sorted(intervals):
        if start >= end:
            continue
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def local_boundary(day, clock, zone, *, end=False):
    local = datetime.combine(day, time.fromisoformat(clock))
    candidates = [local.replace(tzinfo=zone, fold=fold).astimezone(UTC) for fold in (0, 1)]
    valid = [value for value in candidates if value.astimezone(zone).replace(tzinfo=None) == local]
    # Block both occurrences of repeated clock times. In a spring-forward gap,
    # move the nonexistent boundary forward by the DST gap.
    value = (max(valid) if end else min(valid)) if valid else max(candidates)
    return value.replace(tzinfo=None)


def busy_intervals(rules, start, end):
    intervals = []
    for rule in rules:
        if rule["kind"] == "once":
            if rule["starts_at"] < end and rule["ends_at"] > start:
                intervals.append((rule["starts_at"], rule["ends_at"]))
            continue
        zone = ZoneInfo(rule["timezone"])
        day = start.replace(tzinfo=UTC).astimezone(zone).date() - timedelta(days=1)
        last = end.replace(tzinfo=UTC).astimezone(zone).date()
        while day <= last:
            if day.weekday() in rule["weekdays"]:
                end_day = day + timedelta(days=rule["end_time"] < rule["start_time"])
                a = local_boundary(day, rule["start_time"], zone)
                b = local_boundary(end_day, rule["end_time"], zone, end=True)
                if a < end and b > start:
                    intervals.append((a, b))
            day += timedelta(days=1)
    return merge_intervals(intervals)
