from __future__ import annotations

import csv
import io
import re
import unicodedata
from datetime import date
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app import models
from app.services.domain import owner_clause

EXPORT_HEADERS = [
    "myfinance_format_version",
    "date",
    "description",
    "kind",
    "amount",
    "currency",
    "account_name",
    "account_currency",
    "category",
    "destination_account",
    "destination_currency",
    "destination_amount",
    "purpose",
    "status",
    "notes",
]
FORMAT_VERSION = "1"


def category_path(db: Session, category: models.Category | None) -> str:
    parts: list[str] = []
    seen: set[int] = set()
    while category is not None and category.id not in seen:
        seen.add(category.id)
        parts.append(category.name)
        category = (
            db.scalar(
                select(models.Category).where(
                    models.Category.id == category.parent_id, owner_clause(db, models.Category)
                )
            )
            if category.parent_id
            else None
        )
    return " > ".join(reversed(parts))


def safe_filename(name: str, currency: models.Currency) -> str:
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower() or "cuenta"
    return f"myfinance-{slug}-{currency.value.lower()}-{date.today():%Y%m%d}.csv"


def account_csv(db: Session, account: models.Account) -> tuple[str, str]:
    transactions = db.scalars(
        select(models.Transaction)
        .where(
            models.Transaction.owner_id == account.owner_id,
            models.Transaction.voided_at.is_(None),
            or_(
                models.Transaction.account_id == account.id,
                models.Transaction.destination_account_id == account.id,
            ),
        )
        .order_by(models.Transaction.date, models.Transaction.id)
    ).all()
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=EXPORT_HEADERS, lineterminator="\n")
    writer.writeheader()
    for transaction in transactions:
        category = transaction.category
        writer.writerow(
            {
                "myfinance_format_version": FORMAT_VERSION,
                "date": transaction.date.isoformat(),
                "description": transaction.description,
                "kind": transaction.kind.value,
                "amount": format(Decimal(transaction.amount), "f"),
                "currency": account.currency.value,
                "account_name": account.name,
                "account_currency": account.currency.value,
                "category": category_path(db, category),
                "destination_account": transaction.destination_account.name
                if transaction.destination_account
                else "",
                "destination_currency": transaction.destination_account.currency.value
                if transaction.destination_account
                else "",
                "destination_amount": format(Decimal(transaction.destination_amount), "f")
                if transaction.destination_amount is not None
                else "",
                "purpose": transaction.purpose.value if transaction.purpose else "",
                "status": "active",
                "notes": transaction.notes or "",
            }
        )
    return output.getvalue(), safe_filename(account.name, account.currency)
