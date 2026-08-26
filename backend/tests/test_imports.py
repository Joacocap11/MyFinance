from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models

MAPPING = {
    "account_id": 0,
    "mapping": {"date": "Fecha", "description": "Descripción", "amount": "Importe", "kind": "Tipo"},
}


def upload(
    client: TestClient, csv_text: str, filename: str = "movimientos.csv"
) -> dict[str, object]:
    response = client.post(
        "/api/v1/imports",
        files={"file": (filename, csv_text.encode(), "text/csv")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def preview(client: TestClient, batch_id: str, account_id: int) -> dict[str, object]:
    data = {**MAPPING, "account_id": account_id}
    response = client.post(f"/api/v1/imports/{batch_id}/preview", json=data)
    assert response.status_code == 200, response.text
    return response.json()


def test_signed_amounts_infer_kind_and_invalid_rows_remain_reviewable(
    client: TestClient, db: Session, account: models.Account
) -> None:
    csv_text = (
        "Fecha,Descripción,Importe\n"
        "2026-08-01,Salario,100.00\n"
        "2026-08-02,Compra,-25.50\n"
        "2026-08-03,Fórmula,=1+2\n"
        "2026-08-04,Moneda duplicada,$100USD\n"
    )
    uploaded = upload(client, csv_text)
    response = client.post(
        f"/api/v1/imports/{uploaded['id']}/preview",
        json={
            "account_id": account.id,
            "mapping": {
                "date": "Fecha",
                "description": "Descripción",
                "amount": "Importe",
            },
        },
    )

    assert response.status_code == 200, response.text
    rows = response.json()["rows"]
    assert [row["kind"] for row in rows] == ["income", "expense", None, None]
    assert rows[2]["date"] is None
    assert rows[2]["amount"] is None
    assert rows[2]["disposition"] == "skip"
    assert "Importe inválido" in rows[2]["error"]
    assert rows[3]["disposition"] == "skip"
    assert "Importe inválido" in rows[3]["error"]
    confirmed = client.post(f"/api/v1/imports/{uploaded['id']}/confirm")
    assert confirmed.status_code == 200
    assert confirmed.json()["imported_count"] == 2
    assert confirmed.json()["skipped_count"] == 2
    assert db.scalar(select(func.count()).select_from(models.Transaction)) == 2


def test_debit_and_credit_columns_are_supported(
    client: TestClient, account: models.Account
) -> None:
    uploaded = upload(
        client,
        "Fecha,Descripción,Débito,Crédito\n2026-08-01,Compra,12.00,\n2026-08-02,Devolución,,5.00\n",
    )
    response = client.post(
        f"/api/v1/imports/{uploaded['id']}/preview",
        json={
            "account_id": account.id,
            "mapping": {
                "date": "Fecha",
                "description": "Descripción",
                "debit": "Débito",
                "credit": "Crédito",
            },
        },
    )

    assert response.status_code == 200, response.text
    rows = response.json()["rows"]
    assert [(row["kind"], row["amount"]) for row in rows] == [
        ("expense", "12.00"),
        ("income", "5.00"),
    ]


def test_preview_applies_rules_without_creating_transactions_and_confirm_is_idempotent(
    client: TestClient,
    db: Session,
    account: models.Account,
    categories: dict[str, models.Category],
) -> None:
    client.post(
        "/api/v1/settings/rules",
        json={"needle": "super", "category_id": categories["food"].id, "priority": 1},
    )
    csv_text = (
        "Fecha,Descripción,Importe,Tipo\n"
        "2026-08-01,Supermercado,10.25,gasto\n"
        "2026-08-02,Salario,100.00,ingreso\n"
    )
    uploaded = upload(client, csv_text)
    assert uploaded["state"] == "uploaded"
    assert uploaded["headers"] == ["Fecha", "Descripción", "Importe", "Tipo"]
    body = preview(client, str(uploaded["id"]), account.id)
    assert body["state"] == "previewed"
    rows = body["rows"]
    assert len(rows) == 2
    assert rows[0]["amount"] == "10.25"
    assert rows[0]["category_id"] == categories["food"].id
    assert db.scalar(select(func.count()).select_from(models.Transaction)) == 0

    first = client.post(f"/api/v1/imports/{uploaded['id']}/confirm")
    assert first.status_code == 200
    assert first.json()["imported_count"] == 2
    assert len(first.json()["transaction_ids"]) == 2
    second = client.post(f"/api/v1/imports/{uploaded['id']}/confirm")
    assert second.status_code == 200
    assert second.json() == first.json()
    assert db.scalar(select(func.count()).select_from(models.Transaction)) == 2


def test_exact_replay_is_hard_deduplicated(
    client: TestClient, db: Session, account: models.Account
) -> None:
    csv_text = "Fecha,Descripción,Importe,Tipo\n2026-08-01,Kiosco,7.00,gasto\n"
    first = upload(client, csv_text)
    preview(client, str(first["id"]), account.id)
    client.post(f"/api/v1/imports/{first['id']}/confirm")

    replay = upload(client, csv_text, "otra-copia.csv")
    body = preview(client, str(replay["id"]), account.id)
    assert body["rows"][0]["disposition"] == "skip"
    assert body["rows"][0]["possible_duplicate"] is False
    confirmed = client.post(f"/api/v1/imports/{replay['id']}/confirm").json()
    assert confirmed["imported_count"] == 0
    assert confirmed["skipped_count"] == 1
    assert db.scalar(select(func.count()).select_from(models.Transaction)) == 1


def test_semantic_collision_requires_explicit_disposition(
    client: TestClient, db: Session, account: models.Account
) -> None:
    first_csv = "Fecha,Descripción,Importe,Tipo,Memo\n2026-08-03,Café,5.00,gasto,primera descarga\n"
    first = upload(client, first_csv)
    preview(client, str(first["id"]), account.id)
    client.post(f"/api/v1/imports/{first['id']}/confirm")

    changed_raw = (
        "Fecha,Descripción,Importe,Tipo,Memo\n2026-08-03,Café,5.00,gasto,archivo corregido\n"
    )
    second = upload(client, changed_raw)
    staged = preview(client, str(second["id"]), account.id)
    row = staged["rows"][0]
    assert row["possible_duplicate"] is True
    assert row["disposition"] == "possible_duplicate"

    skipped = client.post(f"/api/v1/imports/{second['id']}/confirm").json()
    assert skipped["imported_count"] == 0
    assert db.scalar(select(func.count()).select_from(models.Transaction)) == 1

    third = upload(client, changed_raw)
    staged_again = preview(client, str(third["id"]), account.id)
    row_id = staged_again["rows"][0]["id"]
    patch = client.patch(
        f"/api/v1/imports/{third['id']}/rows/{row_id}", json={"disposition": "import"}
    )
    assert patch.status_code == 200
    imported = client.post(f"/api/v1/imports/{third['id']}/confirm").json()
    assert imported["imported_count"] == 1
    assert db.scalar(select(func.count()).select_from(models.Transaction)) == 2


def test_upload_limit_and_csv_guard(client: TestClient) -> None:
    wrong = client.post("/api/v1/imports", files={"file": ("datos.txt", b"a,b\n1,2", "text/plain")})
    assert wrong.status_code == 415
    too_large = client.post(
        "/api/v1/imports",
        files={"file": ("datos.csv", b"x" * (2 * 1024 * 1024 + 1), "text/csv")},
    )
    assert too_large.status_code == 413
