#!/usr/bin/env python3
"""Transfer every owner-scoped record between users, with explicit confirmation."""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import models  # noqa: E402
from app.db import SessionLocal  # noqa: E402

OWNED_TABLES = (
    ("accounts", models.Account),
    ("balance_adjustments", models.BalanceAdjustment),
    ("categories", models.Category),
    ("transactions", models.Transaction),
    ("recurring_expenses", models.RecurringExpense),
    ("categorization_rules", models.CategorizationRule),
    ("monthly_budgets", models.MonthlyBudget),
    ("import_batches", models.ImportBatch),
)


@dataclass(frozen=True)
class UserRef:
    id: int
    email: str


def resolve_user(db: Session, reference: str) -> UserRef:
    try:
        statement = select(models.User).where(models.User.id == int(reference))
    except ValueError:
        statement = select(models.User).where(models.User.email == reference.strip().lower())
    user = db.scalar(statement)
    if user is None:
        raise ValueError(f"Usuario no encontrado: {reference}")
    return UserRef(user.id, user.email)


def owner_counts(db: Session, owner_id: int) -> dict[str, int]:
    return {
        table: int(
            db.scalar(select(func.count()).select_from(model).where(model.owner_id == owner_id))
            or 0
        )
        for table, model in OWNED_TABLES
    }


def conflicts(db: Session, source_id: int, target_id: int) -> list[str]:
    source_accounts = set(
        db.scalars(select(models.Account.name).where(models.Account.owner_id == source_id))
    )
    target_accounts = set(
        db.scalars(select(models.Account.name).where(models.Account.owner_id == target_id))
    )
    account_conflicts = sorted(source_accounts & target_accounts)

    source_categories = {
        (category.kind, category.name, category.parent_id)
        for category in db.scalars(
            select(models.Category).where(models.Category.owner_id == source_id)
        )
    }
    target_categories = {
        (category.kind, category.name, category.parent_id)
        for category in db.scalars(
            select(models.Category).where(models.Category.owner_id == target_id)
        )
    }
    category_conflicts = sorted(source_categories & target_categories, key=str)

    source_currencies = set(
        db.scalars(
            select(models.MonthlyBudget.currency).where(models.MonthlyBudget.owner_id == source_id)
        )
    )
    target_currencies = set(
        db.scalars(
            select(models.MonthlyBudget.currency).where(models.MonthlyBudget.owner_id == target_id)
        )
    )
    budget_conflicts = sorted(source_currencies & target_currencies, key=str)

    result = [f"accounts.name={name!r}" for name in account_conflicts]
    result.extend(f"categories.kind/name/parent={item!r}" for item in category_conflicts)
    result.extend(f"monthly_budgets.currency={currency!r}" for currency in budget_conflicts)
    return result


def financial_snapshot(db: Session, owner_ids: set[int]) -> tuple[int, Decimal, int, Decimal]:
    transaction_count, transaction_amount = db.execute(
        select(
            func.count(models.Transaction.id), func.coalesce(func.sum(models.Transaction.amount), 0)
        ).where(models.Transaction.owner_id.in_(owner_ids))
    ).one()
    adjustment_count, adjustment_amount = db.execute(
        select(
            func.count(models.BalanceAdjustment.id),
            func.coalesce(func.sum(models.BalanceAdjustment.amount), 0),
        ).where(models.BalanceAdjustment.owner_id.in_(owner_ids))
    ).one()
    return (
        int(transaction_count),
        Decimal(transaction_amount),
        int(adjustment_count),
        Decimal(adjustment_amount),
    )


def validate_owner_integrity(db: Session) -> None:
    checks = (
        (models.BalanceAdjustment, models.Account, "account_id"),
        (models.Transaction, models.Account, "account_id"),
        (models.Transaction, models.Category, "category_id"),
        (models.RecurringExpense, models.Account, "account_id"),
        (models.RecurringExpense, models.Category, "category_id"),
        (models.CategorizationRule, models.Category, "category_id"),
        (models.ImportBatch, models.Account, "account_id"),
    )
    for child, parent, foreign_key in checks:
        child_column = getattr(child, foreign_key)
        parent_id = parent.id
        invalid = db.scalar(
            select(func.count())
            .select_from(child)
            .join(parent, child_column == parent_id)
            .where(child.owner_id != parent.owner_id)
        )
        if invalid:
            raise RuntimeError(
                f"Integridad owner inválida: {child.__tablename__} -> {parent.__tablename__}"
            )

    destination_invalid = db.scalar(
        select(func.count())
        .select_from(models.Transaction)
        .join(models.Account, models.Transaction.destination_account_id == models.Account.id)
        .where(
            models.Transaction.destination_account_id.is_not(None),
            models.Transaction.owner_id != models.Account.owner_id,
        )
    )
    if destination_invalid:
        raise RuntimeError("Integridad owner inválida: transactions -> destination accounts")

    invalid_rows = db.scalar(
        select(func.count())
        .select_from(models.ImportRow)
        .join(models.ImportBatch)
        .where(
            models.ImportRow.category_id.is_not(None),
            models.ImportRow.category_id.not_in(select(models.Category.id)),
        )
    )
    if invalid_rows:
        raise RuntimeError("Integridad de import_rows inválida")


def transfer_ownership(
    db: Session, source_id: int, target_id: int, *, fail_after: str | None = None
) -> None:
    for table, model in OWNED_TABLES:
        db.execute(update(model).where(model.owner_id == source_id).values(owner_id=target_id))
        db.flush()
        if fail_after == table:
            raise RuntimeError(f"Fallo solicitado después de {table}")
    validate_owner_integrity(db)


def print_plan(
    source: UserRef, target: UserRef, counts: dict[str, int], found_conflicts: list[str]
) -> None:
    print(f"Origen: {source.id} ({source.email})")
    print(f"Destino: {target.id} ({target.email})")
    for table, count in counts.items():
        print(f"{table}: {count}")
    if found_conflicts:
        print("Conflictos detectados; no se realizará ninguna transferencia:")
        for conflict in found_conflicts:
            print(f"- {conflict}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--from", dest="source", required=True, help="email o ID del usuario origen"
    )
    parser.add_argument("--to", dest="target", required=True, help="email o ID del usuario destino")
    parser.add_argument("--dry-run", action="store_true", help="mostrar el plan sin escribir")
    parser.add_argument(
        "--confirm", action="store_true", help="autorizar la escritura transaccional"
    )
    args = parser.parse_args()

    with SessionLocal.begin() as db:
        source = resolve_user(db, args.source)
        target = resolve_user(db, args.target)
        if source.id == target.id:
            raise ValueError("El usuario origen y destino deben ser distintos")
        counts = owner_counts(db, source.id)
        found_conflicts = conflicts(db, source.id, target.id)
        print_plan(source, target, counts, found_conflicts)
        if found_conflicts:
            return 1
        if args.dry_run:
            print("Dry-run: no se modificó la base de datos.")
            return 0
        if not args.confirm:
            print("No se modificó la base de datos. Repetí con --confirm para ejecutar.")
            return 2
        before = financial_snapshot(db, {source.id, target.id})
        transfer_ownership(db, source.id, target.id)
        after = financial_snapshot(db, {source.id, target.id})
        if before != after:
            raise RuntimeError(f"El snapshot financiero cambió: antes={before}, después={after}")
        print("Transferencia completada en una transacción; el usuario origen fue conservado.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, RuntimeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1) from error
