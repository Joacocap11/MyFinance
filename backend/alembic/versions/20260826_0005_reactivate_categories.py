"""Restore active state for legacy categories with NULL flags.

Revision ID: 20260826_0005
Revises: 20260826_0004
"""

from collections.abc import Sequence
from alembic import op

revision: str = "20260826_0005"
down_revision: str | None = "20260826_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE categories SET is_active = TRUE WHERE is_active IS NULL")


def downgrade() -> None:
    pass
