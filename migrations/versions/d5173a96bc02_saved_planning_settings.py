"""Keep the settings used for automatic session compensation."""

import sqlalchemy as sa
from alembic import op

revision = "d5173a96bc02"
down_revision = "c3910e5624ab"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("user", sa.Column("planning_settings", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("user", "planning_settings")
