from fastapi.testclient import TestClient
from sqlalchemy import select
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
    assert "password_hash" not in created.text
    listed = unauthenticated_client.get("/api/v1/admin/users")
    assert listed.status_code == 200
    assert "password_hash" not in listed.text
    regular = db.scalar(select(models.User).where(models.User.email == "user@example.com"))
    assert regular is not None
    use_user(unauthenticated_client, regular)
    assert unauthenticated_client.get("/api/v1/admin/users").status_code == 403


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
        "/api/v1/settings/categories", json={"name": "Privada", "kind": "expense"}
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
    use_user(unauthenticated_client, first)
    first_report = unauthenticated_client.get("/api/v1/reports/monthly?month=2026-08&currency=UYU")
    assert first_report.json()["expenses"] == "25.00"


def test_admin_guards_and_inactive_user_tokens(
    unauthenticated_client: TestClient, db: Session
) -> None:
    admin = make_user(db, "owner@example.com", is_admin=True)
    other_admin = make_user(db, "other-admin@example.com", is_admin=True)
    user = make_user(db, "inactive@example.com", is_admin=False)
    use_user(unauthenticated_client, admin)
    assert (
        unauthenticated_client.patch(
            f"/api/v1/admin/users/{admin.id}", json={"is_admin": False}
        ).status_code
        == 409
    )
    assert (
        unauthenticated_client.patch(
            f"/api/v1/admin/users/{user.id}", json={"is_active": False}
        ).status_code
        == 200
    )
    assert (
        unauthenticated_client.post(
            "/api/v1/auth/login",
            json={"email": "inactive@example.com", "password": "password-123"},
        ).status_code
        == 401
    )
    user_tokens = auth.issue_tokens(user)
    refresh = unauthenticated_client.post(
        "/api/v1/auth/refresh", json={"refresh_token": user_tokens["refresh_token"]}
    )
    assert refresh.status_code == 401
    use_user(unauthenticated_client, other_admin)
    assert (
        unauthenticated_client.patch(
            f"/api/v1/admin/users/{admin.id}", json={"is_active": False}
        ).status_code
        == 200
    )
    assert (
        unauthenticated_client.patch(
            f"/api/v1/admin/users/{other_admin.id}", json={"is_admin": False}
        ).status_code
        == 409
    )


def test_private_resource_ids_are_not_usable_by_other_users(
    unauthenticated_client: TestClient, db: Session
) -> None:
    owner = make_user(db, "resource-owner@example.com", is_admin=True)
    attacker = make_user(db, "resource-attacker@example.com", is_admin=False)
    use_user(unauthenticated_client, owner)
    account = unauthenticated_client.post(
        "/api/v1/settings/accounts",
        json={"name": "Privada", "currency": "UYU", "opening_balance": "10.00"},
    ).json()
    category = unauthenticated_client.post(
        "/api/v1/settings/categories", json={"name": "Privada", "kind": "expense"}
    ).json()
    recurring = unauthenticated_client.post(
        "/api/v1/settings/recurring-expenses",
        json={
            "description": "Recurrente privada",
            "amount": "5.00",
            "day_of_month": 5,
            "account_id": account["id"],
            "category_id": category["id"],
        },
    ).json()
    rule = unauthenticated_client.post(
        "/api/v1/settings/rules",
        json={"needle": "privada", "category_id": category["id"]},
    ).json()
    unauthenticated_client.put(
        "/api/v1/settings/monthly-budget?currency=UYU", json={"amount": "20.00"}
    )
    transaction = unauthenticated_client.post(
        "/api/v1/transactions",
        json={
            "date": "2026-08-12",
            "kind": "expense",
            "amount": "2.00",
            "description": "Privada",
            "account_id": account["id"],
            "category_id": category["id"],
        },
    ).json()
    upload = unauthenticated_client.post(
        "/api/v1/imports",
        files={
            "file": ("private.csv", b"date,description,amount\n2026-08-13,Privada,1.00", "text/csv")
        },
    )
    assert upload.status_code == 201
    batch_id = upload.json()["id"]
    use_user(unauthenticated_client, attacker)
    private_paths = (
        f"/api/v1/settings/accounts/{account['id']}",
        f"/api/v1/settings/categories/{category['id']}",
        f"/api/v1/settings/recurring-expenses/{recurring['id']}",
        f"/api/v1/settings/rules/{rule['id']}",
        f"/api/v1/transactions/{transaction['id']}",
        f"/api/v1/imports/{batch_id}",
    )
    for path in private_paths:
        assert unauthenticated_client.get(path).status_code == 404
    assert (
        unauthenticated_client.patch(
            f"/api/v1/settings/accounts/{account['id']}", json={"name": "robada"}
        ).status_code
        == 404
    )
    assert (
        unauthenticated_client.delete(f"/api/v1/settings/accounts/{account['id']}").status_code
        == 404
    )
    assert (
        unauthenticated_client.post(f"/api/v1/transactions/{transaction['id']}/void").status_code
        == 404
    )
    assert (
        unauthenticated_client.post(
            f"/api/v1/settings/accounts/{account['id']}/reconcile",
            json={"actual_balance": "0.00", "note": "ataque"},
        ).status_code
        == 404
    )
    assert (
        unauthenticated_client.patch(
            f"/api/v1/settings/recurring-expenses/{recurring['id']}", json={"amount": "9.00"}
        ).status_code
        == 404
    )
    assert (
        unauthenticated_client.patch(
            f"/api/v1/settings/rules/{rule['id']}", json={"needle": "atacada"}
        ).status_code
        == 404
    )
    assert unauthenticated_client.post(f"/api/v1/imports/{batch_id}/confirm").status_code == 404
    assert (
        unauthenticated_client.get("/api/v1/settings/monthly-budget?currency=UYU").json()["amount"]
        is None
    )
