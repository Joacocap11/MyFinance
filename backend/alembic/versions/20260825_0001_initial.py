"""Initial MyFinance schema.

Revision ID: 20260825_0001
Revises:
Create Date: 2026-08-25
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260825_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

currency = sa.Enum("UYU", "USD", name="currency", native_enum=False, length=3)
kind = sa.Enum("income", "expense", "transfer", name="transactionkind", native_enum=False, length=8)
import_state = sa.Enum(
    "uploaded", "previewed", "confirmed", name="importstate", native_enum=False, length=10
)
disposition = sa.Enum(
    "import",
    "skip",
    "possible_duplicate",
    name="importdisposition",
    native_enum=False,
    length=18,
)


def timestamps() -> list[sa.Column[object]]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("currency", currency, nullable=False),
        sa.Column("opening_balance", sa.Numeric(14, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamps(),
        sa.CheckConstraint(
            "opening_balance >= -99999999999.99 AND opening_balance <= 99999999999.99",
            name="ck_accounts_opening_balance",
        ),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("kind", kind, nullable=False),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamps(),
        sa.CheckConstraint("kind IN ('income', 'expense')", name="ck_categories_kind"),
        sa.UniqueConstraint("kind", "name", "parent_id", name="uq_category_scope"),
    )
    op.create_table(
        "monthly_budgets",
        sa.Column("currency", currency, primary_key=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        *timestamps(),
        sa.CheckConstraint("amount > 0 AND amount <= 99999999999.99", name="ck_budget_amount"),
    )
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("kind", kind, nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("description", sa.String(240), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column(
            "destination_account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=True
        ),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("origin_key", sa.String(80), nullable=True),
        sa.Column("semantic_fingerprint", sa.String(80), nullable=True),
        *timestamps(),
        sa.CheckConstraint(
            "amount > 0 AND amount <= 99999999999.99", name="ck_transactions_amount"
        ),
        sa.CheckConstraint(
            "(kind = 'transfer' AND destination_account_id IS NOT NULL AND category_id IS NULL) "
            "OR (kind IN ('income', 'expense') AND destination_account_id IS NULL)",
            name="ck_transactions_shape",
        ),
        sa.CheckConstraint(
            "destination_account_id IS NULL OR account_id <> destination_account_id",
            name="ck_transactions_distinct_accounts",
        ),
        sa.UniqueConstraint("origin_key"),
    )
    op.create_index("ix_transactions_date", "transactions", ["date"])
    op.create_index("ix_transactions_account_id", "transactions", ["account_id"])
    op.create_index("ix_transactions_category_id", "transactions", ["category_id"])
    op.create_index("ix_transactions_date_kind", "transactions", ["date", "kind"])
    op.create_index(
        "ix_transactions_semantic_fingerprint", "transactions", ["semantic_fingerprint"]
    )
    op.create_table(
        "recurring_expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("description", sa.String(240), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("day_of_month", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamps(),
        sa.CheckConstraint("amount > 0 AND amount <= 99999999999.99", name="ck_recurring_amount"),
        sa.CheckConstraint("day_of_month BETWEEN 1 AND 31", name="ck_recurring_day"),
    )
    op.create_table(
        "categorization_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("needle", sa.String(160), nullable=False),
        sa.Column("normalized_needle", sa.String(160), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamps(),
    )
    op.create_index(
        "ix_categorization_rules_normalized_needle",
        "categorization_rules",
        ["normalized_needle"],
    )
    op.create_table(
        "import_batches",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("state", import_state, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("headers", sa.JSON(), nullable=False),
        sa.Column("sample_rows", sa.JSON(), nullable=False),
        sa.Column("mapping", sa.JSON(), nullable=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=True),
        *timestamps(),
    )
    op.create_table(
        "import_rows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "batch_id",
            sa.String(36),
            sa.ForeignKey("import_batches.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("raw", sa.JSON(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(240), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("kind", kind, nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("disposition", disposition, nullable=False),
        sa.Column("possible_duplicate", sa.Boolean(), nullable=False),
        sa.Column("origin_key", sa.String(80), nullable=False),
        sa.Column("semantic_fingerprint", sa.String(80), nullable=False),
        sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("transactions.id"), nullable=True),
        *timestamps(),
        sa.UniqueConstraint("batch_id", "row_number", name="uq_import_row_number"),
    )


def downgrade() -> None:
    op.drop_table("import_rows")
    op.drop_table("import_batches")
    op.drop_index("ix_categorization_rules_normalized_needle", table_name="categorization_rules")
    op.drop_table("categorization_rules")
    op.drop_table("recurring_expenses")
    op.drop_index("ix_transactions_semantic_fingerprint", table_name="transactions")
    op.drop_index("ix_transactions_date_kind", table_name="transactions")
    op.drop_index("ix_transactions_category_id", table_name="transactions")
    op.drop_index("ix_transactions_account_id", table_name="transactions")
    op.drop_index("ix_transactions_date", table_name="transactions")
    op.drop_table("transactions")
    op.drop_table("monthly_budgets")
    op.drop_table("categories")
    op.drop_table("accounts")
