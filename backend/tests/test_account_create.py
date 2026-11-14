from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models


def test_create_account_accepts_only_name_currency_opening_balance(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/v1/settings/accounts",
        json={"name": "TA Itau", "currency": "UYU", "opening_balance": "10000"},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "TA Itau"
    assert body["currency"] == "UYU"
    assert body["opening_balance"] == "10000.00"
    assert body["current_balance"] == "10000.00"
    assert body["is_default"] is False
    assert body["is_active"] is True


def test_create_account_rejects_unknown_field(client: TestClient) -> None:
    response = client.post(
        "/api/v1/settings/accounts",
        json={
            "name": "TA Itau",
            "currency": "UYU",
            "opening_balance": "10000",
            "is_active": True,
        },
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any(
        error["type"] == "extra_forbidden" and error["loc"][-1] == "is_active"
        for error in detail
    )


def test_create_account_rejects_other_unknown_field(client: TestClient) -> None:
    response = client.post(
        "/api/v1/settings/accounts",
        json={
            "name": "TA Itau",
            "currency": "UYU",
            "opening_balance": "10000",
            "owner_id": 99,
        },
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any(
        error["type"] == "extra_forbidden" and error["loc"][-1] == "owner_id"
        for error in detail
    )


def test_create_account_does_not_disturb_existing_default(
    client: TestClient, db: Session, account: models.Account
) -> None:
    account.is_default = True
    db.commit()

    response = client.post(
        "/api/v1/settings/accounts",
        json={"name": "Ahorro extra", "currency": "UYU", "opening_balance": "0"},
    )

    assert response.status_code == 201
    assert response.json()["is_default"] is False
    db.refresh(account)
    assert account.is_default is True


def test_create_second_account_does_not_violate_unique_default_index(
    client: TestClient, db: Session, account: models.Account
) -> None:
    account.is_default = True
    db.commit()

    first = client.post(
        "/api/v1/settings/accounts",
        json={"name": "Cuenta B", "currency": "UYU", "opening_balance": "0"},
    )
    second = client.post(
        "/api/v1/settings/accounts",
        json={"name": "Cuenta C", "currency": "USD", "opening_balance": "0"},
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["is_default"] is False
    assert second.json()["is_default"] is False


def test_create_account_stores_decimal_opening_balance_precisely(
    client: TestClient, db: Session
) -> None:
    response = client.post(
        "/api/v1/settings/accounts",
        json={"name": "Cuenta decimal", "currency": "UYU", "opening_balance": "1234.56"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["opening_balance"] == "1234.56"
    stored = db.query(models.Account).filter_by(name="Cuenta decimal").one()
    assert stored.opening_balance == Decimal("1234.56")
