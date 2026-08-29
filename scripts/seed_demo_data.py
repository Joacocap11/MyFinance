"""Generate deterministic, development-only financial data for visual testing.

This module intentionally uses the application's ORM and transaction service. It is
not imported by the application startup path.
"""

from __future__ import annotations

import argparse
import random
import sys
from calendar import monthrange
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if (BACKEND / "app").is_dir():
    sys.path.insert(0, str(BACKEND))
else:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import delete, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app import models, schemas  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.seed import seed as seed_defaults  # noqa: E402
from app.services.domain import create_transaction, void_transaction  # noqa: E402

DEMO_ORIGIN = "demo:mobile-v2:v1:"
DEMO_MARKER = "[DEMO]"
ACCOUNT_NAMES = ("Itaú UYU", "Itaú USD", "Ahorro BHU UI", "Efectivo UYU")


def money(value: Decimal | int | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def months_back(today: date, count: int) -> list[tuple[int, int]]:
    index = today.year * 12 + today.month - 1
    result: list[tuple[int, int]] = []
    for offset in range(count):
        year, zero_month = divmod(index - offset, 12)
        result.append((year, zero_month + 1))
    return result


def valid_day(year: int, month: int, wanted: int, today: date) -> date:
    day = min(wanted, monthrange(year, month)[1])
    if year == today.year and month == today.month:
        day = min(day, today.day)
    return date(year, month, max(1, day))


def get_category(
    categories: dict[tuple[str, models.TransactionKind], models.Category],
    name: str,
    kind: models.TransactionKind,
) -> models.Category:
    return categories[(name, kind)]


def create_or_get_accounts(db: Session, owner_id: int) -> dict[str, models.Account]:
    currencies = (models.Currency.UYU, models.Currency.USD, models.Currency.UI, models.Currency.UYU)
    openings = (Decimal("185000.00"), Decimal("1200.00"), Decimal("95000.00"), Decimal("8500.00"))
    result: dict[str, models.Account] = {}
    for name, currency, opening in zip(ACCOUNT_NAMES, currencies, openings, strict=True):
        item = db.scalar(
            select(models.Account).where(
                models.Account.owner_id == owner_id, models.Account.name == f"{DEMO_MARKER} {name}"
            )
        )
        if item is None:
            item = models.Account(
                owner_id=owner_id,
                name=f"{DEMO_MARKER} {name}",
                currency=currency,
                opening_balance=opening,
            )
            db.add(item)
            db.flush()
        result[name] = item
    db.commit()
    return result


def ensure_categories(
    db: Session, owner_id: int
) -> dict[tuple[str, models.TransactionKind], models.Category]:
    db.info["owner_id"] = owner_id
    seed_defaults(db, owner_id=owner_id, create_account=False)
    rows = db.scalars(select(models.Category).where(models.Category.owner_id == owner_id)).all()
    categories = {(row.name, row.kind): row for row in rows}
    needed = {
        ("Comida", models.TransactionKind.EXPENSE),
        ("Auto", models.TransactionKind.EXPENSE),
        ("Compras", models.TransactionKind.EXPENSE),
        ("Suscripciones", models.TransactionKind.EXPENSE),
        ("Transporte", models.TransactionKind.EXPENSE),
        ("Salud", models.TransactionKind.EXPENSE),
        ("Educación", models.TransactionKind.EXPENSE),
        ("Tecnología", models.TransactionKind.EXPENSE),
        ("Otros", models.TransactionKind.EXPENSE),
        ("Sueldo", models.TransactionKind.INCOME),
        ("Otros ingresos", models.TransactionKind.INCOME),
        ("Combustible", models.TransactionKind.EXPENSE),
        ("Estacionamiento", models.TransactionKind.EXPENSE),
        ("Seguro", models.TransactionKind.EXPENSE),
    }
    missing = sorted(needed - categories.keys(), key=str)
    if missing:
        raise RuntimeError(
            f"Faltan categorías default requeridas: {', '.join(name for name, _ in missing)}"
        )
    return categories


def add_transaction(
    db: Session,
    *,
    owner_id: int,
    key: str,
    posted: date,
    kind: models.TransactionKind,
    amount: Decimal,
    description: str,
    account_id: int,
    category_id: int | None = None,
    destination_account_id: int | None = None,
    destination_amount: Decimal | None = None,
    purpose: models.TransferPurpose | None = None,
) -> models.Transaction:
    item = create_transaction(
        db,
        schemas.TransactionCreate(
            date=posted,
            kind=kind,
            amount=money(amount),
            description=description,
            account_id=account_id,
            category_id=category_id,
            destination_account_id=destination_account_id,
            destination_amount=destination_amount,
            purpose=purpose,
        ),
    )
    item.origin_key = f"{DEMO_ORIGIN}{owner_id}:{key}"
    item.notes = "Datos ficticios para validación Mobile V2"
    db.commit()
    return item


def populate(
    db: Session, user: models.User, months: int, seed: int, *, today: date | None = None
) -> dict[str, int]:
    today = today or date.today()
    rng = random.Random(seed)
    accounts = create_or_get_accounts(db, user.id)
    categories = ensure_categories(db, user.id)
    created: list[models.Transaction] = []
    month_list = months_back(today, months)
    for year, month in reversed(month_list):
        salary_day = valid_day(year, month, 28, today)
        created.append(
            add_transaction(
                db,
                owner_id=user.id,
                key=f"income:{year}-{month:02d}:salary",
                posted=salary_day,
                kind=models.TransactionKind.INCOME,
                amount=money(98000 + rng.randrange(-4500, 6500)),
                description="Sueldo mensual",
                account_id=accounts["Itaú UYU"].id,
                category_id=get_category(categories, "Sueldo", models.TransactionKind.INCOME).id,
            )
        )
        if month % 4 == 0:
            created.append(
                add_transaction(
                    db,
                    owner_id=user.id,
                    key=f"income:{year}-{month:02d}:refund",
                    posted=valid_day(year, month, 8, today),
                    kind=models.TransactionKind.INCOME,
                    amount=money(rng.randrange(1800, 5200)),
                    description="Devolución tarjeta",
                    account_id=accounts["Itaú UYU"].id,
                    category_id=get_category(
                        categories, "Otros ingresos", models.TransactionKind.INCOME
                    ).id,
                )
            )
        expense_specs = [
            ("Comida", (900, 3200), 4),
            ("Compras", (1400, 9800), 2),
            ("Transporte", (500, 1800), 2),
            ("Suscripciones", (650, 2100), 2),
            ("Salud", (900, 4200), 1),
            ("Educación", (1200, 4500), 1),
            ("Otros", (450, 2300), 2),
        ]
        if month % 3 == 0:
            expense_specs.append(("Tecnología", (3500, 18000), 1))
        if month % 5 == 0:
            expense_specs.append(("Compras", (12000, 30000), 1))
        for category_name, (low, high), quantity in expense_specs:
            category = get_category(categories, category_name, models.TransactionKind.EXPENSE)
            for item_no in range(quantity):
                descriptions = {
                    "Comida": ("Supermercado", "Restaurante", "Delivery"),
                    "Compras": ("Tienda del centro", "Compra online"),
                    "Transporte": ("Ómnibus", "Taxi"),
                    "Suscripciones": ("Netflix", "Streaming"),
                    "Salud": ("Farmacia",),
                    "Educación": ("Curso online",),
                    "Otros": ("Gasto varios",),
                    "Tecnología": ("Accesorios electrónicos",),
                }
                amount = money(rng.randrange(low, high + 1))
                posted = valid_day(year, month, 2 + rng.randrange(25), today)
                created.append(
                    add_transaction(
                        db,
                        owner_id=user.id,
                        key=f"expense:{year}-{month:02d}:{category_name}:{item_no}:{len(created)}",
                        posted=posted,
                        kind=models.TransactionKind.EXPENSE,
                        amount=amount,
                        description=rng.choice(descriptions[category_name]),
                        account_id=accounts["Itaú UYU"].id,
                        category_id=category.id,
                    )
                )
        if month % 3 == 0:
            created.append(
                add_transaction(
                    db,
                    owner_id=user.id,
                    key=f"transfer:{year}-{month:02d}:usd",
                    posted=valid_day(year, month, 12, today),
                    kind=models.TransactionKind.TRANSFER,
                    amount=money(rng.randrange(8500, 17000)),
                    description="Ahorro en dólares",
                    account_id=accounts["Itaú UYU"].id,
                    destination_account_id=accounts["Itaú USD"].id,
                    destination_amount=money(rng.randrange(210, 430)),
                    purpose=models.TransferPurpose.SAVINGS,
                )
            )
        if month % 4 == 0:
            created.append(
                add_transaction(
                    db,
                    owner_id=user.id,
                    key=f"transfer:{year}-{month:02d}:ui",
                    posted=valid_day(year, month, 20, today),
                    kind=models.TransactionKind.TRANSFER,
                    amount=money(rng.randrange(6500, 14000)),
                    description="Ahorro vivienda BHU",
                    account_id=accounts["Itaú UYU"].id,
                    destination_account_id=accounts["Ahorro BHU UI"].id,
                    destination_amount=money(rng.randrange(150, 330)),
                    purpose=models.TransferPurpose.SAVINGS,
                )
            )
    for item in created[:2]:
        void_transaction(db, item)
    recurring_category = get_category(
        categories, "Suscripciones", models.TransactionKind.EXPENSE
    ).id
    recurring_rows = [
        ("Netflix / streaming", "1250.00", 5),
        ("Gimnasio", "2300.00", 10),
        ("Seguro del auto", "4100.00", 15),
        ("Servicio mensual", "1800.00", 22),
    ]
    for description, amount, day in recurring_rows:
        db.add(
            models.RecurringExpense(
                owner_id=user.id,
                description=f"{DEMO_MARKER} {description}",
                amount=money(amount),
                day_of_month=day,
                account_id=accounts["Itaú UYU"].id,
                category_id=recurring_category,
            )
        )
    db.add(
        models.BalanceAdjustment(
            owner_id=user.id,
            account_id=accounts["Efectivo UYU"].id,
            date=valid_day(today.year, today.month, today.day, today),
            amount=money("125.00"),
            note=f"{DEMO_MARKER} diferencia de caja demo",
        )
    )
    budget = db.scalar(
        select(models.MonthlyBudget).where(
            models.MonthlyBudget.owner_id == user.id,
            models.MonthlyBudget.currency == models.Currency.UYU,
        )
    )
    if budget is None:
        db.add(
            models.MonthlyBudget(
                owner_id=user.id, currency=models.Currency.UYU, amount=money("62000.00")
            )
        )
    db.commit()
    return {
        "accounts": len(accounts),
        "transactions": len(created),
        "transfers": sum(item.kind == models.TransactionKind.TRANSFER for item in created),
        "categories": len({item.category_id for item in created if item.category_id}),
        "recurring": len(recurring_rows),
        "budgets": 1,
        "voided": 2,
    }


def reset_demo(db: Session, owner_id: int) -> None:
    """Delete only tagged rows; budgets are deliberately never deleted or changed."""
    demo_accounts = db.scalars(
        select(models.Account).where(
            models.Account.owner_id == owner_id, models.Account.name.like(f"{DEMO_MARKER} %")
        )
    ).all()
    demo_ids = {item.id for item in demo_accounts}
    db.execute(
        delete(models.Transaction).where(
            models.Transaction.owner_id == owner_id,
            models.Transaction.origin_key.like(f"{DEMO_ORIGIN}%"),
        )
    )
    db.execute(
        delete(models.RecurringExpense).where(
            models.RecurringExpense.owner_id == owner_id,
            models.RecurringExpense.description.like(f"{DEMO_MARKER} %"),
        )
    )
    db.execute(
        delete(models.BalanceAdjustment).where(
            models.BalanceAdjustment.owner_id == owner_id,
            models.BalanceAdjustment.note.like(f"{DEMO_MARKER} %"),
        )
    )
    if demo_ids:
        referenced = db.scalar(
            select(models.Transaction.id)
            .where(
                models.Transaction.owner_id == owner_id,
                (models.Transaction.account_id.in_(demo_ids))
                | (models.Transaction.destination_account_id.in_(demo_ids)),
            )
            .limit(1)
        )
        if referenced is None:
            db.execute(
                delete(models.Account).where(
                    models.Account.id.in_(demo_ids), models.Account.owner_id == owner_id
                )
            )
    db.commit()


def run(
    email: str, *, months: int = 12, seed: int = 42, confirm: bool = False, reset: bool = False
) -> dict[str, int] | None:
    settings = get_settings()
    if str(getattr(settings, "environment", "development")).lower() not in {
        "development",
        "local",
        "test",
    }:
        raise RuntimeError("Demo data is available only in development/local environments.")
    if not confirm:
        print(
            f"Dry run: would generate {months} months for {email} (seed {seed}). "
            "Use --confirm to write."
        )
        return None
    with SessionLocal() as db:
        user = db.scalar(select(models.User).where(models.User.email == email))
        if user is None:
            raise RuntimeError(
                f"User not found: {email}. Create the user before running this script."
            )
        exists = db.scalar(
            select(models.Transaction.id)
            .where(
                models.Transaction.owner_id == user.id,
                models.Transaction.origin_key.like(f"{DEMO_ORIGIN}%"),
            )
            .limit(1)
        )
        if exists and not reset:
            raise RuntimeError("Demo data already exists.")
        if reset:
            reset_demo(db, user.id)
        return populate(db, user, months, seed)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate development-only MyFinance demo data")
    parser.add_argument("--email", required=True)
    parser.add_argument("--months", type=int, choices=(6, 12), default=12)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--confirm", action="store_true")
    parser.add_argument(
        "--reset-demo", action="store_true", help="remove tagged demo rows before recreating"
    )
    args = parser.parse_args()
    try:
        summary = run(
            args.email,
            months=args.months,
            seed=args.seed,
            confirm=args.confirm,
            reset=args.reset_demo,
        )
    except (RuntimeError, ValueError) as error:
        parser.error(str(error))
    if summary:
        print("Demo data created")
        print(f"User: {args.email}\nMonths: {args.months}")
        for label, value in summary.items():
            print(f"{label.capitalize()}: {value}")


if __name__ == "__main__":
    main()
