from datetime import timedelta

import pytest

from studyflow.validation import iso
from tests.conftest import T0, Client
from tests.test_busy_times import once, weekly


def test_calendar_events_expand_repeats_and_preserve_rule_identity(app, client):
    one = once(client, start=T0, end=T0 + timedelta(hours=2), name="Lunch")
    repeated = client.send("POST", "/busy-times", weekly()).json
    other = Client(app, email="other-calendar@example.test")
    once(other, name="Private event")
    response = client.send(
        "GET", f"/calendar-events?start={iso(T0)}&end={iso(T0 + timedelta(days=2))}"
    )
    assert response.status_code == 200
    events = response.json["events"]
    assert len(events) == 3
    assert {event["busy_time_id"] for event in events} == {one["id"], repeated["id"]}
    assert len({event["id"] for event in events}) == 3
    assert events[0]["title"] == "Lunch"
    assert events[0]["starts_at"] == iso(T0)
    assert all(event["title"] != "Private event" for event in events)


def test_calendar_event_overnight_includes_previous_day_start(client):
    response = client.send(
        "POST", "/busy-times", weekly(weekdays=[3], start_time="23:00", end_time="01:00")
    )
    assert response.status_code == 201
    start = T0.replace(hour=0) + timedelta(days=1)
    events = client.send(
        "GET", f"/calendar-events?start={iso(start)}&end={iso(start + timedelta(days=1))}"
    ).json["events"]
    assert len(events) == 1
    assert events[0]["starts_at"] == iso(start - timedelta(hours=1))
    assert events[0]["ends_at"] == iso(start + timedelta(hours=1))


@pytest.mark.parametrize(
    "query",
    [
        "",
        "start=bad&end=bad",
        f"start={iso(T0)}&end={iso(T0)}",
        f"start={iso(T0)}&end={iso(T0 + timedelta(days=33))}",
    ],
)
def test_calendar_range_validation(client, query):
    assert client.send("GET", f"/calendar-events?{query}").status_code == 422
