from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from studyflow.models import Assignment, Course, StudySession, db
from tests.conftest import T0, Client


def test_tc04_tc05_crud_cascade_and_unicode(app, client):
    course = client.course(name="软件工程 <script>alert(1)</script>")
    assignment = client.assignment(course["id"], title="O'Reilly — 学习")
    client.plan()
    result = client.send("PATCH", f"/courses/{course['id']}", {"code": "CS 999"})
    assert result.json["code"] == "CS 999"
    result = client.send(
        "PATCH",
        f"/assignments/{assignment['id']}",
        {"title": "New title", "priority": "Low", "estimated_minutes": 90},
    )
    assert result.json["title"] == "New title"
    assert result.json["priority"] == "Low"
    assert result.json["estimated_minutes"] == 90
    assert client.send("GET", f"/courses/{course['id']}").json["name"].startswith("软件工程")
    assert client.send("DELETE", f"/courses/{course['id']}").status_code == 204
    assert client.send("GET", "/assignments").json == []
    assert client.send("GET", "/schedule").json["sessions"] == []
    with app.app_context():
        for model in (Course, Assignment, StudySession):
            assert db.session.scalar(select(db.func.count()).select_from(model)) == 0


@pytest.mark.parametrize(
    "field,value",
    [
        ("title", ""),
        ("title", "x" * 201),
        ("title", 4),
        ("due_at", "not a date"),
        ("due_at", "2026-09-11T09:00:00"),
        ("due_at", "2101-01-01T00:00:00Z"),
        ("estimated_minutes", 0),
        ("estimated_minutes", -1),
        ("estimated_minutes", 10081),
        ("estimated_minutes", True),
        ("estimated_minutes", 1.5),
        ("estimated_minutes", "30"),
        ("priority", "Urgent"),
        ("status", "done"),
        ("status", None),
        ("course_id", -1),
        ("notes", "x" * 4001),
    ],
)
def test_tc06_tc29_invalid_assignment_no_partial_update(client, field, value):
    course = client.course()
    a = client.assignment(course["id"])
    response = client.send("PATCH", f"/assignments/{a['id']}", {"title": "Changed", field: value})
    assert response.status_code == 422
    assert field in response.json["fields"]
    assert client.send("GET", f"/assignments/{a['id']}").json == a


@pytest.mark.parametrize("minutes", [1, 10079, 10080])
@pytest.mark.parametrize("length", [199, 200])
def test_tc06_valid_boundaries(client, minutes, length):
    course = client.course()
    a = client.assignment(course["id"], title="x" * length, estimated_minutes=minutes)
    assert len(a["title"]) == length and a["estimated_minutes"] == minutes


def test_tc07_tc09_tc10_tc11_tc13_f2_summary_cleanup(client):
    course = client.course()
    a1 = client.assignment(course["id"], title="A1")
    client.assignment(
        course["id"], title="A2", estimated_minutes=30, priority="Low", status="In Progress"
    )
    client.assignment(
        course["id"],
        title="A3",
        due_at="2026-09-12T09:00:00Z",
        estimated_minutes=90,
        priority="Medium",
    )
    client.assignment(
        course["id"],
        title="A4",
        due_at="2026-09-10T21:00:00Z",
        estimated_minutes=30,
        status="Completed",
    )
    plan = client.plan()
    assert plan.status_code == 200
    assert len(plan.json["sessions"]) == 6
    assert sum(s["minutes"] for s in plan.json["sessions"]) == 180
    for _ in range(2):
        repeated = client.plan().json["sessions"]
        assert len(repeated) == 6
        assert sum(s["minutes"] for s in repeated) == 180
    client.assignment(course["id"], title="A5", due_at="2026-09-10T08:59:59Z", estimated_minutes=20)
    summary = client.send("GET", "/summary").json
    assert (
        len(summary["upcoming"]),
        summary["completed"],
        summary["overdue_count"],
        summary["planned_minutes"],
    ) == (3, 1, 1, 180)
    for _ in range(2):
        assert (
            client.send("PATCH", f"/assignments/{a1['id']}", {"status": "Completed"}).status_code
            == 200
        )
    summary = client.send("GET", "/summary").json
    assert (summary["completed"], summary["planned_minutes"]) == (2, 120)
    assert all(
        s["assignment_id"] != a1["id"] for s in client.send("GET", "/schedule").json["sessions"]
    )
    assert (
        client.send("PATCH", f"/assignments/{a1['id']}", {"status": "In Progress"}).json["status"]
        == "In Progress"
    )
    assert (
        client.send("PATCH", f"/assignments/{a1['id']}", {"status": "Not Started"}).json["status"]
        == "Not Started"
    )


def test_tc08_session_edits_overlap_validation(client):
    course = client.course()
    client.assignment(course["id"])
    session = client.plan().json["sessions"][0]
    path = f"/sessions/{session['id']}"
    assert client.send("GET", path).json == session
    assert (
        client.send("PATCH", path, {"starts_at": "2026-09-10T11:00:00Z", "minutes": 45}).status_code
        == 200
    )
    assert client.send("GET", path).json["minutes"] == 45
    for data in [
        {"minutes": 0},
        {"minutes": -1},
        {"starts_at": "bad"},
        {"starts_at": "2026-09-11T08:50:00Z"},
        {"starts_at": "2026-09-09T11:00:00Z"},
    ]:
        assert client.send("PATCH", path, data).status_code == 422
        assert client.send("GET", path).json["minutes"] == 45


def test_tc09_regeneration_preserves_history_and_credits(app, client):
    course = client.course()
    a = client.assignment(course["id"])
    original = client.plan().json["sessions"]
    app.config["CLOCK"] = lambda: T0 + timedelta(minutes=15)
    repeated = client.plan().json["sessions"]
    assert sum(s["minutes"] for s in repeated) == 60
    assert any(s["id"] == original[0]["id"] for s in repeated)
    assert len(repeated) == 2
    assert (
        client.send("PATCH", f"/sessions/{original[0]['id']}", {"minutes": 20}).status_code == 422
    )
    client.send("PATCH", f"/assignments/{a['id']}", {"estimated_minutes": 90})
    assert sum(s["minutes"] for s in client.plan().json["sessions"]) == 90
    client.send("PATCH", f"/assignments/{a['id']}", {"status": "Completed"})
    assert len(client.send("GET", "/schedule").json["sessions"]) == 1


def test_tc09_concurrent_regeneration(app, client):
    course = client.course()
    client.assignment(course["id"])
    from studyflow.auth import COOKIE

    cookie = client.client.get_cookie(COOKIE).value

    def run(_):
        c = app.test_client()
        c.set_cookie(COOKIE, cookie)
        return c.post(
            "/api/schedule/generate",
            headers={"X-CSRF-Token": client.token},
            json={"timezone": "UTC", "start_hour": 9, "daily_minutes": 180, "horizon_days": 30},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(run, range(2)))
    assert all(r.status_code == 200 for r in responses)
    assert len(client.send("GET", "/schedule").json["sessions"]) == 2


def test_tc11_transaction_rollback(app, client, monkeypatch):
    course = client.course()
    a = client.assignment(course["id"])
    client.plan()
    with monkeypatch.context() as patch:

        def fail():
            raise OperationalError("injected", {}, Exception("failure"))

        patch.setattr(db.session, "commit", fail)
        assert (
            client.send("PATCH", f"/assignments/{a['id']}", {"status": "Completed"}).status_code
            == 503
        )
    assert client.send("GET", f"/assignments/{a['id']}").json["status"] == "Not Started"
    assert len(client.send("GET", "/schedule").json["sessions"]) == 2


def test_tc12_time_and_timezone_boundary(app, client):
    course = client.course()
    a = client.assignment(course["id"], due_at="2026-09-10T02:00:00-07:00")
    for offset, expected in [(-1, False), (0, False), (1, True)]:
        app.config["CLOCK"] = lambda: T0 + timedelta(seconds=offset)
        assert client.send("GET", f"/assignments/{a['id']}").json["overdue"] is expected
        assert client.send("GET", "/summary").json["overdue_count"] == int(expected)
    client.send("PATCH", f"/assignments/{a['id']}", {"status": "Completed"})
    assert client.send("GET", "/summary").json["overdue_count"] == 0


def test_tc27_cross_user_matrix(app, client):
    course = client.course()
    a = client.assignment(course["id"])
    session = client.plan().json["sessions"][0]
    other = Client(app, email="b@example.test", ip="10.2.2.2")
    for resource, id in [
        ("courses", course["id"]),
        ("assignments", a["id"]),
        ("sessions", session["id"]),
    ]:
        for method in ["GET", "PATCH"] + (["DELETE"] if resource != "sessions" else []):
            assert (
                other.send(method, f"/{resource}/{id}", {} if method != "GET" else None).status_code
                == 404
            )
    for route, method in [
        (f"/assignments/{a['id']}/ai-suggestion", "POST"),
        (f"/assignments/{a['id']}/breakdown", "PUT"),
    ]:
        assert other.send(method, route, {}).status_code == 404
    payload = {
        key: a[key]
        for key in (
            "course_id",
            "title",
            "notes",
            "due_at",
            "estimated_minutes",
            "priority",
            "status",
        )
    }
    assert other.send("POST", "/assignments", payload).status_code == 404
    assert other.send("GET", "/courses").json == []
    assert other.send("GET", "/assignments").json == []
    assert other.send("GET", "/summary").json["total"] == 0
    assert other.plan().json["sessions"] == []
    assert client.send("GET", f"/assignments/{a['id']}").json == a


def test_tc29_malformed_unknown_fields_and_fk_integrity(client, app):
    course = client.course()
    assert client.send("POST", "/assignments", {}).status_code == 422
    assert client.send("PATCH", f"/courses/{course['id']}", {"user_id": 999}).status_code == 422
    assert client.send("POST", "/courses", []).status_code == 400
    response = client.client.post(
        "/api/courses",
        data="{bad",
        content_type="application/json",
        headers={"X-CSRF-Token": client.token},
    )
    assert response.status_code == 400
    assert (
        client.send(
            "POST",
            "/schedule/generate",
            {"timezone": "bad/zone", "start_hour": 99, "daily_minutes": -1, "horizon_days": 0},
        ).status_code
        == 422
    )
    with app.app_context():
        db.session.add(
            Assignment(
                course_id=999,
                title="orphan",
                due_at=T0,
                estimated_minutes=10,
                priority="High",
                status="Not Started",
            )
        )
        from sqlalchemy.exc import IntegrityError

        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()
