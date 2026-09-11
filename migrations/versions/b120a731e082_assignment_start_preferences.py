"""Add assignment start preferences without changing existing plans."""

import sqlalchemy as sa
from alembic import op

revision = "b120a731e082"
down_revision = "7d327d8dafc4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "assignment", sa.Column("start_mode", sa.String(20), server_default="now", nullable=False)
    )
    op.add_column("assignment", sa.Column("start_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("assignment", "start_at")
    op.drop_column("assignment", "start_mode")
