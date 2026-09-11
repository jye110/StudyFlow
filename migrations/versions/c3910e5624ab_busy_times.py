"""Add personal busy times."""

import sqlalchemy as sa
from alembic import op

revision = "c3910e5624ab"
down_revision = "b120a731e082"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "busy_time",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("starts_at", sa.DateTime()),
        sa.Column("ends_at", sa.DateTime()),
        sa.Column("weekdays", sa.JSON(), nullable=False),
        sa.Column("start_time", sa.String(5)),
        sa.Column("end_time", sa.String(5)),
        sa.Column("timezone", sa.String(100), nullable=False),
    )
    op.create_index("ix_busy_time_user_id", "busy_time", ["user_id"])


def downgrade():
    op.drop_table("busy_time")
