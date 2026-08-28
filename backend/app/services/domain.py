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


def current_owner_id(db: Session) -> int:
    owner_id = db.info.get("owner_id")
    if not isinstance(owner_id, int):
        raise DomainError("Autenticación requerida", 401)
    return owner_id


def owner_clause(db: Session, model: type[object]):
    return model.owner_id == current_owner_id(db)  # type: ignore[attr-defined]


def get_or_404[T: Base](db: Session, model: type[T], object_id: int | str) -> T:
    if hasattr(model, "owner_id"):
        value = db.scalar(select(model).where(model.id == object_id, owner_clause(db, model)))
    else:
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
    category = db.scalar(
        select(models.Category).where(
            models.Category.id == category_id,
            owner_clause(db, models.Category),
        )
    )
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
        cursor = (
            db.scalar(
                select(models.Category).where(
                    models.Category.id == cursor.parent_id,
                    owner_clause(db, models.Category),
                )
            )
            if cursor.parent_id
            else None
        )


def match_rule(db: Session, description: str, kind: models.TransactionKind) -> int | None:
    normalized = normalize_text(description)
    rules = db.scalars(
        select(models.CategorizationRule)
        .where(
            models.CategorizationRule.is_active.is_(True),
            owner_clause(db, models.CategorizationRule),
        )
        .order_by(models.CategorizationRule.priority, models.CategorizationRule.id)
    )
    for rule in rules:
        if rule.normalized_needle in normalized:
            category = db.scalar(
                select(models.Category).where(
                    models.Category.id == rule.category_id,
                    owner_clause(db, models.Category),
                )
            )
            if category and category.is_active and category.kind == kind:
                return category.id
    return None


def validate_transaction_values(
    db: Session,
    *,
    kind: models.TransactionKind,
    account_id: int,
    amount: Decimal,
    destination_account_id: int | None,
    destination_amount: Decimal | None,
    category_id: int | None,
) -> int | None:
    account = db.scalar(
        select(models.Account).where(
            models.Account.id == account_id,
            owner_clause(db, models.Account),
        )
    )
    if account is None or not account.is_active:
        raise DomainError("La cuenta de origen no existe o está inactiva")
    if kind == models.TransactionKind.TRANSFER:
        if destination_account_id is None or category_id is not None:
            raise DomainError("Una transferencia requiere destino y no admite categoría")
        if destination_account_id == account_id:
            raise DomainError("Las cuentas de una transferencia deben ser distintas")
        destination = db.scalar(
            select(models.Account).where(
                models.Account.id == destination_account_id,
                owner_clause(db, models.Account),
            )
        )
        if destination is None or not destination.is_active:
            raise DomainError("La cuenta de destino no existe o está inactiva")
        if destination_amount is None:
            if destination.currency != account.currency:
                raise DomainError("Las monedas distintas requieren monto recibido")
        elif destination.currency == account.currency and destination_amount != amount:
            raise DomainError("En la misma moneda el monto recibido debe coincidir con el origen")
        return None
    if destination_account_id is not None or destination_amount is not None:
        raise DomainError("Solo una transferencia admite cuenta destino y monto recibido")
    validate_category(db, category_id, kind)
    return category_id


def create_transaction(db: Session, data: schemas.TransactionCreate) -> models.Transaction:
    category_id = data.category_id
    if category_id is None and data.kind != models.TransactionKind.TRANSFER:
        category_id = match_rule(db, data.description, data.kind)
    destination_amount = data.destination_amount
    if data.kind == models.TransactionKind.TRANSFER and destination_amount is None:
        source = db.scalar(
            select(models.Account).where(
                models.Account.id == data.account_id,
                owner_clause(db, models.Account),
            )
        )
        destination = (
            db.scalar(
                select(models.Account).where(
                    models.Account.id == data.destination_account_id,
                    owner_clause(db, models.Account),
                )
            )
            if data.destination_account_id is not None
            else None
        )
        if source and destination and source.currency == destination.currency:
            destination_amount = data.amount
    validate_transaction_values(
        db,
        kind=data.kind,
        account_id=data.account_id,
        amount=data.amount,
        destination_account_id=data.destination_account_id,
        destination_amount=destination_amount,
        category_id=category_id,
    )
    transaction = models.Transaction(
        owner_id=current_owner_id(db),
        **data.model_dump(exclude={"category_id", "destination_amount"}),
        destination_amount=destination_amount,
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
    amount = values.get("amount", transaction.amount)
    destination_account_id = values.get(
        "destination_account_id", transaction.destination_account_id
    )
    destination_amount = values.get("destination_amount", transaction.destination_amount)
    category_id = values.get("category_id", transaction.category_id)
    validate_transaction_values(
        db,
        kind=kind,
        account_id=account_id,
        amount=amount,
        destination_account_id=destination_account_id,
        destination_amount=destination_amount,
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


def account_balance(db: Session, account: models.Account, as_of: date | None = None) -> Decimal:
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
            func.coalesce(models.Transaction.destination_amount, models.Transaction.amount),
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
            models.Transaction.owner_id == account.owner_id,
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
            models.BalanceAdjustment.owner_id == account.owner_id,
            models.BalanceAdjustment.account_id == account.id,
            models.BalanceAdjustment.date <= as_of,
        )
    )
    return account.opening_balance + Decimal(movement or 0) + Decimal(adjustments or 0)


def account_out(db: Session, account: models.Account) -> schemas.AccountOut:
    adjustments = db.scalars(
        select(models.BalanceAdjustment)
        .where(
            models.BalanceAdjustment.owner_id == account.owner_id,
            models.BalanceAdjustment.account_id == account.id,
        )
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
