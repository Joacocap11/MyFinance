from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models


def transaction(
    account_id: int, description: str, category_id: int | None = None
) -> dict[str, object]:
    return {
        "date": "2026-08-20",
        "kind": "expense",
        "amount": "8.50",
        "description": description,
        "account_id": account_id,
        "category_id": category_id,
    }


def test_rules_are_normalized_first_match_and_explicit_category_wins(
    client: TestClient,
    db: Session,
    account: models.Account,
    categories: dict[str, models.Category],
) -> None:
    later = client.post(
        "/api/v1/settings/rules",
        json={"needle": "café", "category_id": categories["food"].id, "priority": 20},
    )
    first = client.post(
        "/api/v1/settings/rules",
        json={"needle": "CAFÉ CENTRAL", "category_id": categories["auto"].id, "priority": 10},
    )
    assert later.status_code == 201
    assert first.status_code == 201

    matched = client.post(
        "/api/v1/transactions", json=transaction(account.id, "Pago Cafe   Central del centro")
    )
    assert matched.status_code == 201
    assert matched.json()["category_id"] == categories["auto"].id

    explicit = client.post(
        "/api/v1/transactions",
        json=transaction(account.id, "CAFÉ CENTRAL", categories["food"].id),
    )
    assert explicit.status_code == 201
    assert explicit.json()["category_id"] == categories["food"].id


def test_rule_priority_then_id_is_deterministic(
    client: TestClient, account: models.Account, categories: dict[str, models.Category]
) -> None:
    first = client.post(
        "/api/v1/settings/rules",
        json={"needle": "market", "category_id": categories["food"].id, "priority": 5},
    ).json()
    client.post(
        "/api/v1/settings/rules",
        json={"needle": "market", "category_id": categories["auto"].id, "priority": 5},
    )
    created = client.post(
        "/api/v1/transactions", json=transaction(account.id, "MARKET semanal")
    ).json()
    assert created["category_id"] == first["category_id"]


def test_rule_needle_cannot_normalize_to_empty(
    client: TestClient, categories: dict[str, models.Category]
) -> None:
    created = client.post(
        "/api/v1/settings/rules",
        json={"needle": "mercado", "category_id": categories["food"].id},
    )
    assert created.status_code == 201

    empty_create = client.post(
        "/api/v1/settings/rules",
        json={"needle": "   ", "category_id": categories["food"].id},
    )
    empty_patch = client.patch(
        f"/api/v1/settings/rules/{created.json()['id']}",
        json={"needle": "\t"},
    )

    assert empty_create.status_code == 422
    assert empty_patch.status_code == 422
