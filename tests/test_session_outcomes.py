from datetime import timedelta

import pytest
from sqlalchemy.exc import OperationalError

from studyflow.models import db
from tests.conftest import T0, Client
from tests.test_remaining_planning import fill


def ended_session(app, client):
    assignment = client.assignment(client.course()["id"], estimated_minutes=60)
    original = client.plan().json["sessions"]
    app.config["CLOCK"] = lambda: T0 + timedelta(minutes=30)
    return assignment, original


def outcome(client, session, value):
    return client.send("PATCH", f"/sessions/{session['id']}/outcome", {"outcome": value})


def test_elapsed_session_stays_pending_without_assuming_assignment_progress(app, client):
    assignment, original = ended_session(app, client)
    assert original[0]["outcome"] == "pending"
    assert client.send("GET", f"/assignments/{assignment['id']}").json["status"] == "Not Started"
    assert client.send("GET", "/summary").json["confirmed_study_minutes"] == 0
    assert fill(client).json["unallocated"] == []
    assert fill(client).json["sessions"] == original


def test_completion_updates_progress_and_only_moves_not_started_to_in_progress(app, client):
    assignment, original = ended_session(app, client)
    response = outcome(client, original[0], "completed")
    assert response.status_code == 200 and response.json["outcome"] == "completed"
    assert client.send("GET", f"/assignments/{assignment['id']}").json["status"] == "In Progress"
    assert client.send("GET", "/summary").json["confirmed_study_minutes"] == 30
    app.config["CLOCK"] = lambda: T0 + timedelta(hours=1)
    assert outcome(client, original[1], "completed").status_code == 200
    assert client.send("GET", "/summary").json["confirmed_study_minutes"] == 60
    assert client.send("GET", f"/assignments/{assignment['id']}").json["status"] == "In Progress"
    before = client.send("GET", "/schedule").json
    assert outcome(client, original[1], "completed").status_code == 200
    assert client.send("GET", "/schedule").json == before


@pytest.mark.parametrize("mode", ["fill", "generate", "resize"])
def test_missed_history_is_not_credited_by_any_full_work_planner(app, client, mode):
    assignment, original = ended_session(app, client)
    assert outcome(client, original[0], "missed").status_code == 200
    before = client.send("GET", "/schedule").json
    assert before["unallocated"][0]["minutes"] == 30
    assert len(before["sessions"]) == 2
    if mode == "fill":
        result = fill(client)
    elif mode == "generate":
        result = client.plan()
    else:
        result = client.send("PATCH", f"/sessions/{original[1]['id']}", {"minutes": 45})
    assert result.status_code == 200
    after = client.send("GET", "/schedule").json
    assert not after["unallocated"]
    assert sum(s["minutes"] for s in after["sessions"] if s["outcome"] != "missed") == 60
    assert next(s for s in after["sessions"] if s["id"] == original[0]["id"])["outcome"] == "missed"
    assert client.send("GET", f"/assignments/{assignment['id']}").json["status"] == "Not Started"
    if mode == "fill":
        assert original[1] in after["sessions"]
        assert fill(client).json["sessions"] == after["sessions"]


def test_correcting_missed_to_completed_removes_excess_future_time(app, client):
    assignment, original = ended_session(app, client)
    outcome(client, original[0], "missed")
    filled = fill(client).json["sessions"]
    assert len(filled) == 3
    assert outcome(client, original[0], "completed").status_code == 200
    after = client.send("GET", "/schedule").json
    assert after["sessions"] == [{**original[0], "outcome": "completed"}, original[1]]
    assert not after["unallocated"]
    assert outcome(client, original[0], "missed").status_code == 200
    assert client.send("GET", "/summary").json["confirmed_study_minutes"] == 0
    assert client.send("GET", "/schedule").json["unallocated"][0]["minutes"] == 30
    assert client.send("GET", f"/assignments/{assignment['id']}").json["status"] == "In Progress"


def test_reducing_estimate_does_not_count_missed_history(app, client):
    assignment, original = ended_session(app, client)
    outcome(client, original[0], "missed")
    fill(client)
    assert (
        client.send(
            "PATCH", f"/assignments/{assignment['id']}", {"estimated_minutes": 45}
        ).status_code
        == 200
    )
    after = client.send("GET", "/schedule").json
    assert [s["minutes"] for s in after["sessions"]] == [30, 30, 15]
    assert not after["unallocated"]


@pytest.mark.parametrize("value", ["completed", "missed"])
def test_checkin_does_not_reopen_completed_assignment(app, client, value):
    assignment, original = ended_session(app, client)
    client.send("PATCH", f"/assignments/{assignment['id']}", {"status": "Completed"})
    assert outcome(client, original[0], value).status_code == 200
    assert client.send("GET", f"/assignments/{assignment['id']}").json["status"] == "Completed"
    assert not fill(client).json["unallocated"]
    assert len(fill(client).json["sessions"]) == 1


def test_checkin_requires_ended_session_and_keeps_historical_times_immutable(app, client):
    _, original = ended_session(app, client)
    assert outcome(client, original[1], "completed").status_code == 422
    app.config["CLOCK"] = lambda: T0 + timedelta(minutes=29, seconds=59)
    assert outcome(client, original[0], "completed").status_code == 422
    app.config["CLOCK"] = lambda: T0 + timedelta(minutes=30)
    assert outcome(client, original[0], "completed").status_code == 200
    assert (
        client.send("PATCH", f"/sessions/{original[0]['id']}", {"minutes": 15}).status_code == 422
    )
    assert client.send("DELETE", f"/sessions/{original[0]['id']}").status_code == 422


def test_checkin_owner_csrf_and_payload_validation(app, client):
    _, original = ended_session(app, client)
    other = Client(app, email="outcome-owner@example.test")
    assert outcome(other, original[0], "completed").status_code == 404
    path = f"/sessions/{original[0]['id']}/outcome"
    assert client.send("PATCH", path, {"outcome": "completed"}, headers={}).status_code == 403
    for data in [
        {},
        {"outcome": "pending"},
        {"outcome": True},
        {"outcome": "completed", "minutes": 2},
    ]:
        assert client.send("PATCH", path, data).status_code == 422
    assert client.send("GET", "/schedule").json["sessions"] == original


def test_checkin_rolls_back_outcome_assignment_and_trim_on_failure(app, client, monkeypatch):
    assignment, original = ended_session(app, client)
    outcome(client, original[0], "missed")
    filled = fill(client).json["sessions"]

    def fail():
        raise OperationalError("injected", {}, Exception("failure"))

    with monkeypatch.context() as patch:
        patch.setattr(db.session, "commit", fail)
        assert outcome(client, original[0], "completed").status_code == 503
    assert client.send("GET", "/schedule").json["sessions"] == filled
    assert client.send("GET", f"/assignments/{assignment['id']}").json["status"] == "Not Started"
