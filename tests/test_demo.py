from datetime import datetime, timedelta

from tests.conftest import T0, Client


def test_new_demo_contains_past_outcomes_and_usable_study_totals(app):
    result = app.test_cli_runner().invoke(
        args=["seed-demo"], input="demo test password\ndemo test password\n"
    )
    assert result.exit_code == 0, result.output
    client = Client(app, register=False)
    assert (
        client.send(
            "POST",
            "/auth/login",
            {"email": "demo@studyflow.local", "password": "demo test password"},
        ).status_code
        == 200
    )
    assert len(client.send("GET", "/courses").json) == 4
    assignments = client.send("GET", "/assignments").json
    assert len(assignments) == 10
    schedule = client.send("GET", "/schedule").json
    sessions = schedule["sessions"]
    assert sorted(s["outcome"] for s in sessions) == [
        "completed",
        "completed",
        "completed",
        "missed",
        "pending",
    ]
    for session in sessions:
        start = datetime.fromisoformat(session["starts_at"].removesuffix("Z"))
        assert T0 - timedelta(days=7) < start
        assert start + timedelta(minutes=session["minutes"]) < T0
    assert client.send("GET", "/summary").json["confirmed_study_minutes"] == 90
    remaining = {a["assignment_id"]: a["minutes"] for a in schedule["unallocated"]}
    for title, minutes in [
        ("Demo: confirmed study", 30),
        ("Demo: awaiting confirmation", 30),
        ("Demo: missed study", 60),
    ]:
        assignment = next(a for a in assignments if a["title"] == title)
        assert remaining[assignment["id"]] == minutes
    pending = next(s for s in sessions if s["outcome"] == "pending")
    assert (
        client.send(
            "PATCH", f"/sessions/{pending['id']}/outcome", {"outcome": "completed"}
        ).status_code
        == 200
    )
    assert client.send("GET", "/summary").json["confirmed_study_minutes"] == 120
    past = client.send("GET", "/schedule").json["sessions"]
    filled = client.plan().json
    assert all(session in filled["sessions"] for session in past)
    assert not filled["unallocated"]


def test_adding_history_preserves_existing_work_and_does_not_reset_examples(app, client):
    assignment = client.assignment(client.course()["id"])
    client.plan()
    original = client.send("GET", "/schedule").json
    runner = app.test_cli_runner()
    args = ["seed-demo-history", "--email", "a@example.test"]
    assert runner.invoke(args=args).exit_code == 0
    assert client.send("GET", f"/assignments/{assignment['id']}").json == assignment
    after = client.send("GET", "/schedule").json
    assert all(s in after["sessions"] for s in original["sessions"])
    assert after["settings"] == original["settings"]
    pending = next(
        s for s in after["sessions"] if s["assignment_title"] == "Demo: awaiting confirmation"
    )
    assert (
        client.send(
            "PATCH", f"/sessions/{pending['id']}/outcome", {"outcome": "missed"}
        ).status_code
        == 200
    )
    expected = client.send("GET", "/schedule").json
    repeated = runner.invoke(args=args)
    assert repeated.exit_code == 0 and "No data was changed" in repeated.output
    assert client.send("GET", "/schedule").json == expected
    other = Client(app, email="other@example.test")
    assert other.send("GET", "/courses").json == []


def test_seed_demo_still_refuses_to_overwrite_existing_account(app, client):
    original = client.send("GET", "/courses").json
    result = app.test_cli_runner().invoke(
        args=["seed-demo", "--email", "a@example.test"],
        input="demo test password\ndemo test password\n",
    )
    assert result.exit_code != 0 and "Account already exists" in result.output
    assert client.send("GET", "/courses").json == original
    assert client.send("GET", "/schedule").json["sessions"] == []


def test_history_requires_existing_account(app):
    result = app.test_cli_runner().invoke(args=["seed-demo-history"])
    assert result.exit_code != 0 and "Account not found" in result.output
