from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import Base


class DomainError(HTTPException):
    def __init__(self, detail: str, status_code: int = 400) -> None:
        super().__init__(status_code=status_code, detail=detail)


def normalize_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold().strip())
    return re.sub(r"\s+", " ", "".join(c for c in decomposed if not unicodedata.combining(c)))


def semantic_fingerprint(
    *,
    account_id: int,
    posted_on: date,
    description: str,
    amount: Decimal,
    kind: models.TransactionKind,
) -> str:
    payload = {
        "v": 1,
        "account_id": account_id,
        "date": str(posted_on),
        "description": normalize_text(description),
        "amount": str(amount.quantize(Decimal("0.01"))),
        "kind": kind.value,
    }
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def get_or_404[T: Base](db: Session, model: type[T], object_id: int | str) -> T:
    value = db.get(model, object_id)
    if value is None:
        raise DomainError("Recurso no encontrado", 404)
    return value


def validate_category(
    db: Session,
    category_id: int | None,
    kind: models.TransactionKind,
    *,
    active: bool = True,
) -> models.Category | None:
    if category_id is None:
        return None
    category = db.get(models.Category, category_id)
    if category is None:
        raise DomainError("La categoría no existe")
    if category.kind != kind:
        raise DomainError("La categoría debe corresponder al tipo de movimiento")
    if active and not category.is_active:
        raise DomainError("La categoría está inactiva")
    return category


def validate_category_parent(
    db: Session,
    kind: models.TransactionKind,
    parent_id: int | None,
    category_id: int | None = None,
) -> None:
    if parent_id is None:
        return
    parent = validate_category(db, parent_id, kind)
    assert parent is not None
    seen: set[int] = set()
    cursor: models.Category | None = parent
    while cursor is not None:
        if cursor.id == category_id or cursor.id in seen:
            raise DomainError("La jerarquía de categorías no puede contener ciclos")
        seen.add(cursor.id)
        cursor = db.get(models.Category, cursor.parent_id) if cursor.parent_id else None


def match_rule(db: Session, description: str, kind: models.TransactionKind) -> int | None:
    normalized = normalize_text(description)
    rules = db.scalars(
        select(models.CategorizationRule)
        .where(models.CategorizationRule.is_active.is_(True))
        .order_by(models.CategorizationRule.priority, models.CategorizationRule.id)
    )
    for rule in rules:
        if rule.normalized_needle in normalized:
            category = db.get(models.Category, rule.category_id)
            if category and category.is_active and category.kind == kind:
                return category.id
    return None


def validate_transaction_values(
    db: Session,
    *,
    kind: models.TransactionKind,
    account_id: int,
    destination_account_id: int | None,
    category_id: int | None,
) -> int | None:
    account = db.get(models.Account, account_id)
    if account is None or not account.is_active:
        raise DomainError("La cuenta de origen no existe o está inactiva")
    if kind == models.TransactionKind.TRANSFER:
        if destination_account_id is None or category_id is not None:
            raise DomainError("Una transferencia requiere destino y no admite categoría")
        if destination_account_id == account_id:
            raise DomainError("Las cuentas de una transferencia deben ser distintas")
        destination = db.get(models.Account, destination_account_id)
        if destination is None or not destination.is_active:
            raise DomainError("La cuenta de destino no existe o está inactiva")
        if destination.currency != account.currency:
            raise DomainError("Las transferencias requieren cuentas de la misma moneda")
        return None
    if destination_account_id is not None:
        raise DomainError("Solo una transferencia admite cuenta destino")
    validate_category(db, category_id, kind)
    return category_id


def create_transaction(db: Session, data: schemas.TransactionCreate) -> models.Transaction:
    category_id = data.category_id
    if category_id is None and data.kind != models.TransactionKind.TRANSFER:
        category_id = match_rule(db, data.description, data.kind)
    validate_transaction_values(
        db,
        kind=data.kind,
        account_id=data.account_id,
        destination_account_id=data.destination_account_id,
        category_id=category_id,
    )
    transaction = models.Transaction(
        **data.model_dump(exclude={"category_id"}),
        category_id=category_id,
        semantic_fingerprint=semantic_fingerprint(
            account_id=data.account_id,
            posted_on=data.date,
            description=data.description,
            amount=data.amount,
            kind=data.kind,
        ),
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


def patch_transaction(
    db: Session, transaction: models.Transaction, patch: schemas.TransactionPatch
) -> models.Transaction:
    if transaction.voided_at is not None:
        raise DomainError("Un movimiento anulado es inmutable", 409)
    values = patch.model_dump(exclude_unset=True)
    kind = values.get("kind", transaction.kind)
    account_id = values.get("account_id", transaction.account_id)
    destination_account_id = values.get(
        "destination_account_id", transaction.destination_account_id
    )
    category_id = values.get("category_id", transaction.category_id)
    validate_transaction_values(
        db,
        kind=kind,
        account_id=account_id,
        destination_account_id=destination_account_id,
        category_id=category_id,
    )
    for key, value in values.items():
        setattr(transaction, key, value)
    transaction.semantic_fingerprint = semantic_fingerprint(
        account_id=transaction.account_id,
        posted_on=transaction.date,
        description=transaction.description,
        amount=transaction.amount,
        kind=transaction.kind,
    )
    db.commit()
    db.refresh(transaction)
    return transaction


def void_transaction(db: Session, transaction: models.Transaction) -> models.Transaction:
    if transaction.voided_at is None:
        transaction.voided_at = datetime.now(UTC)
        db.commit()
        db.refresh(transaction)
    return transaction


def account_balance(
    db: Session, account: models.Account, as_of: date | None = None
) -> Decimal:
    as_of = as_of or date.today()
    incoming = case(
        (
            (models.Transaction.kind == models.TransactionKind.INCOME)
            & (models.Transaction.account_id == account.id),
            models.Transaction.amount,
        ),
        (
            (models.Transaction.kind == models.TransactionKind.TRANSFER)
            & (models.Transaction.destination_account_id == account.id),
            models.Transaction.amount,
        ),
        else_=Decimal("0"),
    )
    outgoing = case(
        (
            (models.Transaction.kind == models.TransactionKind.EXPENSE)
            & (models.Transaction.account_id == account.id),
            models.Transaction.amount,
        ),
        (
            (models.Transaction.kind == models.TransactionKind.TRANSFER)
            & (models.Transaction.account_id == account.id),
            models.Transaction.amount,
        ),
        else_=Decimal("0"),
    )
    movement = db.scalar(
        select(func.coalesce(func.sum(incoming - outgoing), 0)).where(
            models.Transaction.voided_at.is_(None),
            models.Transaction.date <= as_of,
            or_(
                models.Transaction.account_id == account.id,
                models.Transaction.destination_account_id == account.id,
            ),
        )
    )
    adjustments = db.scalar(
        select(func.coalesce(func.sum(models.BalanceAdjustment.amount), 0)).where(
            models.BalanceAdjustment.account_id == account.id,
            models.BalanceAdjustment.date <= as_of,
        )
    )
    return account.opening_balance + Decimal(movement or 0) + Decimal(adjustments or 0)

def account_out(db: Session, account: models.Account) -> schemas.AccountOut:
    adjustments = db.scalars(
        select(models.BalanceAdjustment)
        .where(models.BalanceAdjustment.account_id == account.id)
        .order_by(models.BalanceAdjustment.date.desc(), models.BalanceAdjustment.id.desc())
    ).all()
    return schemas.AccountOut(
        id=account.id,
        name=account.name,
        currency=account.currency,
        opening_balance=account.opening_balance,
        current_balance=account_balance(db, account),
        is_active=account.is_active,
        adjustments=[schemas.BalanceAdjustmentOut.model_validate(item) for item in adjustments],
    )


 
