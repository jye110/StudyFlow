import re
from datetime import UTC, datetime

from flask import request


class APIError(Exception):
    def __init__(self, message, status=400, fields=None):
        self.message, self.status, self.fields = message, status, fields or {}


def body(allowed):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise APIError("Send a JSON object.", 400)
    extra = set(data) - set(allowed)
    if extra:
        raise APIError(
            "Unrecognized fields.", 422, {key: "This field is not accepted." for key in extra}
        )
    return data


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError("Use a date and time with a timezone.")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None or not 2000 <= result.year <= 2100:
            raise ValueError()
        return result.astimezone(UTC).replace(tzinfo=None)
    except (ValueError, OverflowError):
        raise ValueError("Use a valid date and time from 2000–2100 with a timezone.") from None


def iso(value):
    return value.isoformat(timespec="seconds") + "Z"


def text(value, maximum, minimum=1):
    if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum:
        raise ValueError(f"Enter {minimum}–{maximum} characters.")
    return value.strip()


def integer(value, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f"Enter a whole number from {minimum} to {maximum}.")
    return value


def choice(value, options):
    if not isinstance(value, str) or value not in options:
        raise ValueError("Choose one of: " + ", ".join(options) + ".")
    return value


def email(value):
    value = text(value, 254).lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
        raise ValueError("Enter a valid email address.")
    return value


def password(value):
    if not isinstance(value, str) or not 10 <= len(value) <= 128:
        raise ValueError("Use 10–128 characters.")
    return value


def color(value):
    if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        raise ValueError("Choose a valid color.")
    return value.lower()


def validate(data, schema, partial=False):
    result, errors = {}, {}
    for key, validator in schema.items():
        if partial and key not in data:
            continue
        try:
            result[key] = validator(data.get(key))
        except ValueError as error:
            errors[key] = str(error)
    if errors:
        raise APIError("Check the highlighted fields.", 422, errors)
    return result


COURSE_SCHEMA = {"name": lambda v: text(v, 120), "code": lambda v: text(v, 30, 0), "color": color}
ASSIGNMENT_SCHEMA = {
    "course_id": lambda v: integer(v, 1, 2147483647),
    "title": lambda v: text(v, 200),
    "notes": lambda v: text(v, 4000, 0),
    "due_at": timestamp,
    "start_mode": lambda v: choice(v, ["now", "week_before", "custom"]),
    "start_at": lambda v: None if v is None else timestamp(v),
    "estimated_minutes": lambda v: integer(v, 1, 10080),
    "priority": lambda v: choice(v, ["High", "Medium", "Low"]),
    "status": lambda v: choice(v, ["Not Started", "In Progress", "Completed"]),
}
