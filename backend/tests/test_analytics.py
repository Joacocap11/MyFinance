from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models


def add_transaction(
    db: Session,
    *,
    posted_on: date,
    kind: models.TransactionKind,
    amount: str,
    account_id: int,
    description: str = "Movimiento",
    destination_account_id: int | None = None,
    destination_amount: str | None = None,
    category_id: int | None = None,
    voided: bool = False,
) -> models.Transaction:
    item = models.Transaction(
        date=posted_on,
        kind=kind,
        amount=Decimal(amount),
        description=description,
        account_id=account_id,
        destination_account_id=destination_account_id,
        destination_amount=Decimal(destination_amount) if destination_amount else None,
        category_id=category_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    if voided:
        from datetime import UTC, datetime

        item.voided_at = datetime.now(UTC)
        db.commit()
    return item


def balance_at_date(
    client: TestClient, account_id: int, on_date: str, moment: str = "closing"
) -> dict[str, object]:
    response = client.get(
        "/api/v1/analytics/balance-at-date",
        params={"account_id": account_id, "date": on_date, "moment": moment},
    )
    assert response.status_code == 200, response.text
    return response.json()


def balance_history(client: TestClient, account_id: int, date_from: str, date_to: str) -> dict:
    response = client.get(
        "/api/v1/analytics/balance-history",
        params={"account_id": account_id, "date_from": date_from, "date_to": date_to},
    )
    assert response.status_code == 200, response.text
    return response.json()


def balance_summary(client: TestClient, account_id: int, date_from: str, date_to: str) -> dict:
    response = client.get(
        "/api/v1/analytics/balance-summary",
        params={"account_id": account_id, "date_from": date_from, "date_to": date_to},
    )
    assert response.status_code == 200, response.text
    return response.json()


# 1. Opening balance only, no movements.
def test_no_movements_returns_opening_balance(client: TestClient, account: models.Account) -> None:
    account.opening_balance = Decimal("10000.00")
    body = balance_at_date(client, account.id, "2026-10-07")
    assert body["balance"] == "10000.00"
    assert body["opening_balance"] == "10000.00"
    assert body["closing_balance"] == "10000.00"
    assert body["transaction_count"] == 0


# 2. Single expense.
def test_single_expense_reduces_closing_balance(
    client: TestClient, db: Session, account: models.Account
) -> None:
    account.opening_balance = Decimal("10000.00")
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 7),
        kind=models.TransactionKind.EXPENSE,
        amount="1000.00",
        account_id=account.id,
    )
    body = balance_at_date(client, account.id, "2026-10-07")
    assert body["opening_balance"] == "10000.00"
    assert body["closing_balance"] == "9000.00"
    assert body["expenses"] == "1000.00"
    assert body["net_change"] == "-1000.00"


# 3. Single income.
def test_single_income_increases_closing_balance(
    client: TestClient, db: Session, account: models.Account
) -> None:
    account.opening_balance = Decimal("10000.00")
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 7),
        kind=models.TransactionKind.INCOME,
        amount="2000.00",
        account_id=account.id,
    )
    body = balance_at_date(client, account.id, "2026-10-07")
    assert body["closing_balance"] == "12000.00"
    assert body["income"] == "2000.00"


# 4. Several movements same day.
def test_multiple_movements_same_day_aggregate_correctly(
    client: TestClient, db: Session, account: models.Account
) -> None:
    account.opening_balance = Decimal("1000.00")
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 7),
        kind=models.TransactionKind.INCOME,
        amount="500.00",
        account_id=account.id,
    )
    add_transaction(
        db,
        posted_on=date(2026, 10, 7),
        kind=models.TransactionKind.EXPENSE,
        amount="200.00",
        account_id=account.id,
    )
    add_transaction(
        db,
        posted_on=date(2026, 10, 7),
        kind=models.TransactionKind.EXPENSE,
        amount="50.00",
        account_id=account.id,
    )
    body = balance_at_date(client, account.id, "2026-10-07")
    assert body["income"] == "500.00"
    assert body["expenses"] == "250.00"
    assert body["closing_balance"] == "1250.00"
    assert body["transaction_count"] == 3


# 5. Day without movements carries the previous day's balance forward.
def test_day_without_movements_carries_previous_balance(
    client: TestClient, db: Session, account: models.Account
) -> None:
    account.opening_balance = Decimal("1000.00")
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 5),
        kind=models.TransactionKind.INCOME,
        amount="300.00",
        account_id=account.id,
    )
    body = balance_at_date(client, account.id, "2026-10-06")
    assert body["opening_balance"] == "1300.00"
    assert body["closing_balance"] == "1300.00"
    assert body["transaction_count"] == 0


# 6. Transfer between two accounts: per-account effect, zero net globally.
def test_transfer_moves_money_between_accounts_with_zero_global_net(
    client: TestClient, db: Session, account: models.Account
) -> None:
    other = models.Account(
        name="Cuenta B", currency=models.Currency.UYU, opening_balance=Decimal("500.00")
    )
    db.add(other)
    db.commit()
    db.refresh(other)
    account.opening_balance = Decimal("1000.00")
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 7),
        kind=models.TransactionKind.TRANSFER,
        amount="300.00",
        account_id=account.id,
        destination_account_id=other.id,
    )
    source = balance_at_date(client, account.id, "2026-10-07")
    destination = balance_at_date(client, other.id, "2026-10-07")
    assert source["closing_balance"] == "700.00"
    assert source["transfers_out"] == "300.00"
    assert destination["closing_balance"] == "800.00"
    assert destination["transfers_in"] == "300.00"
    net_global = Decimal(source["net_change"]) + Decimal(destination["net_change"])
    assert net_global == Decimal("0.00")


# 7. Opening vs closing for the same day.
def test_opening_vs_closing_moment_differ_on_an_active_day(
    client: TestClient, db: Session, account: models.Account
) -> None:
    account.opening_balance = Decimal("1000.00")
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 7),
        kind=models.TransactionKind.EXPENSE,
        amount="100.00",
        account_id=account.id,
    )
    opening = balance_at_date(client, account.id, "2026-10-07", moment="opening")
    closing = balance_at_date(client, account.id, "2026-10-07", moment="closing")
    assert opening["balance"] == "1000.00"
    assert closing["balance"] == "900.00"


# 8. Query before the first movement.
def test_query_before_first_movement_returns_opening_balance(
    client: TestClient, db: Session, account: models.Account
) -> None:
    account.opening_balance = Decimal("500.00")
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 10),
        kind=models.TransactionKind.INCOME,
        amount="100.00",
        account_id=account.id,
    )
    body = balance_at_date(client, account.id, "2026-10-01")
    assert body["closing_balance"] == "500.00"
    assert body["transaction_count"] == 0


# 9. Query after all movements.
def test_query_after_all_movements_returns_final_balance(
    client: TestClient, db: Session, account: models.Account
) -> None:
    account.opening_balance = Decimal("500.00")
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 1),
        kind=models.TransactionKind.INCOME,
        amount="100.00",
        account_id=account.id,
    )
    add_transaction(
        db,
        posted_on=date(2026, 10, 5),
        kind=models.TransactionKind.EXPENSE,
        amount="40.00",
        account_id=account.id,
    )
    body = balance_at_date(client, account.id, "2026-12-31")
    assert body["closing_balance"] == "560.00"


# 10. Decimal precision.
def test_decimal_amounts_are_exact(
    client: TestClient, db: Session, account: models.Account
) -> None:
    account.opening_balance = Decimal("0.01")
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 7),
        kind=models.TransactionKind.INCOME,
        amount="0.02",
        account_id=account.id,
    )
    add_transaction(
        db,
        posted_on=date(2026, 10, 7),
        kind=models.TransactionKind.EXPENSE,
        amount="0.01",
        account_id=account.id,
    )
    body = balance_at_date(client, account.id, "2026-10-07")
    assert body["closing_balance"] == "0.02"


# 11. Income with category (e.g. a refund) behaves like any other income.
def test_categorized_income_counts_as_income(
    client: TestClient, db: Session, account: models.Account, categories: dict[str, models.Category]
) -> None:
    account.opening_balance = Decimal("0.00")
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 7),
        kind=models.TransactionKind.INCOME,
        amount="150.00",
        account_id=account.id,
        category_id=categories["salary"].id,
    )
    body = balance_at_date(client, account.id, "2026-10-07")
    assert body["income"] == "150.00"
    assert body["closing_balance"] == "150.00"


# 12. Category does not alter the accounting logic (expense with vs without category nets the same).
def test_category_assignment_does_not_change_balance_math(
    client: TestClient, db: Session, account: models.Account, categories: dict[str, models.Category]
) -> None:
    account.opening_balance = Decimal("1000.00")
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 7),
        kind=models.TransactionKind.EXPENSE,
        amount="100.00",
        account_id=account.id,
        category_id=categories["food"].id,
    )
    with_category = balance_at_date(client, account.id, "2026-10-07")

    db.query(models.Transaction).delete()
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 7),
        kind=models.TransactionKind.EXPENSE,
        amount="100.00",
        account_id=account.id,
        category_id=None,
    )
    without_category = balance_at_date(client, account.id, "2026-10-07")
    assert with_category["closing_balance"] == without_category["closing_balance"]


# Voided transactions must not affect any figure.
def test_voided_transaction_is_excluded(
    client: TestClient, db: Session, account: models.Account
) -> None:
    account.opening_balance = Decimal("1000.00")
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 7),
        kind=models.TransactionKind.EXPENSE,
        amount="999.00",
        account_id=account.id,
        voided=True,
    )
    body = balance_at_date(client, account.id, "2026-10-07")
    assert body["closing_balance"] == "1000.00"
    assert body["transaction_count"] == 0


def test_balance_history_fills_gaps_by_carrying_balance_forward(
    client: TestClient, db: Session, account: models.Account
) -> None:
    account.opening_balance = Decimal("100.00")
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 1),
        kind=models.TransactionKind.INCOME,
        amount="50.00",
        account_id=account.id,
    )
    add_transaction(
        db,
        posted_on=date(2026, 10, 3),
        kind=models.TransactionKind.EXPENSE,
        amount="20.00",
        account_id=account.id,
    )

    body = balance_history(client, account.id, "2026-10-01", "2026-10-04")
    days = {day["date"]: day for day in body["days"]}
    assert len(body["days"]) == 4
    assert days["2026-10-01"]["opening_balance"] == "100.00"
    assert days["2026-10-01"]["closing_balance"] == "150.00"
    assert days["2026-10-02"]["opening_balance"] == "150.00"
    assert days["2026-10-02"]["closing_balance"] == "150.00"
    assert days["2026-10-03"]["closing_balance"] == "130.00"
    assert days["2026-10-04"]["opening_balance"] == "130.00"
    assert days["2026-10-04"]["closing_balance"] == "130.00"


def test_balance_summary_reports_min_max_and_totals(
    client: TestClient, db: Session, account: models.Account
) -> None:
    account.opening_balance = Decimal("1000.00")
    db.commit()
    add_transaction(
        db,
        posted_on=date(2026, 10, 2),
        kind=models.TransactionKind.EXPENSE,
        amount="800.00",
        account_id=account.id,
    )
    add_transaction(
        db,
        posted_on=date(2026, 10, 5),
        kind=models.TransactionKind.INCOME,
        amount="2000.00",
        account_id=account.id,
    )

    body = balance_summary(client, account.id, "2026-10-01", "2026-10-10")
    assert body["opening_balance"] == "1000.00"
    assert body["closing_balance"] == "2200.00"
    assert body["min_balance"] == "200.00"
    assert body["min_balance_date"] == "2026-10-02"
    assert body["max_balance"] == "2200.00"
    assert body["max_balance_date"] == "2026-10-05"
    assert body["net_change"] == "1200.00"
    assert body["income"] == "2000.00"
    assert body["expenses"] == "800.00"
    assert body["transaction_count"] == 2


def test_balance_at_date_closing_matches_current_balance_for_today(
    client: TestClient, db: Session, account: models.Account
) -> None:
    account.opening_balance = Decimal("1000.00")
    db.commit()
    add_transaction(
        db,
        posted_on=date.today(),
        kind=models.TransactionKind.INCOME,
        amount="25.00",
        account_id=account.id,
    )

    account_body = client.get(f"/api/v1/settings/accounts/{account.id}").json()
    today_str = date.today().isoformat()
    balance_body = balance_at_date(client, account.id, today_str)
    assert balance_body["closing_balance"] == account_body["current_balance"]


def test_reversed_date_range_is_rejected(client: TestClient, account: models.Account) -> None:
    response = client.get(
        "/api/v1/analytics/balance-history",
        params={"account_id": account.id, "date_from": "2026-10-10", "date_to": "2026-10-01"},
    )
    assert response.status_code == 422


def test_unknown_account_returns_404(client: TestClient) -> None:
    response = client.get(
        "/api/v1/analytics/balance-at-date",
        params={"account_id": 999999, "date": "2026-10-07"},
    )
    assert response.status_code == 404
