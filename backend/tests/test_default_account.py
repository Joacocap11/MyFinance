from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.services import domain


def make_account(db: Session, name: str, *, is_default: bool = False) -> models.Account:
    item = models.Account(
        name=name,
        currency=models.Currency.UYU,
        opening_balance=Decimal("0.00"),
        is_active=True,
        is_default=is_default,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def test_new_account_is_not_default_by_default(client: TestClient) -> None:
    response = client.post(
        "/api/v1/settings/accounts",
        json={"name": "Cuenta nueva", "currency": "UYU", "opening_balance": "0"},
    )
    assert response.status_code == 201
    assert response.json()["is_default"] is False


def test_patch_account_set_is_default_promotes_and_demotes_previous(
    client: TestClient, db: Session
) -> None:
    first = make_account(db, "Cuenta A", is_default=True)
    second = make_account(db, "Cuenta B")

    response = client.patch(f"/api/v1/settings/accounts/{second.id}", json={"is_default": True})
    assert response.status_code == 200
    assert response.json()["is_default"] is True

    db.refresh(first)
    db.refresh(second)
    assert first.is_default is False
    assert second.is_default is True


def test_patch_account_unset_is_default_leaves_no_default(client: TestClient, db: Session) -> None:
    account = make_account(db, "Cuenta A", is_default=True)

    response = client.patch(f"/api/v1/settings/accounts/{account.id}", json={"is_default": False})
    assert response.status_code == 200
    assert response.json()["is_default"] is False


def test_patch_account_without_is_default_key_does_not_touch_default(
    client: TestClient, db: Session
) -> None:
    account = make_account(db, "Cuenta A", is_default=True)

    response = client.patch(f"/api/v1/settings/accounts/{account.id}", json={"name": "Renombrada"})
    assert response.status_code == 200
    assert response.json()["is_default"] is True
    assert response.json()["name"] == "Renombrada"


def test_list_accounts_orders_default_first(client: TestClient, db: Session) -> None:
    make_account(db, "Ahorro", is_default=False)
    make_account(db, "Cuenta principal", is_default=True)
    make_account(db, "Zeta", is_default=False)

    response = client.get("/api/v1/settings/accounts")
    names = [item["name"] for item in response.json()]
    assert names == ["Cuenta principal", "Ahorro", "Zeta"]


def test_only_one_default_account_per_owner_at_db_level(db: Session) -> None:
    make_account(db, "Cuenta A", is_default=True)
    second = models.Account(
        name="Cuenta B",
        currency=models.Currency.UYU,
        opening_balance=Decimal("0.00"),
        is_active=True,
        is_default=True,
    )
    db.add(second)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_domain_set_default_account_is_atomic(db: Session) -> None:
    first = make_account(db, "Cuenta A", is_default=True)
    second = make_account(db, "Cuenta B")

    domain.set_default_account(db, second)
    db.commit()
    db.refresh(first)
    db.refresh(second)

    assert first.is_default is False
    assert second.is_default is True
