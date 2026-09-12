"""Serve isolated synthetic history for browser check-in tests; never use the user's DB."""

import sys
import time
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from flask_migrate import upgrade  # noqa: E402
from werkzeug.serving import make_server  # noqa: E402

from studyflow import create_app  # noqa: E402
from studyflow.models import BusyTime, StudySession, db  # noqa: E402
from tests.conftest import T0, Client  # noqa: E402


def main():
    temp_root = ROOT / "tmp"
    temp_root.mkdir(exist_ok=True)
    stop_file = temp_root / "checkin-server.stop"
    stop_file.unlink(missing_ok=True)
    with TemporaryDirectory(prefix="checkin-e2e-", dir=temp_root) as directory:
        assert Path(directory).resolve().parent == temp_root.resolve()
        app = create_app(
            {
                "TESTING": True,
                "CLOCK": lambda: T0,
                "SQLALCHEMY_DATABASE_URI": "sqlite:///" + str(Path(directory) / "checkins.db"),
                "OPENAI_API_KEY": "",
                "OPENAI_MODEL": "",
                "PRODUCTION": False,
            }
        )
        with app.app_context():
            upgrade(directory=str(ROOT / "migrations"))
        for browser in ["chrome", "edge"]:
            seeded = app.test_cli_runner().invoke(
                args=[
                    "seed-demo",
                    "--email",
                    f"{browser}-demo@example.test",
                    "--password",
                    "correct password 123",
                ]
            )
            assert seeded.exit_code == 0, seeded.output
            # Each workflow owns its history, including when the entire suite runs together.
            for workflow in ("checkin", "ai-notes", "apply-settings", "session-details"):
                client = Client(app, email=f"{browser}-{workflow}@example.test")
                assignment = client.assignment(client.course()["id"], title="Confirm my study")
                with app.app_context():
                    db.session.add_all(
                        [
                            StudySession(
                                assignment_id=assignment["id"],
                                starts_at=T0 - timedelta(minutes=30),
                                minutes=30,
                            ),
                            StudySession(
                                assignment_id=assignment["id"],
                                starts_at=T0 + timedelta(minutes=30),
                                minutes=30,
                            ),
                        ]
                    )
                    db.session.commit()
            layout_client = Client(app, email=f"{browser}-layout@example.test")
            course = layout_client.course()
            work = layout_client.assignment(
                course["id"], title="Calendar layout work", estimated_minutes=900
            )
            with app.app_context():
                from studyflow.models import Course

                owner = db.session.get(Course, course["id"]).user_id
                db.session.add_all(
                    [
                        StudySession(
                            assignment_id=work["id"],
                            starts_at=T0 - timedelta(hours=i + 1),
                            minutes=30,
                        )
                        for i in range(20)
                    ]
                )
                db.session.add(
                    StudySession(
                        assignment_id=work["id"], starts_at=T0 + timedelta(minutes=30), minutes=30
                    )
                )
                db.session.add_all(
                    [
                        BusyTime(
                            user_id=owner,
                            name=f"Personal event {i + 1}",
                            kind="once",
                            starts_at=T0 + timedelta(days=i, minutes=30),
                            ends_at=T0 + timedelta(days=i, hours=1),
                        )
                        for i in range(20)
                    ]
                )
                db.session.commit()
            history_client = Client(app, email=f"{browser}-history@example.test")
            history_work = history_client.assignment(
                history_client.course()["id"], estimated_minutes=900
            )
            with app.app_context():
                for days_ago, minutes in [
                    (35, 60),
                    (27, 60),
                    (20, 90),
                    (9, 120),
                    (6, 45),
                    (3, 30),
                    (1, 75),
                ]:
                    db.session.add(
                        StudySession(
                            assignment_id=history_work["id"],
                            starts_at=T0 - timedelta(days=days_ago),
                            minutes=minutes,
                            outcome="completed",
                        )
                    )
                db.session.add(
                    StudySession(
                        assignment_id=history_work["id"],
                        starts_at=T0 - timedelta(hours=1),
                        minutes=30,
                        outcome="pending",
                    )
                )
                db.session.add(
                    StudySession(
                        assignment_id=history_work["id"],
                        starts_at=T0 - timedelta(days=2),
                        minutes=60,
                        outcome="missed",
                    )
                )
                db.session.commit()
        server = make_server("127.0.0.1", 5001, app, threaded=True)

        def stop_when_requested():
            while not stop_file.exists():
                time.sleep(0.1)
            server.shutdown()

        Thread(target=stop_when_requested, daemon=True).start()
        try:
            server.serve_forever(poll_interval=0.1)
        finally:
            server.server_close()
            with app.app_context():
                db.session.remove()
                db.engine.dispose()


if __name__ == "__main__":
    main()
