from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models


def add_transaction(
    db: Session,
    account: models.Account,
    *,
    posted_on: date,
    kind: models.TransactionKind,
    amount: str,
    description: str,
    category: models.Category | None = None,
) -> models.Transaction:
    item = models.Transaction(
        date=posted_on,
        kind=kind,
        amount=Decimal(amount),
        description=description,
        account_id=account.id,
        category_id=category.id if category else None,
    )
    db.add(item)
    db.commit()
    return item


def test_monthly_summary_zero_baseline_budget_and_category_rollup(
    client: TestClient,
    db: Session,
    account: models.Account,
    categories: dict[str, models.Category],
) -> None:
    fuel = add_transaction(
        db,
        account,
        posted_on=date(2026, 8, 5),
        kind=models.TransactionKind.EXPENSE,
        amount="25.25",
        description="Nafta",
        category=categories["fuel"],
    )
    add_transaction(
        db,
        account,
        posted_on=date(2026, 8, 6),
        kind=models.TransactionKind.EXPENSE,
        amount="4.75",
        description="Sin categoría",
    )
    add_transaction(
        db,
        account,
        posted_on=date(2026, 8, 1),
        kind=models.TransactionKind.INCOME,
        amount="100.00",
        description="Sueldo",
        category=categories["salary"],
    )
    db.add(models.MonthlyBudget(currency=models.Currency.UYU, amount=Decimal("60.00")))
    db.commit()

    response = client.get("/api/v1/reports/monthly?month=2026-08&currency=UYU")
    assert response.status_code == 200
    body = response.json()
    assert body["income"] == "100.00"
    assert body["expenses"] == "30.00"
    assert body["net"] == "70.00"
    assert body["budget"] == "60.00"
    assert body["spent_percentage"] == "50.00"
    assert body["comparison"] == {
        "previous_month": "2026-07",
        "previous_expenses": "0.00",
        "change_percentage": None,
    }
    assert body["categories"] == [
        {
            "category_id": categories["auto"].id,
            "name": "Auto",
            "amount": "25.25",
            "percentage": "84.17",
        },
        {
            "category_id": None,
            "name": "Sin categoría",
            "amount": "4.75",
            "percentage": "15.83",
        },
    ]
    assert body["top_expenses"][0]["id"] == fuel.id
    assert 1 <= len(body["insights"]) <= 3
    assert body["insights"][0]["transaction_ids"] == [fuel.id]


def test_empty_month_has_exact_zeroes_and_null_percentages(
    client: TestClient, account: models.Account
) -> None:
    body = client.get("/api/v1/reports/monthly?month=2025-01&currency=USD").json()
    assert body["income"] == "0.00"
    assert body["expenses"] == "0.00"
    assert body["net"] == "0.00"
    assert body["spent_percentage"] is None
    assert body["comparison"]["change_percentage"] is None
    assert body["categories"] == []


def test_history_is_currency_scoped_and_contains_requested_months(
    client: TestClient, db: Session, account: models.Account
) -> None:
    today = date.today()
    add_transaction(
        db,
        account,
        posted_on=today,
        kind=models.TransactionKind.EXPENSE,
        amount="12.34",
        description="Actual",
    )
    usd = models.Account(
        name="USD", currency=models.Currency.USD, opening_balance=Decimal("0"), is_active=True
    )
    db.add(usd)
    db.commit()
    add_transaction(
        db,
        usd,
        posted_on=today,
        kind=models.TransactionKind.EXPENSE,
        amount="99.99",
        description="Otro signo",
    )

    body = client.get("/api/v1/reports/history?months=2&currency=UYU").json()
    assert body["currency"] == "UYU"
    assert len(body["months"]) == 2
    assert body["months"][-1]["month"] == today.strftime("%Y-%m")
    assert body["months"][-1]["expenses"] == "12.34"
