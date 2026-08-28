"""Add per-user ownership and administrator flag.

Revision ID: 20260829_0008
Revises: 20260828_0007
"""
from alembic import op
import sqlalchemy as sa

revision = "20260829_0008"
down_revision = "20260828_0007"
branch_labels = None
depends_on = None

PERSONAL_TABLES = (
    "accounts",
    "balance_adjustments",
    "categories",
    "transactions",
    "recurring_expenses",
    "categorization_rules",
    "monthly_budgets",
    "import_batches",
)


def upgrade() -> None:
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
    for table in PERSONAL_TABLES:
        op.add_column(table, sa.Column("owner_id", sa.Integer(), nullable=True))

    connection = op.get_bind()
    user_count = connection.scalar(sa.text("SELECT count(*) FROM users"))
    personal_count = sum(
        connection.scalar(sa.text(f"SELECT count(*) FROM {table}")) or 0
        for table in PERSONAL_TABLES
    )
    if personal_count and user_count != 1:
        raise RuntimeError(
            "No se puede asignar ownership automáticamente: "
            f"hay {user_count} usuarios y {personal_count} filas financieras. "
            "Se requiere una migración explícita por usuario."
        )
    if user_count == 1:
        owner_id = connection.scalar(sa.text("SELECT id FROM users ORDER BY id LIMIT 1"))
        connection.execute(
            sa.text("UPDATE users SET is_admin = TRUE WHERE id = :owner_id"),
            {"owner_id": owner_id},
        )
        for table in PERSONAL_TABLES:
            connection.execute(
                sa.text(f"UPDATE {table} SET owner_id = :owner_id"),
                {"owner_id": owner_id},
            )
        for table in PERSONAL_TABLES:
            op.alter_column(table, "owner_id", nullable=False)

    for table in PERSONAL_TABLES:
        op.create_foreign_key(
            f"fk_{table}_owner_id_users", table, "users", ["owner_id"], ["id"]
        )
        op.create_index(f"ix_{table}_owner_id", table, ["owner_id"])

    op.drop_constraint("uq_category_scope", "categories", type_="unique")
    op.create_unique_constraint(
        "uq_category_scope", "categories", ["owner_id", "kind", "name", "parent_id"]
    )
    op.drop_constraint("accounts_name_key", "accounts", type_="unique")
    op.create_unique_constraint("uq_account_owner_name", "accounts", ["owner_id", "name"])
    op.drop_constraint("monthly_budgets_pkey", "monthly_budgets", type_="primary")
    op.create_primary_key("monthly_budgets_pkey", "monthly_budgets", ["owner_id", "currency"])
    op.alter_column("users", "is_admin", server_default=None)


def downgrade() -> None:
    op.drop_constraint("monthly_budgets_pkey", "monthly_budgets", type_="primary")
    op.create_primary_key("monthly_budgets_pkey", "monthly_budgets", ["currency"])
    op.drop_constraint("uq_account_owner_name", "accounts", type_="unique")
    op.create_unique_constraint("accounts_name_key", "accounts", ["name"])
    op.drop_constraint("uq_category_scope", "categories", type_="unique")
    op.create_unique_constraint("uq_category_scope", "categories", ["kind", "name", "parent_id"])
    for table in reversed(PERSONAL_TABLES):
        op.drop_index(f"ix_{table}_owner_id", table_name=table)
        op.drop_constraint(f"fk_{table}_owner_id_users", table, type_="foreignkey")
        op.drop_column(table, "owner_id")
    op.drop_column("users", "is_admin")
