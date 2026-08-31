from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app import models


def test_export_returns_portable_csv_and_excludes_voided(
    client, db: Session, account, categories
) -> None:
    db.add_all(
        [
            models.Transaction(
                date=date(2026, 8, 1),
                kind=models.TransactionKind.EXPENSE,
                amount=Decimal("1234.56"),
                description="Compra, café ñ",
                account_id=account.id,
                category_id=categories["fuel"].id,
            ),
            models.Transaction(
                date=date(2026, 8, 2),
                kind=models.TransactionKind.INCOME,
                amount=Decimal("10.00"),
                description="Anulado",
                account_id=account.id,
                voided_at=__import__("datetime").datetime.now(),
            ),
        ]
    )
    db.commit()
    response = client.get(f"/api/v1/settings/accounts/{account.id}/export.csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    assert "cuenta-uyu" in response.headers["content-disposition"]
    body = response.content.decode("utf-8")
    assert "Compra, café ñ" in body
    assert '"Compra, café ñ"' in body
    assert "Anulado" not in body
    assert "Auto > Combustible" in body


def test_export_import_preserves_transfer_semantics(client, db: Session, account) -> None:
    destination = models.Account(
        name="Cuenta USD", currency=models.Currency.USD, opening_balance=0, is_active=True
    )
    db.add(destination)
    target = models.Account(
        name="Destino UYU", currency=models.Currency.UYU, opening_balance=0, is_active=True
    )
    db.add(target)
    db.flush()
    db.add(
        models.Transaction(
            date=date(2026, 8, 3),
            kind=models.TransactionKind.TRANSFER,
            amount=Decimal("100.00"),
            destination_amount=Decimal("2.50"),
            description="Ahorro",
            account_id=account.id,
            destination_account_id=destination.id,
            purpose=models.TransferPurpose.SAVINGS,
        )
    )
    db.commit()
    response = client.get(f"/api/v1/settings/accounts/{account.id}/export.csv")
    assert response.status_code == 200
    upload = client.post(
        "/api/v1/imports", files={"file": ("portable.csv", response.content, "text/csv")}
    ).json()
    mapping = {
        "date": "date",
        "description": "description",
        "amount": "amount",
        "kind": "kind",
        "currency": "currency",
        "category": "category",
        "destination_account": "destination_account",
        "destination_currency": "destination_currency",
        "destination_amount": "destination_amount",
        "purpose": "purpose",
        "status": "status",
        "notes": "notes",
    }
    preview = client.post(
        f"/api/v1/imports/{upload['id']}/preview",
        json={"account_id": target.id, "mapping": mapping},
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["rows"][0]["kind"] == "transfer"
    assert client.post(f"/api/v1/imports/{upload['id']}/confirm").status_code == 200
