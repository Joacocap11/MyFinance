
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import auth, models


def make_user(db: Session, email: str, *, is_admin: bool) -> models.User:
    user = models.User(
        email=email,
        password_hash=auth.hash_password("password-123"),
        is_admin=is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def use_user(client: TestClient, user: models.User) -> None:
    client.headers["Authorization"] = f"Bearer {auth.issue_tokens(user)['access_token']}"


def test_admin_can_manage_users_and_regular_user_cannot(
    unauthenticated_client: TestClient, db: Session
) -> None:
    admin = make_user(db, "admin@example.com", is_admin=True)
    use_user(unauthenticated_client, admin)

    created = unauthenticated_client.post(
        "/api/v1/admin/users",
        json={"email": "user@example.com", "password": "password-123"},
    )
    assert created.status_code == 201
    assert created.json()["is_admin"] is False

    regular = db.scalar(select_user("user@example.com"))
    assert regular is not None
    use_user(unauthenticated_client, regular)
    assert unauthenticated_client.get("/api/v1/admin/users").status_code == 403


def select_user(email: str):
    from sqlalchemy import select

    return select(models.User).where(models.User.email == email)


def test_personal_data_and_reports_are_isolated(
    unauthenticated_client: TestClient, db: Session
) -> None:
    first = make_user(db, "first@example.com", is_admin=True)
    second = make_user(db, "second@example.com", is_admin=False)

    use_user(unauthenticated_client, first)
    first_account = unauthenticated_client.post(
        "/api/v1/settings/accounts",
        json={"name": "Cuenta de First", "currency": "UYU", "opening_balance": "100.00"},
    ).json()
    first_category = unauthenticated_client.post(
        "/api/v1/settings/categories",
        json={"name": "Privada", "kind": "expense"},
    ).json()
    movement = unauthenticated_client.post(
        "/api/v1/transactions",
        json={
            "date": "2026-08-10",
            "kind": "expense",
            "amount": "25.00",
            "description": "Solo First",
            "account_id": first_account["id"],
            "category_id": first_category["id"],
        },
    )
    assert movement.status_code == 201

    use_user(unauthenticated_client, second)
    second_account = unauthenticated_client.post(
        "/api/v1/settings/accounts",
        json={"name": "Cuenta de Second", "currency": "UYU", "opening_balance": "50.00"},
    ).json()
    accounts = unauthenticated_client.get("/api/v1/settings/accounts").json()
    assert [item["id"] for item in accounts] == [second_account["id"]]
    movement_id = movement.json()["id"]
    assert unauthenticated_client.get(f"/api/v1/transactions/{movement_id}").status_code == 404
    report = unauthenticated_client.get("/api/v1/reports/monthly?month=2026-08&currency=UYU")
    assert report.status_code == 200
    assert report.json()["expenses"] == "0.00"
    cross_owner = unauthenticated_client.post(
        "/api/v1/transactions",
        json={
            "date": "2026-08-11",
            "kind": "expense",
            "amount": "1.00",
            "description": "Debe fallar",
            "account_id": first_account["id"],
            "category_id": None,
        },
    )
    assert cross_owner.status_code == 400
    assert unauthenticated_client.get(
        f"/api/v1/settings/accounts/{first_account['id']}"
    ).status_code in {404, 405}

    use_user(unauthenticated_client, first)
    first_report = unauthenticated_client.get(
        "/api/v1/reports/monthly?month=2026-08&currency=UYU"
    )
    assert first_report.json()["expenses"] == "25.00"
