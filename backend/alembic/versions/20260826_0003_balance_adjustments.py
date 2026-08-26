"""Add auditable account balance adjustments.

Revision ID: 20260826_0003
Revises: 20260826_0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260826_0003"
down_revision: str | None = "20260826_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "balance_adjustments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("note", sa.String(length=240), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "amount >= -99999999999.99 AND amount <= 99999999999.99",
            name="ck_balance_adjustments_amount",
        ),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
    )
    op.create_index("ix_balance_adjustments_account_id", "balance_adjustments", ["account_id"])
    op.create_index("ix_balance_adjustments_date", "balance_adjustments", ["date"])


def downgrade() -> None:
    op.drop_index("ix_balance_adjustments_date", table_name="balance_adjustments")
    op.drop_index("ix_balance_adjustments_account_id", table_name="balance_adjustments")
    op.drop_table("balance_adjustments")
