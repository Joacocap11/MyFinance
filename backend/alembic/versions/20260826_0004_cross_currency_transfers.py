"""Support received amounts and transfer purposes.

Revision ID: 20260826_0004
Revises: 20260826_0003
"""

from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "20260826_0004"
down_revision: str | None = "20260826_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("destination_amount", sa.Numeric(14, 2), nullable=True))
    op.add_column("transactions", sa.Column("purpose", sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column("transactions", "purpose")
    op.drop_column("transactions", "destination_amount")
