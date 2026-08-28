# ruff: noqa: I001 -- the repository-root scripts package is imported by test seam.
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from scripts.transfer_user_ownership import conflicts, transfer_ownership


def users(db: Session) -> tuple[models.User, models.User]:
    source = models.User(email="source@example.com", password_hash="scrypt$source")
    target = models.User(email="target@example.com", password_hash="scrypt$target")
    db.add_all([source, target])
    db.flush()
    return source, target


def source_records(db: Session, owner_id: int) -> tuple[models.Account, models.Category]:
    account = models.Account(
        owner_id=owner_id,
        name="Cuenta origen",
        currency=models.Currency.UYU,
        opening_balance=Decimal("100.00"),
    )
    category = models.Category(
        owner_id=owner_id,
        name="Comida",
        kind=models.TransactionKind.EXPENSE,
    )
    db.add_all([account, category])
    db.flush()
    db.add(
        models.Transaction(
            owner_id=owner_id,
            date=date(2026, 1, 1),
            kind=models.TransactionKind.EXPENSE,
            amount=Decimal("25.00"),
            description="Compra",
            account_id=account.id,
            category_id=category.id,
        )
    )
    db.flush()
    return account, category


def test_transfer_moves_all_source_records_and_preserves_snapshot(db: Session) -> None:
    source, target = users(db)
    account, category = source_records(db, source.id)
    before = (db.query(models.Transaction).count(), db.query(models.Transaction).one().amount)

    transfer_ownership(db, source.id, target.id)
    db.commit()

    assert (
        db.scalar(select(models.Account.owner_id).where(models.Account.id == account.id))
        == target.id
    )
    assert (
        db.scalar(select(models.Category.owner_id).where(models.Category.id == category.id))
        == target.id
    )
    assert db.scalar(select(models.Transaction.owner_id)) == target.id
    assert (
        db.query(models.Transaction).count(),
        db.query(models.Transaction).one().amount,
    ) == before


def test_conflicting_account_aborts_before_transfer(db: Session) -> None:
    source, target = users(db)
    source_records(db, source.id)
    db.add(models.Account(owner_id=target.id, name="Cuenta origen", currency=models.Currency.USD))
    db.commit()

    assert conflicts(db, source.id, target.id) == ["accounts.name='Cuenta origen'"]
    assert (
        db.scalar(
            select(models.Account.owner_id).where(
                models.Account.name == "Cuenta origen", models.Account.owner_id == source.id
            )
        )
        == source.id
    )


def test_failure_rolls_back_intermediate_table_updates(db: Session) -> None:
    source, target = users(db)
    account, _ = source_records(db, source.id)
    db.commit()

    with pytest.raises(RuntimeError, match="categorías|categories"):
        transfer_ownership(db, source.id, target.id, fail_after="categories")
    db.rollback()

    assert (
        db.scalar(select(models.Account.owner_id).where(models.Account.id == account.id))
        == source.id
    )
    assert db.scalar(select(models.Transaction.owner_id)) == source.id
