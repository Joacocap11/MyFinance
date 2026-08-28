from app import models


def test_register_login_refresh_and_me(unauthenticated_client, db):
    registered = unauthenticated_client.post(
        "/api/v1/auth/register",
        json={"email": "person@example.com", "password": "correct horse battery staple"},
    )
    assert registered.status_code == 201
    assert registered.json()["user"]["is_admin"] is True
    second = unauthenticated_client.post(
        "/api/v1/auth/register",
        json={"email": "other@example.com", "password": "password"},
    )
    assert second.status_code == 201
    assert second.json()["user"]["is_admin"] is False
    assert db.query(models.Account).count() == 0
    assert (
        db.query(models.Category)
        .filter(models.Category.owner_id == second.json()["user"]["id"])
        .count()
        > 0
    )
    tokens = registered.json()

    login = unauthenticated_client.post(
        "/api/v1/auth/login",
        json={"email": "PERSON@example.com", "password": "correct horse battery staple"},
    )
    assert login.status_code == 200
    login_tokens = login.json()

    me = unauthenticated_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {login_tokens['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == "person@example.com"

    refreshed = unauthenticated_client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]


def test_registration_status_and_limit(unauthenticated_client):
    for index in range(5):
        response = unauthenticated_client.post(
            "/api/v1/auth/register",
            json={"email": f"user{index}@example.com", "password": "password"},
        )
        assert response.status_code == 201
    status = unauthenticated_client.get("/api/v1/auth/registration-status")
    assert status.json() == {
        "enabled": False,
        "current_users": 5,
        "max_users": 5,
        "remaining_slots": 0,
    }
    rejected = unauthenticated_client.post(
        "/api/v1/auth/register",
        json={"email": "user5@example.com", "password": "password"},
    )
    assert rejected.status_code == 409
    assert rejected.json()["detail"] == "Se alcanzó el límite máximo de cuentas."


def test_public_registration_cannot_choose_admin(unauthenticated_client):
    response = unauthenticated_client.post(
        "/api/v1/auth/register",
        json={"email": "admin@example.com", "password": "password", "is_admin": True},
    )
    assert response.status_code == 422


def test_login_rejects_invalid_password(unauthenticated_client):
    unauthenticated_client.post(
        "/api/v1/auth/register", json={"email": "person@example.com", "password": "secret"}
    )
    response = unauthenticated_client.post(
        "/api/v1/auth/login", json={"email": "person@example.com", "password": "wrong"}
    )
    assert response.status_code == 401


def test_financial_endpoint_requires_auth(unauthenticated_client):
    response = unauthenticated_client.get("/api/v1/settings/accounts")
    assert response.status_code == 401
