from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models


def reconcile(client: TestClient, account: models.Account, actual: str) -> dict[str, object]:
    response = client.post(
        f"/api/v1/settings/accounts/{account.id}/reconcile",
        json={"actual_balance": actual, "date": "2026-08-26", "note": "Cierre bancario"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_positive_reconciliation_preserves_history(
    client: TestClient, db: Session, account: models.Account
) -> None:
    db.add(
        models.Transaction(
            date=date(2026, 8, 20),
            kind=models.TransactionKind.EXPENSE,
            amount=Decimal("25.00"),
            description="Compra",
            account_id=account.id,
        )
    )
    db.commit()

    body = reconcile(client, account, "500.00")

    assert body["adjustment"]["amount"] == "425.00"
    assert body["account"]["current_balance"] == "500.00"
    assert db.query(models.Transaction).count() == 1


def test_negative_reconciliation(client: TestClient, db: Session, account: models.Account) -> None:
    account.opening_balance = Decimal("50000.00")
    db.commit()

    body = reconcile(client, account, "42000.00")

    assert body["adjustment"]["amount"] == "-8000.00"
    assert body["account"]["current_balance"] == "42000.00"


def test_zero_reconciliation_creates_no_record(client: TestClient, account: models.Account) -> None:
    body = reconcile(client, account, "100.00")

    assert body["already_reconciled"] is True
    assert body["adjustment"] is None


def test_reconciliation_does_not_change_monthly_flow(
    client: TestClient, db: Session, account: models.Account
) -> None:
    db.add_all(
        [
            models.Transaction(
                date=date(2026, 8, 5),
                kind=models.TransactionKind.INCOME,
                amount=Decimal("100.00"),
                description="Ingreso",
                account_id=account.id,
            ),
            models.Transaction(
                date=date(2026, 8, 6),
                kind=models.TransactionKind.EXPENSE,
                amount=Decimal("25.00"),
                description="Gasto",
                account_id=account.id,
            ),
        ]
    )
    db.commit()
    before = client.get("/api/v1/reports/monthly?month=2026-08&currency=UYU").json()

    reconcile(client, account, "1000.00")

    after = client.get("/api/v1/reports/monthly?month=2026-08&currency=UYU").json()
    assert (after["income"], after["expenses"], after["net"]) == (
        before["income"],
        before["expenses"],
        before["net"],
    )


def test_delete_account_with_adjustment_is_rejected(
    client: TestClient, account: models.Account
) -> None:
    reconcile(client, account, "101.00")

    response = client.delete(f"/api/v1/settings/accounts/{account.id}")

    assert response.status_code == 409
