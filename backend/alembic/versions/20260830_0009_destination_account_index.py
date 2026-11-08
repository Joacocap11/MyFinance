"""Add missing index on transactions.destination_account_id.

Historical balance queries (and the pre-existing account_balance helper)
filter transactions by ``destination_account_id`` for the incoming side of
transfers. ``account_id`` was already indexed but its destination
counterpart was not.

Revision ID: 20260830_0009
Revises: 20260829_0008
"""

from alembic import op

revision = "20260830_0009"
down_revision = "20260829_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_transactions_destination_account_id",
        "transactions",
        ["destination_account_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_transactions_destination_account_id", table_name="transactions")
