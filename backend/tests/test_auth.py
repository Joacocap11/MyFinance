def test_register_login_refresh_and_me(unauthenticated_client):
    registered = unauthenticated_client.post(
        "/api/v1/auth/register",
        json={"email": "person@example.com", "password": "correct horse battery staple"},
    )
    assert registered.status_code == 201
    second = unauthenticated_client.post(
        "/api/v1/auth/register",
        json={"email": "other@example.com", "password": "password"},
    )
    assert second.status_code == 403
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
