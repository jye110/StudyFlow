from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import CheckConstraint

db = SQLAlchemy()


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(254), nullable=False, unique=True)
    name = db.Column(db.String(80), nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    planning_settings = db.Column(db.JSON)


class LoginSession(db.Model):
    token_hash = db.Column(db.String(64), primary_key=True)
    csrf = db.Column(db.String(64), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"))
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    ai_requested_at = db.Column(db.DateTime)


class LoginLimit(db.Model):
    key = db.Column(db.String(64), primary_key=True)
    failures = db.Column(db.JSON, nullable=False, default=list)
    blocked_until = db.Column(db.DateTime)


class Course(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = db.Column(db.String(120), nullable=False)
    code = db.Column(db.String(30), nullable=False, default="")
    color = db.Column(db.String(7), nullable=False, default="#2563eb")


class Assignment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(
        db.Integer, db.ForeignKey("course.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = db.Column(db.String(200), nullable=False)
    notes = db.Column(db.Text, nullable=False, default="")
    due_at = db.Column(db.DateTime, nullable=False, index=True)
    start_mode = db.Column(db.String(20), nullable=False, default="now", server_default="now")
    start_at = db.Column(db.DateTime)
    estimated_minutes = db.Column(db.Integer, nullable=False)
    priority = db.Column(db.String(10), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="Not Started")
    breakdown = db.Column(db.JSON)
    course = db.relationship(Course)
    __table_args__ = (
        CheckConstraint("estimated_minutes BETWEEN 1 AND 10080", name="assignment_minutes"),
        CheckConstraint("priority IN ('High','Medium','Low')", name="assignment_priority"),
        CheckConstraint(
            "status IN ('Not Started','In Progress','Completed')", name="assignment_status"
        ),
    )


class StudySession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(
        db.Integer, db.ForeignKey("assignment.id", ondelete="CASCADE"), nullable=False, index=True
    )
    starts_at = db.Column(db.DateTime, nullable=False, index=True)
    minutes = db.Column(db.Integer, nullable=False)
    outcome = db.Column(db.String(10), nullable=False, default="pending", server_default="pending")
    assignment = db.relationship(Assignment)
    __table_args__ = (
        CheckConstraint("minutes BETWEEN 1 AND 240", name="session_minutes"),
        CheckConstraint("outcome IN ('pending','completed','missed')", name="session_outcome"),
    )


class BusyTime(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = db.Column(db.String(120), nullable=False, default="")
    kind = db.Column(db.String(10), nullable=False)
    starts_at = db.Column(db.DateTime)
    ends_at = db.Column(db.DateTime)
    weekdays = db.Column(db.JSON, nullable=False, default=list)
    start_time = db.Column(db.String(5))
    end_time = db.Column(db.String(5))
    timezone = db.Column(db.String(100), nullable=False, default="UTC")
