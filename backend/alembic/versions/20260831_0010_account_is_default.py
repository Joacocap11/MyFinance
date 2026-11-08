"""Add accounts.is_default with a per-owner default account.

Adds a nullable-free ``is_default`` boolean column plus a partial unique
index guaranteeing at most one default account per owner. As a one-time
backfill, marks the account literally named "Cuenta principal" as default
for owners that have exactly one such account. Owners with zero matches are
left with no default (the application falls back to alphabetical order).
Owners with more than one account named "Cuenta principal" abort the
migration instead of guessing which one is the real one.

Revision ID: 20260831_0010
Revises: 20260830_0009
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260831_0010"
down_revision: str | None = "20260830_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_ACCOUNT_NAME = "Cuenta principal"


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(
        "uq_accounts_one_default_per_owner",
        "accounts",
        ["owner_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
        sqlite_where=sa.text("is_default"),
    )

    connection = op.get_bind()
    ambiguous = connection.execute(
        sa.text(
            "SELECT owner_id, count(*) AS n FROM accounts WHERE name = :name "
            "GROUP BY owner_id HAVING count(*) > 1"
        ),
        {"name": DEFAULT_ACCOUNT_NAME},
    ).fetchall()
    if ambiguous:
        owners = ", ".join(str(row.owner_id) for row in ambiguous)
        raise RuntimeError(
            f"No se puede elegir la cuenta predeterminada automáticamente: "
            f"el/los usuario(s) {owners} tienen más de una cuenta llamada "
            f'"{DEFAULT_ACCOUNT_NAME}". Marcá la cuenta default manualmente '
            "(PATCH /settings/accounts/{id} con is_default=true) y reintentá."
        )
    connection.execute(
        sa.text("UPDATE accounts SET is_default = TRUE WHERE name = :name"),
        {"name": DEFAULT_ACCOUNT_NAME},
    )

    op.alter_column("accounts", "is_default", server_default=None)


def downgrade() -> None:
    op.drop_index("uq_accounts_one_default_per_owner", table_name="accounts")
    op.drop_column("accounts", "is_default")
