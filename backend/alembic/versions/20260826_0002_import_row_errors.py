"""Allow invalid CSV rows in import previews.

Revision ID: 20260826_0002
Revises: 20260825_0001
Create Date: 2026-08-26
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260826_0002"
down_revision: str | None = "20260825_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("import_rows") as batch_op:
        batch_op.alter_column("date", existing_type=sa.Date(), nullable=True)
        batch_op.alter_column("amount", existing_type=sa.Numeric(14, 2), nullable=True)
        batch_op.alter_column("kind", existing_type=sa.String(length=8), nullable=True)
        batch_op.alter_column(
            "semantic_fingerprint", existing_type=sa.String(length=80), nullable=True
        )
        batch_op.add_column(sa.Column("error", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.execute(
        "DELETE FROM import_rows "
        "WHERE error IS NOT NULL OR date IS NULL OR amount IS NULL "
        "OR kind IS NULL OR semantic_fingerprint IS NULL"
    )
    with op.batch_alter_table("import_rows") as batch_op:
        batch_op.drop_column("error")
        batch_op.alter_column(
            "semantic_fingerprint", existing_type=sa.String(length=80), nullable=False
        )
        batch_op.alter_column("kind", existing_type=sa.String(length=8), nullable=False)
        batch_op.alter_column("amount", existing_type=sa.Numeric(14, 2), nullable=False)
        batch_op.alter_column("date", existing_type=sa.Date(), nullable=False)
