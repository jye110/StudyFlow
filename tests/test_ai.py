import json
from datetime import timedelta
from unittest.mock import Mock

import pytest
import requests

from studyflow.ai import build_payload, suggest, validate_suggestion
from studyflow.models import Assignment, db
from tests.conftest import T0

NOTES = "Compare merge sort and insertion sort on random arrays; submit a runtime analysis report."


def ready(steps):
    return {"status": "ready", "message": "", "steps": steps}


def test_tc14_accept_dismiss_persistence_and_idempotence(app, client):
    a = client.assignment(client.course()["id"], notes=NOTES)
    steps = ["Read the assignment brief.", "Outline the work.", "Review your plan."]
    app.config["AI_PROVIDER"] = lambda _: ready(steps)
    response = client.send("POST", f"/assignments/{a['id']}/ai-suggestion", {})
    assert response.json == {"steps": steps, "source": "AI-generated suggestion", "saved": False}
    assert client.send("GET", f"/assignments/{a['id']}").json["breakdown"] is None
    # Dismiss is intentionally local: no persistence request is made.
    app.config["CLOCK"] = lambda: T0 + timedelta(seconds=11)
    assert client.send("POST", f"/assignments/{a['id']}/ai-suggestion", {}).status_code == 200
    for _ in range(2):
        assert (
            client.send("PUT", f"/assignments/{a['id']}/breakdown", {"steps": steps}).status_code
            == 200
        )
    assert client.send("GET", f"/assignments/{a['id']}").json["breakdown"] == steps
    assert len(client.plan().json["sessions"]) == 2
    with app.app_context():
        assert db.session.get(Assignment, a["id"]).breakdown == steps


def test_tc15_tc20_ai_disabled_does_not_block_core(client):
    course = client.course()
    a = client.assignment(course["id"], notes=NOTES)
    result = client.send("POST", f"/assignments/{a['id']}/ai-suggestion", {})
    assert result.status_code == 503
    assert "unavailable" in result.json["error"]
    assert len(client.plan().json["sessions"]) == 2
    assert (
        client.send("PATCH", f"/assignments/{a['id']}", {"status": "Completed"}).status_code == 200
    )
    assert client.send("GET", "/summary").json["completed"] == 1
    assert client.send("DELETE", f"/assignments/{a['id']}").status_code == 204
    assert client.send("DELETE", f"/courses/{course['id']}").status_code == 204


@pytest.mark.parametrize(
    "failure",
    ["timeout", "connection", "429", "500", "empty", "malformed", "schema", "markup", "incomplete"],
)
def test_tc15_provider_faults_preserve_planner(app, client, monkeypatch, failure):
    a = client.assignment(client.course()["id"], notes=NOTES)
    app.config.update(OPENAI_API_KEY="test-only-provider-key", OPENAI_MODEL="test-model")
    response = Mock()
    response.raise_for_status.return_value = None
    response.json.return_value = {
        "status": "completed",
        "output": [
            {
                "type": "message",
                "content": [
                    {
                        "type": "output_text",
                        "text": json.dumps(ready(["Read brief", "Plan work"])),
                    }
                ],
            }
        ],
    }
    post = Mock(return_value=response)
    if failure == "timeout":
        post.side_effect = requests.Timeout("sensitive diagnostic")
    elif failure == "connection":
        post.side_effect = requests.ConnectionError("sensitive diagnostic")
    elif failure in ("429", "500"):
        response.raise_for_status.side_effect = requests.HTTPError(failure)
    elif failure == "empty":
        response.json.return_value = {"status": "completed", "output": []}
    elif failure == "malformed":
        response.json.side_effect = ValueError("not json")
    elif failure == "schema":
        response.json.return_value = {"wrong": "schema"}
    elif failure == "incomplete":
        response.json.return_value = {"status": "incomplete", "output": []}
    else:
        response.json.return_value["output"][0]["content"][0]["text"] = json.dumps(
            ready(["<img onerror=bad>"])
        )
    monkeypatch.setattr("studyflow.ai.requests.post", post)
    result = client.send("POST", f"/assignments/{a['id']}/ai-suggestion", {})
    assert result.status_code == 503
    assert "sensitive diagnostic" not in str(result.json)
    assert "test-only-provider-key" not in str(result.json)
    assert client.send("GET", f"/assignments/{a['id']}").json["breakdown"] is None
    assert client.send("PATCH", f"/assignments/{a['id']}", {"priority": "Low"}).status_code == 200
    assert client.send("PATCH", "/courses/1", {"name": "Still working"}).status_code == 200
    assert client.plan().status_code == 200
    assert client.send("GET", "/summary").status_code == 200


def test_tc34_payload_allowlist_and_success(monkeypatch):
    assignment = {
        "title": "Read chapters 1–2",
        "estimated_minutes": 60,
        "priority": "High",
        "email": "SECRET_ACCOUNT",
        "password_hash": "SECRET_HASH",
        "notes": NOTES,
    }
    payload = build_payload(assignment, "configured-model")
    assert json.loads(payload["input"]) == {
        "title": assignment["title"],
        "estimated_minutes": 60,
        "priority": "High",
        "notes": NOTES,
    }
    assert "SECRET" not in json.dumps(payload)
    assert payload["store"] is False
    response = Mock()
    response.json.return_value = {
        "status": "completed",
        "output": [
            {
                "type": "message",
                "content": [
                    {
                        "type": "output_text",
                        "text": json.dumps(ready(["Read the brief", "Make a plan"])),
                    }
                ],
            }
        ],
    }
    post = Mock(return_value=response)
    monkeypatch.setattr("studyflow.ai.requests.post", post)
    assert suggest(
        assignment, {"OPENAI_API_KEY": "test-key", "OPENAI_MODEL": "configured-model"}
    ) == ready(["Read the brief", "Make a plan"])
    assert post.call_args.kwargs["timeout"] == (3, 7)
    assert post.call_args.args[0].startswith("https://")
    assert "test-key" not in json.dumps(post.call_args.kwargs["json"])


@pytest.mark.parametrize(
    "steps", [[], [""], ["x" * 501], ["<script>bad</script>"], [1], "bad", ["step"] * 13]
)
def test_tc29_invalid_breakdown(client, steps):
    a = client.assignment(client.course()["id"])
    assert (
        client.send("PUT", f"/assignments/{a['id']}/breakdown", {"steps": steps}).status_code == 422
    )
    assert client.send("GET", f"/assignments/{a['id']}").json["breakdown"] is None


def test_ai_request_throttling_and_invalid_stub(app, client):
    a = client.assignment(client.course()["id"], notes=NOTES)
    app.config["AI_PROVIDER"] = lambda _: []
    assert client.send("POST", f"/assignments/{a['id']}/ai-suggestion", {}).status_code == 503
    assert client.send("POST", f"/assignments/{a['id']}/ai-suggestion", {}).status_code == 429


@pytest.mark.parametrize("notes", ["", "   \n\t"])
def test_empty_notes_rejected_before_provider_and_throttle(app, client, notes):
    a = client.assignment(client.course()["id"], notes=notes)
    provider = Mock(return_value=ready(["Compare sorting runtimes."]))
    app.config["AI_PROVIDER"] = provider
    result = client.send("POST", f"/assignments/{a['id']}/ai-suggestion", {})
    assert result.status_code == 422
    assert "Notes" in result.json["error"]
    assert "notes" in result.json["fields"]
    provider.assert_not_called()
    client.send("PATCH", f"/assignments/{a['id']}", {"notes": NOTES})
    assert client.send("POST", f"/assignments/{a['id']}/ai-suggestion", {}).status_code == 200
    assert set(provider.call_args.args[0]) == {"title", "notes", "estimated_minutes", "priority"}
    assert provider.call_args.args[0]["notes"] == NOTES


def test_insufficient_notes_returns_actionable_reminder_preserves_saved_work(
    app, client, monkeypatch
):
    a = client.assignment(client.course()["id"], notes="do homework")
    previous = ["Previously accepted step"]
    client.send("PUT", f"/assignments/{a['id']}/breakdown", {"steps": previous})
    app.config.update(OPENAI_API_KEY="test-key", OPENAI_MODEL="test-model")
    result = {
        "status": "needs_details",
        "message": "Specify the topic and required deliverable.",
        "steps": [],
    }
    response = Mock()
    response.json.return_value = {
        "status": "completed",
        "output": [
            {"type": "message", "content": [{"type": "output_text", "text": json.dumps(result)}]}
        ],
    }
    post = Mock(return_value=response)
    monkeypatch.setattr("studyflow.ai.requests.post", post)
    reply = client.send("POST", f"/assignments/{a['id']}/ai-suggestion", {})
    assert reply.status_code == 422
    assert result["message"] in reply.json["error"]
    assert "steps" not in reply.json
    assert client.send("GET", f"/assignments/{a['id']}").json["breakdown"] == previous
    assert json.loads(post.call_args.kwargs["json"]["input"])["notes"] == "do homework"


@pytest.mark.parametrize(
    "result",
    [
        {"status": "needs_details", "message": "Add topic", "steps": ["Generic advice"]},
        {"status": "needs_details", "message": " ", "steps": []},
        {"status": "needs_details", "message": "<script>bad</script>", "steps": []},
        {"status": "ready", "message": "Add more details", "steps": ["A step"]},
        {"status": "ready", "message": "", "steps": []},
        {"status": "unknown", "message": "", "steps": ["A step"]},
        {"steps": ["Old format without assessment"]},
    ],
)
def test_contradictory_or_invalid_assessments_are_rejected(result):
    with pytest.raises(ValueError):
        validate_suggestion(result)
