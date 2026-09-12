from datetime import timedelta

import click
from sqlalchemy import select
from werkzeug.security import generate_password_hash

from .auth import now
from .models import Assignment, Course, StudySession, User, db


def add_demo_history(user):
    """Append identifiable examples once; preserve any subsequent student edits."""
    if db.session.scalar(
        select(Course.id).where(Course.user_id == user.id, Course.code == "DEMO-HISTORY")
    ):
        return False
    instant = now().replace(second=0, microsecond=0)
    course = Course(
        user_id=user.id, name="Study history examples", code="DEMO-HISTORY", color="#0d9488"
    )
    db.session.add(course)
    db.session.flush()
    examples = [
        (
            "Demo: confirmed study",
            120,
            "In Progress",
            "Three completed sessions contribute 90 minutes to Progress. The assignment still has 30 minutes remaining.",
        ),
        (
            "Demo: awaiting confirmation",
            60,
            "Not Started",
            "Review the past 30-minute session in Study session check-in and choose Completed or Not completed.",
        ),
        (
            "Demo: missed study",
            60,
            "Not Started",
            "The past session was marked Not completed. Its time remains unscheduled; use Schedule remaining to plan it.",
        ),
    ]
    assignments = []
    for title, minutes, status, notes in examples:
        assignment = Assignment(
            course_id=course.id,
            title=title,
            notes=notes,
            due_at=instant + timedelta(days=7),
            estimated_minutes=minutes,
            priority="Medium",
            status=status,
        )
        db.session.add(assignment)
        assignments.append(assignment)
    db.session.flush()
    for index, age, minutes, outcome in [
        (0, timedelta(days=3), 30, "completed"),
        (0, timedelta(days=2), 45, "completed"),
        (0, timedelta(days=1), 15, "completed"),
        (1, timedelta(hours=2), 30, "pending"),
        (2, timedelta(hours=1), 30, "missed"),
    ]:
        db.session.add(
            StudySession(
                assignment_id=assignments[index].id,
                starts_at=instant - age,
                minutes=minutes,
                outcome=outcome,
            )
        )
    return True


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
        add_demo_history(user)
        db.session.commit()
        click.echo(f"Created synthetic demo account: {email}")

    @app.cli.command("seed-demo-history")
    @click.option("--email", default="demo@studyflow.local", show_default=True)
    def seed_demo_history(email):
        """Add past-session examples to an existing account without replacing its data."""
        user = db.session.scalar(select(User).where(User.email == email.lower()))
        if user is None:
            raise click.ClickException("Account not found. Create it with seed-demo first.")
        if add_demo_history(user):
            db.session.commit()
            click.echo("Added five past sessions: three completed, one pending and one missed.")
        else:
            click.echo("Study history examples already exist. No data was changed.")
