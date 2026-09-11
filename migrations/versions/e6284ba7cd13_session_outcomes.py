"""Track student-confirmed session outcomes without assuming past work was done."""

import sqlalchemy as sa
from alembic import op

revision = "e6284ba7cd13"
down_revision = "d5173a96bc02"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("study_session") as batch:
        batch.add_column(
            sa.Column("outcome", sa.String(10), nullable=False, server_default="pending")
        )
        batch.create_check_constraint(
            "session_outcome", "outcome IN ('pending','completed','missed')"
        )


def downgrade():
    with op.batch_alter_table("study_session") as batch:
        batch.drop_constraint("session_outcome", type_="check")
        batch.drop_column("outcome")
