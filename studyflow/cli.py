from datetime import timedelta

import click
from sqlalchemy import select
from werkzeug.security import generate_password_hash

from .auth import now
from .models import Assignment, Course, User, db


def register_cli(app):
    @app.cli.command("seed-demo")
    @click.option("--email", default="demo@studyflow.local", show_default=True)
    @click.option(
        "--password",
        prompt=True,
        hide_input=True,
        confirmation_prompt=True,
        help="Demo password, at least 10 characters.",
    )
    def seed_demo(email, password):
        """Create a synthetic demo account, without changing existing accounts."""
        if len(password) < 10:
            raise click.ClickException("Use a password of at least 10 characters.")
        if db.session.scalar(select(User).where(User.email == email.lower())):
            raise click.ClickException("Account already exists. No data was changed.")
        user = User(
            name="Alex", email=email.lower(), password_hash=generate_password_hash(password)
        )
        db.session.add(user)
        db.session.flush()
        definitions = [
            ("Software Engineering", "CS 2101", "#2563eb"),
            ("Database Systems", "CS 2204", "#8b5cf6"),
            ("Applied Statistics", "MATH 201", "#0d9488"),
        ]
        courses = [Course(user_id=user.id, name=n, code=c, color=cl) for n, c, cl in definitions]
        db.session.add_all(courses)
        db.session.flush()
        work = [
            (0, "Prepare the project demonstration", 3, 120, "High", "In Progress"),
            (1, "Practice normalization problems", 2, 90, "High", "Not Started"),
            (2, "Review hypothesis testing", 5, 60, "Medium", "Not Started"),
            (0, "Review the testing plan", 1, 60, "High", "Not Started"),
            (1, "Complete SQL practice set", -1, 45, "Medium", "Not Started"),
            (2, "Submit probability worksheet", -2, 30, "Low", "Completed"),
            (0, "Finalize use case diagrams", -1, 45, "Medium", "Completed"),
        ]
        for idx, title, days, minutes, priority, status in work:
            db.session.add(
                Assignment(
                    course_id=courses[idx].id,
                    title=title,
                    notes="",
                    due_at=(now() + timedelta(days=days)).replace(hour=23, minute=59),
                    estimated_minutes=minutes,
                    priority=priority,
                    status=status,
                )
            )
        db.session.commit()
        click.echo(f"Created synthetic demo account: {email}")
