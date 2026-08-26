"""Track the source of automatic categorization.

Revision ID: 20260826_0006
Revises: 20260826_0005
"""
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "20260826_0006"
down_revision: str | None = "20260826_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("category_source", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("transactions", "category_source")
