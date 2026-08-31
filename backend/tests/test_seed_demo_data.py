from __future__ import annotations

import importlib.util
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import select

from app import models

SPEC = importlib.util.spec_from_file_location(
    "seed_demo_data", Path(__file__).parents[2] / "scripts" / "seed_demo_data.py"
)
assert SPEC and SPEC.loader
seed_demo = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(seed_demo)


def test_populate_uses_owner_accounts_dates_and_decimal(db):
    user = models.User(email="demo@example.com", password_hash="x")
    other = models.User(email="other@example.com", password_hash="x")
    db.add_all([user, other])
    db.commit()
    db.refresh(user)

    summary = seed_demo.populate(db, user, 6, 42, today=date(2026, 8, 29))
    assert summary["accounts"] == 4
    assert summary["transactions"] >= 90
    assert db.scalar(
        select(models.Account).where(
            models.Account.owner_id == user.id, models.Account.name == "[DEMO] Itaú UYU"
        )
    )
    transactions = db.scalars(
        select(models.Transaction).where(models.Transaction.owner_id == user.id)
    ).all()
    assert all(item.owner_id == user.id for item in transactions)
    assert all(item.date <= date(2026, 8, 29) for item in transactions)
    assert all(isinstance(item.amount, Decimal) for item in transactions)
    assert len({item.date.strftime("%Y-%m") for item in transactions}) == 6
    assert (
        db.scalar(select(models.Transaction).where(models.Transaction.owner_id == other.id)) is None
    )


def test_same_seed_produces_same_business_values(db):
    first = models.User(email="first@example.com", password_hash="x")
    second = models.User(email="second@example.com", password_hash="x")
    db.add_all([first, second])
    db.commit()
    db.refresh(first)
    db.refresh(second)
    seed_demo.populate(db, first, 6, 123, today=date(2026, 8, 29))
    seed_demo.populate(db, second, 6, 123, today=date(2026, 8, 29))
    left = db.scalars(
        select(models.Transaction)
        .where(models.Transaction.owner_id == first.id)
        .order_by(models.Transaction.id)
    ).all()
    right = db.scalars(
        select(models.Transaction)
        .where(models.Transaction.owner_id == second.id)
        .order_by(models.Transaction.id)
    ).all()
    assert [(x.date, x.kind, x.amount, x.description) for x in left] == [
        (x.date, x.kind, x.amount, x.description) for x in right
    ]


def test_run_requires_existing_user(monkeypatch, db):
    @contextmanager
    def sessions():
        yield db

    monkeypatch.setattr(seed_demo, "SessionLocal", sessions)
    with pytest.raises(RuntimeError, match="User not found"):
        seed_demo.run("missing@example.com", confirm=True)


def test_duplicate_demo_is_rejected(monkeypatch, db):
    user = models.User(email="duplicate@example.com", password_hash="x")
    db.add(user)
    db.commit()
    db.refresh(user)
    seed_demo.populate(db, user, 6, 42, today=date(2026, 8, 29))

    @contextmanager
    def sessions():
        yield db

    monkeypatch.setattr(seed_demo, "SessionLocal", sessions)
    with pytest.raises(RuntimeError, match="Demo data already exists"):
        seed_demo.run(user.email, confirm=True)


def test_reset_keeps_non_demo_transaction(monkeypatch, db):
    user = models.User(email="reset@example.com", password_hash="x")
    db.add(user)
    db.commit()
    db.refresh(user)
    seed_demo.populate(db, user, 6, 42, today=date(2026, 8, 29))
    normal = models.Account(
        owner_id=user.id,
        name="Cuenta real",
        currency=models.Currency.UYU,
        opening_balance=Decimal("10.00"),
    )
    db.add(normal)
    db.commit()
    db.add(
        models.Transaction(
            owner_id=user.id,
            date=date(2026, 8, 1),
            kind=models.TransactionKind.EXPENSE,
            amount=Decimal("1.00"),
            description="Compra real",
            account_id=normal.id,
        )
    )
    db.commit()

    @contextmanager
    def sessions():
        yield db

    monkeypatch.setattr(seed_demo, "SessionLocal", sessions)
    seed_demo.run(user.email, months=6, seed=42, confirm=True, reset=True)
    assert (
        db.scalar(select(models.Transaction).where(models.Transaction.description == "Compra real"))
        is not None
    )
    assert (
        db.scalar(
            select(models.Transaction).where(
                models.Transaction.owner_id == user.id,
                models.Transaction.origin_key.like(f"{seed_demo.DEMO_ORIGIN}%"),
            )
        )
        is not None
    )
