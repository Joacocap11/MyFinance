from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models


def payload(account_id: int, **overrides: object) -> dict[str, object]:
    data: dict[str, object] = {
        "date": "2026-08-10",
        "kind": "expense",
        "amount": "10.10",
        "description": "Compra",
        "account_id": account_id,
    }
    data.update(overrides)
    return data


def test_money_is_exact_and_serialized_as_string(
    client: TestClient, account: models.Account
) -> None:
    first = client.post("/api/v1/transactions", json=payload(account.id, amount="0.10"))
    second = client.post("/api/v1/transactions", json=payload(account.id, amount="0.20"))

    assert first.status_code == 201
    assert first.json()["amount"] == "0.10"
    assert second.json()["amount"] == "0.20"
    report = client.get("/api/v1/reports/monthly?month=2026-08&currency=UYU")
    assert report.status_code == 200
    assert report.json()["expenses"] == "0.30"
    assert report.json()["net"] == "-0.30"
    assert (
        client.post("/api/v1/transactions", json=payload(account.id, amount="1.001")).status_code
        == 422
    )


def test_transaction_shape_transfer_rules_and_void_immutability(
    client: TestClient, db: Session, account: models.Account, categories: dict[str, models.Category]
) -> None:
    wrong_kind = client.post(
        "/api/v1/transactions",
        json=payload(account.id, category_id=categories["salary"].id),
    )
    assert wrong_kind.status_code == 400

    same_account = client.post(
        "/api/v1/transactions",
        json=payload(
            account.id,
            kind="transfer",
            destination_account_id=account.id,
            category_id=None,
        ),
    )
    assert same_account.status_code == 400

    usd = models.Account(
        name="Cuenta USD",
        currency=models.Currency.USD,
        opening_balance=Decimal("0"),
        is_active=True,
    )
    db.add(usd)
    db.commit()
    cross_currency = client.post(
        "/api/v1/transactions",
        json=payload(
            account.id,
            kind="transfer",
            destination_account_id=usd.id,
            category_id=None,
        ),
    )
    assert cross_currency.status_code == 400

    created = client.post(
        "/api/v1/transactions",
        json=payload(account.id, category_id=categories["food"].id),
    )
    transaction_id = created.json()["id"]
    voided = client.post(f"/api/v1/transactions/{transaction_id}/void")
    assert voided.status_code == 200
    assert voided.json()["is_voided"] is True
    assert (
        client.patch(f"/api/v1/transactions/{transaction_id}", json={"amount": "12.00"}).status_code
        == 409
    )
    report = client.get("/api/v1/reports/monthly?month=2026-08&currency=UYU").json()
    assert report["expenses"] == "0.00"


def test_valid_transfer_changes_each_account_balance_without_affecting_reports(
    client: TestClient, db: Session, account: models.Account
) -> None:
    destination = models.Account(
        name="Ahorro", currency=models.Currency.UYU, opening_balance=Decimal("5.00"), is_active=True
    )
    db.add(destination)
    db.commit()
    response = client.post(
        "/api/v1/transactions",
        json=payload(
            account.id,
            kind="transfer",
            amount="20.00",
            destination_account_id=destination.id,
            category_id=None,
        ),
    )
    assert response.status_code == 201
    accounts = {item["id"]: item for item in client.get("/api/v1/settings/accounts").json()}
    assert accounts[account.id]["current_balance"] == "80.00"
    assert accounts[destination.id]["current_balance"] == "25.00"
    report = client.get("/api/v1/reports/monthly?month=2026-08&currency=UYU").json()
    assert report["income"] == "0.00"
    assert report["expenses"] == "0.00"


def test_transaction_list_can_be_scoped_to_one_currency(
    client: TestClient, db: Session, account: models.Account
) -> None:
    usd = models.Account(
        name="Dólares",
        currency=models.Currency.USD,
        opening_balance=Decimal("0"),
        is_active=True,
    )
    db.add(usd)
    db.commit()
    uyu_id = client.post("/api/v1/transactions", json=payload(account.id)).json()["id"]
    usd_id = client.post("/api/v1/transactions", json=payload(usd.id)).json()["id"]

    uyu = client.get("/api/v1/transactions?currency=UYU").json()
    usd_rows = client.get("/api/v1/transactions?currency=USD").json()

    assert [item["id"] for item in uyu["items"]] == [uyu_id]
    assert [item["id"] for item in usd_rows["items"]] == [usd_id]


def test_opening_balance_is_immutable_after_account_creation(
    client: TestClient, account: models.Account
) -> None:
    response = client.patch(
        f"/api/v1/settings/accounts/{account.id}",
        json={"opening_balance": "999.00"},
    )

    assert response.status_code == 422
    stored = client.get("/api/v1/settings/accounts").json()[0]
    assert stored["opening_balance"] == "100.00"


def test_cross_site_origin_cannot_void_a_transaction(
    client: TestClient, account: models.Account
) -> None:
    transaction_id = client.post("/api/v1/transactions", json=payload(account.id)).json()["id"]

    response = client.post(
        f"/api/v1/transactions/{transaction_id}/void",
        headers={"Origin": "https://malicioso.example"},
    )

    assert response.status_code == 403
    assert client.get(f"/api/v1/transactions/{transaction_id}").json()["is_voided"] is False
