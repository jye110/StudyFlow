import re
from collections import defaultdict
from datetime import timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from . import ai
from .auth import lock_user, now, require_user
from .availability import busy_intervals
from .models import Assignment, BusyTime, Course, StudySession, db
from .plan_settings import settings_conflicts
from .scheduler import earliest_start, generate_plan
from .validation import (
    ASSIGNMENT_SCHEMA,
    COURSE_SCHEMA,
    APIError,
    body,
    choice,
    integer,
    iso,
    text,
    timestamp,
    validate,
)

api = Blueprint("api", __name__, url_prefix="/api")


def course_query():
    return select(Course).where(Course.user_id == g.user.id)


def assignment_query():
    return (
        select(Assignment)
        .join(Course)
        .where(Course.user_id == g.user.id)
        .options(joinedload(Assignment.course))
    )


def session_query():
    return (
        select(StudySession)
        .join(Assignment)
        .join(Course)
        .where(Course.user_id == g.user.id)
        .options(joinedload(StudySession.assignment).joinedload(Assignment.course))
    )


def owned(query, model, record_id):
    record = db.session.scalar(query.where(model.id == record_id))
    if not record:
        raise APIError("Record not found.", 404)
    return record


def course_json(course):
    return {k: getattr(course, k) for k in ("id", "name", "code", "color")}


def assignment_json(assignment):
    result = {
        k: getattr(assignment, k)
        for k in (
            "id",
            "course_id",
            "title",
            "notes",
            "estimated_minutes",
            "priority",
            "status",
            "breakdown",
            "start_mode",
        )
    }
    result.update(
        due_at=iso(assignment.due_at),
        start_at=iso(assignment.start_at) if assignment.start_at else None,
        course=course_json(assignment.course),
        overdue=assignment.status != "Completed" and assignment.due_at < now(),
    )
    return result


def session_json(session):
    return {
        "id": session.id,
        "assignment_id": session.assignment_id,
        "starts_at": iso(session.starts_at),
        "minutes": session.minutes,
        "outcome": session.outcome,
        "assignment_title": session.assignment.title,
        "course": course_json(session.assignment.course),
    }


@api.route("/courses", methods=["GET", "POST"])
@require_user
def courses():
    if request.method == "GET":
        return jsonify(
            [course_json(c) for c in db.session.scalars(course_query().order_by(Course.id))]
        )
    lock_user()
    values = validate({"code": "", "color": "#2563eb", **body(COURSE_SCHEMA)}, COURSE_SCHEMA)
    record = Course(user_id=g.user.id, **values)
    db.session.add(record)
    db.session.commit()
    return jsonify(course_json(record)), 201


@api.route("/courses/<int:record_id>", methods=["GET", "PATCH", "DELETE"])
@require_user
def course_detail(record_id):
    from flask import request

    if request.method != "GET":
        lock_user()
    record = owned(course_query(), Course, record_id)
    if request.method == "DELETE":
        db.session.delete(record)
        db.session.commit()
        return "", 204
    if request.method == "PATCH":
        for key, value in validate(body(COURSE_SCHEMA), COURSE_SCHEMA, partial=True).items():
            setattr(record, key, value)
        db.session.commit()
    return jsonify(course_json(record))


@api.route("/assignments", methods=["GET", "POST"])
@require_user
def assignments():
    from flask import request

    if request.method == "GET":
        return jsonify(
            [
                assignment_json(a)
                for a in db.session.scalars(
                    assignment_query().order_by(Assignment.due_at, Assignment.id)
                )
            ]
        )
    lock_user()
    values = validate(
        {"notes": "", "start_mode": "now", "start_at": None, **body(ASSIGNMENT_SCHEMA)},
        ASSIGNMENT_SCHEMA,
    )
    validate_assignment_start(values)
    owned(course_query(), Course, values["course_id"])
    record = Assignment(**values)
    db.session.add(record)
    db.session.commit()
    return jsonify(assignment_json(record)), 201


def validate_assignment_start(values, record=None):
    mode = values.get("start_mode", record.start_mode if record else "now")
    start = values.get("start_at", record.start_at if record else None)
    due = values.get("due_at", record.due_at if record else None)
    if mode == "custom" and (start is None or (due >= now() and start > due)):
        raise APIError(
            "Check the highlighted fields.",
            422,
            {
                "start_at": "Choose a start date. For work not yet overdue, it must be on or before the deadline."
            },
        )
    if mode != "custom":
        values["start_at"] = None


def assignment_start(record, instant=None):
    return earliest_start(
        {key: getattr(record, key) for key in ("start_mode", "start_at", "due_at")}, instant
    )


def credited_minutes(session):
    # Pending sessions reserve planned work until the student confirms the outcome.
    return 0 if session.outcome == "missed" else session.minutes


def trim_assignment_sessions(record, instant):
    sessions = list(
        db.session.scalars(
            session_query()
            .where(StudySession.assignment_id == record.id)
            .order_by(StudySession.starts_at.desc(), StudySession.id.desc())
        )
    )
    surplus = sum(credited_minutes(s) for s in sessions) - record.estimated_minutes
    for session in sessions:
        if surplus <= 0 or session.starts_at < instant:
            break
        removed = min(credited_minutes(session), surplus)
        surplus -= removed
        if removed == session.minutes:
            db.session.delete(session)
        else:
            session.minutes -= removed


@api.route("/assignments/<int:record_id>", methods=["GET", "PATCH", "DELETE"])
@require_user
def assignment_detail(record_id):
    from flask import request

    if request.method != "GET":
        lock_user()
    record = owned(assignment_query(), Assignment, record_id)
    if request.method == "DELETE":
        db.session.delete(record)
        db.session.commit()
        return "", 204
    if request.method == "PATCH":
        values = validate(body(ASSIGNMENT_SCHEMA), ASSIGNMENT_SCHEMA, partial=True)
        validate_assignment_start(values, record)
        previous_start = assignment_start(record)
        previous_mode = record.start_mode
        previous_estimate = record.estimated_minutes
        instant = now()
        if "course_id" in values:
            owned(course_query(), Course, values["course_id"])
        for key, value in values.items():
            setattr(record, key, value)
        new_start = assignment_start(record)
        if record.start_mode == "now" and previous_mode != "now":
            new_start = assignment_start(record, instant)
        if new_start is not None and new_start != previous_start:
            db.session.execute(
                db.delete(StudySession).where(
                    StudySession.assignment_id == record.id,
                    StudySession.starts_at >= instant,
                    StudySession.starts_at < new_start,
                )
            )
        if record.status == "Completed":
            db.session.execute(
                db.delete(StudySession).where(
                    StudySession.assignment_id == record.id, StudySession.starts_at >= instant
                )
            )
        elif record.estimated_minutes < previous_estimate:
            trim_assignment_sessions(record, instant)
        db.session.commit()
        db.session.refresh(record)
    return jsonify(assignment_json(record))


@api.get("/schedule")
@require_user
def schedule():
    sessions = list(db.session.scalars(session_query().order_by(StudySession.starts_at)))
    rules = user_busy_rules()
    instant = now()
    conflicts = [s.id for s in sessions if s.starts_at >= instant and session_is_busy(s, rules)]
    active_conflicts = [
        s.id
        for s in sessions
        if s.starts_at < instant < s.starts_at + timedelta(minutes=s.minutes)
        and session_is_busy(s, rules)
    ]
    allocated = defaultdict(int)
    for session in sessions:
        allocated[session.assignment_id] += credited_minutes(session)
    unallocated = []
    for assignment in db.session.scalars(assignment_query()):
        remaining = max(0, assignment.estimated_minutes - allocated[assignment.id])
        if remaining and assignment.status != "Completed":
            unallocated.append(
                {"assignment_id": assignment.id, "title": assignment.title, "minutes": remaining}
            )
    return jsonify(
        {
            "sessions": [session_json(s) for s in sessions],
            "unallocated": unallocated,
            "busy_times": [busy_json(rule) for rule in rules],
            "conflicts": conflicts,
            "active_conflicts": active_conflicts,
            "settings": g.user.planning_settings,
        }
    )


def timezone_value(value):
    if not isinstance(value, str) or len(value) > 100:
        raise ValueError("Choose a valid IANA timezone.")
    try:
        ZoneInfo(value)
        return value
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError("Choose a valid IANA timezone.") from None


BUSY_FIELDS = (
    "name",
    "kind",
    "starts_at",
    "ends_at",
    "weekdays",
    "start_time",
    "end_time",
    "timezone",
)


def busy_query():
    return select(BusyTime).where(BusyTime.user_id == g.user.id)


def busy_values(record):
    return {key: getattr(record, key) for key in BUSY_FIELDS}


def user_busy_rules():
    return [
        {"id": row.id, **busy_values(row)}
        for row in db.session.scalars(busy_query().order_by(BusyTime.id))
    ]


def busy_json(rule):
    return {
        **rule,
        "starts_at": iso(rule["starts_at"]) if rule["starts_at"] else None,
        "ends_at": iso(rule["ends_at"]) if rule["ends_at"] else None,
    }


def session_is_busy(session, rules):
    return bool(
        busy_intervals(
            rules, session.starts_at, session.starts_at + timedelta(minutes=session.minutes)
        )
    )


def clock_value(value):
    if not isinstance(value, str) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
        raise ValueError("Choose a time in HH:MM format.")
    return value


def weekdays_value(value):
    if (
        not isinstance(value, list)
        or not 1 <= len(value) <= 7
        or any(type(day) is not int or not 0 <= day <= 6 for day in value)
    ):
        raise ValueError("Select at least one weekday.")
    return sorted(set(value))


def validate_busy(data, record=None):
    values = {
        "name": "",
        "kind": "once",
        "starts_at": None,
        "ends_at": None,
        "weekdays": [],
        "start_time": None,
        "end_time": None,
        "timezone": "UTC",
    }
    if record:
        values.update(busy_values(record))
    # Convert existing timestamps back to the request format before common validation.
    values = busy_json(values)
    values.update(data)
    result = validate(
        values,
        {
            "name": lambda v: text(v, 120, 0),
            "kind": lambda v: choice(v, ["once", "weekly"]),
            "timezone": timezone_value,
        },
    )
    if result["kind"] == "once":
        result.update(validate(values, {"starts_at": timestamp, "ends_at": timestamp}))
        if result["ends_at"] <= result["starts_at"]:
            raise APIError(
                "Check the highlighted fields.", 422, {"ends_at": "End must be after start."}
            )
        result.update(weekdays=[], start_time=None, end_time=None)
    else:
        result.update(
            validate(
                values,
                {"weekdays": weekdays_value, "start_time": clock_value, "end_time": clock_value},
            )
        )
        if result["start_time"] == result["end_time"]:
            raise APIError(
                "Check the highlighted fields.", 422, {"end_time": "Choose a different end time."}
            )
        result.update(starts_at=None, ends_at=None)
    return result


@api.route("/busy-times", methods=["GET", "POST"])
@require_user
def busy_times():
    if request.method == "GET":
        return jsonify([busy_json(rule) for rule in user_busy_rules()])
    lock_user()
    values = validate_busy(body(BUSY_FIELDS))
    record = BusyTime(user_id=g.user.id, **values)
    db.session.add(record)
    db.session.commit()
    return jsonify(busy_json({"id": record.id, **busy_values(record)})), 201


@api.get("/calendar-events")
@require_user
def calendar_events():
    values = validate(request.args, {"start": timestamp, "end": timestamp})
    start, end = values["start"], values["end"]
    if not timedelta(0) < end - start <= timedelta(days=32):
        raise APIError("Choose a calendar range of at most 32 days.", 422)
    events = []
    for rule in user_busy_rules():
        for a, b in busy_intervals([rule], start, end):
            events.append(
                {
                    "id": f"busy-{rule['id']}-{iso(a)}",
                    "busy_time_id": rule["id"],
                    "title": rule["name"] or "Personal arrangement",
                    "kind": rule["kind"],
                    "starts_at": iso(a),
                    "ends_at": iso(b),
                }
            )
    return jsonify({"events": sorted(events, key=lambda event: (event["starts_at"], event["id"]))})


@api.route("/busy-times/<int:record_id>", methods=["GET", "PATCH", "DELETE"])
@require_user
def busy_time_detail(record_id):
    if request.method != "GET":
        lock_user()
    record = owned(busy_query(), BusyTime, record_id)
    if request.method == "DELETE":
        db.session.delete(record)
        db.session.commit()
        return "", 204
    if request.method == "PATCH":
        values = validate_busy(body(BUSY_FIELDS), record)
        for key, value in values.items():
            setattr(record, key, value)
        db.session.commit()
    return jsonify(busy_json({"id": record.id, **busy_values(record)}))


@api.put("/schedule/settings")
@require_user
def apply_plan_settings():
    values = validate_plan_settings(
        body(["timezone", "start_hour", "end_hour", "daily_minutes", "horizon_days"])
    )
    lock_user()
    instant = now()
    sessions = list(db.session.scalars(session_query().order_by(StudySession.starts_at)))
    inputs = [
        {key: getattr(s, key) for key in ("id", "starts_at", "minutes", "outcome")}
        for s in sessions
    ]
    conflicts = {item["session_id"]: item for item in settings_conflicts(inputs, instant, values)}
    rules = user_busy_rules()
    for session in sessions:
        if session.starts_at >= instant and session_is_busy(session, rules):
            conflicts.setdefault(session.id, {"session_id": session.id, "reasons": []})[
                "reasons"
            ].append("busy_time")
    g.user.planning_settings = values
    db.session.commit()
    return jsonify({"settings": values, "conflicts": list(conflicts.values())})


@api.post("/schedule/generate")
@api.post("/schedule/repair-conflicts")
@api.post("/schedule/fill-remaining")
@require_user
def generate():
    values = validate_plan_settings(
        body(["timezone", "start_hour", "end_hour", "daily_minutes", "horizon_days"])
    )
    lock_user()
    g.user.planning_settings = values
    instant = now()
    assignments = list(db.session.scalars(assignment_query()))
    existing = list(db.session.scalars(session_query()))
    repair = request.path.endswith("/repair-conflicts")
    fill = request.path.endswith("/fill-remaining")
    rules = user_busy_rules()
    conflicts = (
        {s.id for s in existing if s.starts_at >= instant and session_is_busy(s, rules)}
        if repair
        else set()
    )
    displaced = defaultdict(int)
    credited = defaultdict(int)
    reserved_study = []
    occupied = busy_intervals(rules, instant, instant + timedelta(days=values["horizon_days"] + 2))
    for session in existing:
        if fill or session.starts_at < instant or (repair and session.id not in conflicts):
            credited[session.assignment_id] += credited_minutes(session)
            occupied.append(
                (session.starts_at, session.starts_at + timedelta(minutes=session.minutes))
            )
            if credited_minutes(session):
                reserved_study.append(
                    (session.starts_at, session.starts_at + timedelta(minutes=session.minutes))
                )
        else:
            displaced[session.assignment_id] += session.minutes
            db.session.delete(session)
    inputs = [
        {
            key: getattr(a, key)
            for key in (
                "id",
                "title",
                "due_at",
                "estimated_minutes",
                "priority",
                "status",
                "start_mode",
                "start_at",
            )
        }
        for a in assignments
    ]
    if repair:
        inputs = [a for a in inputs if a["id"] in displaced]
        for assignment in inputs:
            assignment["estimated_minutes"] = (
                credited[assignment["id"]] + displaced[assignment["id"]]
            )
    plan = generate_plan(
        inputs,
        instant,
        timezone_name=values["timezone"],
        start_hour=values["start_hour"],
        end_hour=values["end_hour"],
        daily_minutes=values["daily_minutes"],
        horizon_days=values["horizon_days"],
        credited=credited,
        occupied=occupied,
        reserved_study=reserved_study,
    )
    db.session.add_all([StudySession(**s) for s in plan["sessions"]])
    db.session.commit()
    return jsonify(
        {
            "sessions": [
                session_json(s)
                for s in db.session.scalars(session_query().order_by(StudySession.starts_at))
            ],
            "unallocated": plan["unscheduled"],
        }
    )


def validate_plan_settings(selected):
    schema = {
        "timezone": timezone_value,
        "start_hour": lambda v: integer(v, 0, 20),
        "end_hour": lambda v: integer(v, 1, 24),
        "daily_minutes": lambda v: integer(v, 30, 240),
        "horizon_days": lambda v: integer(v, 1, 90),
    }
    if not isinstance(selected, dict) or set(selected) - set(schema):
        raise APIError("Choose valid planning settings.", 422)
    values = validate({"end_hour": 22, **selected}, schema)
    if values["end_hour"] <= values["start_hour"]:
        raise APIError(
            "End time must be after start time.",
            422,
            {"end_hour": "Choose an end time later on the same day."},
        )
    return values


def compensation_settings(data):
    defaults = {
        "timezone": "UTC",
        "start_hour": 9,
        "end_hour": 22,
        "daily_minutes": 180,
        "horizon_days": 30,
    }
    return validate_plan_settings(
        data if data is not None else g.user.planning_settings or defaults
    )


def compensate_sessions(record, start, minutes, deleting, instant, settings):
    # Snapshot before mutations: all inserts/deletes and the edited anchor commit together.
    existing = list(db.session.scalars(session_query()))
    assignments = list(db.session.scalars(assignment_query()))
    rules = user_busy_rules()
    cutoff = min(record.starts_at, start)
    resume = max(
        record.starts_at + timedelta(minutes=record.minutes), start + timedelta(minutes=minutes)
    )
    occupied = busy_intervals(
        rules, instant, instant + timedelta(days=settings["horizon_days"] + 2)
    )
    occupied.append((instant, resume))
    credited = defaultdict(int)
    affected = {record.assignment_id}
    reserved_study = []
    for other in existing:
        if other.id == record.id:
            if deleting:
                db.session.delete(other)
            else:
                other.starts_at, other.minutes = start, minutes
                credited[other.assignment_id] += minutes
                occupied.append((start, start + timedelta(minutes=minutes)))
                reserved_study.append((start, start + timedelta(minutes=minutes)))
        elif other.starts_at >= cutoff and other.starts_at >= instant:
            affected.add(other.assignment_id)
            db.session.delete(other)
        else:
            credited[other.assignment_id] += credited_minutes(other)
            occupied.append((other.starts_at, other.starts_at + timedelta(minutes=other.minutes)))
            if credited_minutes(other):
                reserved_study.append(
                    (other.starts_at, other.starts_at + timedelta(minutes=other.minutes))
                )
    inputs = [
        {
            key: getattr(a, key)
            for key in (
                "id",
                "title",
                "due_at",
                "estimated_minutes",
                "priority",
                "status",
                "start_mode",
                "start_at",
            )
        }
        for a in assignments
        if a.id in affected
    ]
    plan = generate_plan(
        inputs,
        instant,
        timezone_name=settings["timezone"],
        start_hour=settings["start_hour"],
        end_hour=settings["end_hour"],
        daily_minutes=settings["daily_minutes"],
        horizon_days=settings["horizon_days"],
        credited=credited,
        occupied=occupied,
        reserved_study=reserved_study,
    )
    db.session.add_all([StudySession(**session) for session in plan["sessions"]])
    g.user.planning_settings = settings
    return {
        "sessions_created": len(plan["sessions"]),
        "unallocated": plan["unscheduled"],
        "remaining_minutes": sum(item["minutes"] for item in plan["unscheduled"]),
    }


@api.patch("/sessions/<int:record_id>/outcome")
@require_user
def session_outcome(record_id):
    lock_user()
    record = owned(session_query(), StudySession, record_id)
    values = validate(
        body(["outcome"]), {"outcome": lambda value: choice(value, ["completed", "missed"])}
    )
    instant = now()
    if record.starts_at + timedelta(minutes=record.minutes) > instant:
        raise APIError("Confirm the outcome after this study session ends.", 422)
    if record.outcome != values["outcome"]:
        record.outcome = values["outcome"]
        if record.outcome == "completed":
            if record.assignment.status == "Not Started":
                record.assignment.status = "In Progress"
            # Correcting a missed check-in may make already-filled future time redundant.
            trim_assignment_sessions(record.assignment, instant)
        db.session.commit()
    return jsonify(session_json(record))


@api.route("/sessions/<int:record_id>", methods=["GET", "PATCH", "DELETE"])
@require_user
def session_detail(record_id):
    from flask import request

    if request.method == "GET":
        return jsonify(session_json(owned(session_query(), StudySession, record_id)))
    lock_user()
    record = owned(session_query(), StudySession, record_id)
    deleting = request.method == "DELETE"
    data = (
        {}
        if deleting and not request.data
        else body(["settings"] if deleting else ["starts_at", "minutes", "settings"])
    )
    settings = compensation_settings(data.pop("settings", None))
    values = validate(
        data,
        {"starts_at": timestamp, "minutes": lambda v: integer(v, 1, 240)},
        partial=True,
    )
    start = values.get("starts_at", record.starts_at)
    minutes = values.get("minutes", record.minutes)
    end = start + timedelta(minutes=minutes)
    shortening = minutes < record.minutes
    instant = now()
    if record.starts_at < instant:
        raise APIError("Past and active sessions are preserved as study history.", 422)
    if deleting:
        replanned = compensate_sessions(record, start, minutes, True, instant, settings)
        db.session.commit()
        return jsonify({"replanned": replanned})
    if start == record.starts_at and minutes == record.minutes:
        return jsonify(session_json(record))
    earliest = assignment_start(record.assignment, instant if start != record.starts_at else None)
    if earliest is not None and start < earliest:
        raise APIError(
            "This session is before the assignment's earliest start.",
            422,
            {"starts_at": "Choose a time on or after the assignment's earliest start."},
        )
    if (
        record.assignment.status == "Completed"
        or start < instant
        or (record.assignment.due_at >= instant and end > record.assignment.due_at)
    ):
        raise APIError(
            "Choose a future time. Work not yet overdue must end before its deadline.",
            422,
            {"starts_at": "Use a future time within the deadline for work not yet overdue."},
        )
    if busy_intervals(user_busy_rules(), start, end):
        raise APIError(
            "This session overlaps your busy time.",
            422,
            {"starts_at": "Choose a time outside your personal arrangements."},
        )
    for other in db.session.scalars(session_query().where(StudySession.id != record.id)):
        if (
            (shortening or other.starts_at < min(start, record.starts_at))
            and start < other.starts_at + timedelta(minutes=other.minutes)
            and end > other.starts_at
        ):
            raise APIError(
                "This session overlaps another study session.",
                422,
                {"starts_at": "Choose a time without another session."},
            )
    if shortening:
        # Keep the removed minutes unscheduled until the student explicitly fills the plan.
        record.starts_at, record.minutes = start, minutes
        g.user.planning_settings = settings
        db.session.commit()
        return jsonify(session_json(record))
    replanned = compensate_sessions(record, start, minutes, False, instant, settings)
    db.session.commit()
    return jsonify({**session_json(record), "replanned": replanned})


@api.get("/summary")
@require_user
def summary():
    assignments = list(db.session.scalars(assignment_query().order_by(Assignment.due_at)))
    sessions = list(db.session.scalars(session_query().order_by(StudySession.starts_at)))
    instant = now()
    upcoming = [a for a in assignments if a.status != "Completed" and a.due_at >= instant]
    overdue = [a for a in assignments if a.status != "Completed" and a.due_at < instant]
    completed = sum(a.status == "Completed" for a in assignments)
    future = [s for s in sessions if s.starts_at >= instant]
    courses = []
    for course in db.session.scalars(course_query().order_by(Course.id)):
        work = [a for a in assignments if a.course_id == course.id]
        courses.append(
            {
                **course_json(course),
                "total": len(work),
                "completed": sum(a.status == "Completed" for a in work),
                "estimated_minutes": sum(a.estimated_minutes for a in work),
                "completed_minutes": sum(
                    a.estimated_minutes for a in work if a.status == "Completed"
                ),
            }
        )
    return jsonify(
        {
            "total": len(assignments),
            "completed": completed,
            "overdue_count": len(overdue),
            "in_progress": sum(a.status == "In Progress" for a in assignments),
            "planned_minutes": sum(s.minutes for s in future),
            "confirmed_study_minutes": sum(s.minutes for s in sessions if s.outcome == "completed"),
            "upcoming": [assignment_json(a) for a in upcoming],
            "overdue": [assignment_json(a) for a in overdue],
            "sessions": [session_json(s) for s in future],
            "courses": courses,
        }
    )


@api.post("/assignments/<int:record_id>/ai-suggestion")
@require_user
def ai_suggestion(record_id):
    body([])
    record = owned(assignment_query(), Assignment, record_id)
    if not record.notes.strip():
        message = "Add the assignment requirements to Notes before requesting AI suggestions."
        raise APIError(message, 422, {"notes": message})
    # Snapshot only the allowed context, then release database locks before the network call.
    context = {
        key: getattr(record, key) for key in ("title", "notes", "estimated_minutes", "priority")
    }
    instant = now()
    if g.login.ai_requested_at and instant - g.login.ai_requested_at < timedelta(seconds=10):
        raise APIError("Please wait a few seconds before requesting another suggestion.", 429)
    g.login.ai_requested_at = instant
    db.session.commit()
    provider = current_app.config.get("AI_PROVIDER") if current_app.testing else None
    result = provider(context) if provider else ai.suggest(context, current_app.config)
    try:
        result = ai.validate_suggestion(result)
    except ValueError:
        raise APIError(
            "AI assistance could not respond. Your planner is still available.", 503
        ) from None
    if result["status"] == "needs_details":
        message = "Please add more assignment requirements to Notes. " + result["message"]
        raise APIError(message, 422, {"notes": result["message"]})
    return jsonify({"steps": result["steps"], "source": "AI-generated suggestion", "saved": False})


@api.put("/assignments/<int:record_id>/breakdown")
@require_user
def accept_breakdown(record_id):
    lock_user()
    record = owned(assignment_query(), Assignment, record_id)
    data = body(["steps"])
    try:
        steps = ai.validate_steps(data.get("steps"))
    except ValueError:
        raise APIError(
            "Choose a valid task breakdown.", 422, {"steps": "Use 1–12 plain text steps."}
        ) from None
    record.breakdown = steps
    db.session.commit()
    return jsonify(assignment_json(record))
