from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models


def add(
    db: Session,
    account_id: int,
    description: str,
    category_id: int | None,
    kind: models.TransactionKind,
    destination_account_id: int | None = None,
) -> None:
    db.add(
        models.Transaction(
            date=date(2026, 8, 1),
            kind=kind,
            amount="10.00",
            description=description,
            account_id=account_id,
            destination_account_id=destination_account_id,
            category_id=category_id,
        )
    )
    db.commit()
def test_exact_normalized_match_is_suggested_and_applied(
    client: TestClient, db: Session, account: models.Account, categories: dict[str, models.Category]
) -> None:
    add(db, account.id, "Pedidos Ya", categories["food"].id, models.TransactionKind.EXPENSE)
    add(db, account.id, "  PEDIDOS   YA ", None, models.TransactionKind.EXPENSE)

    preview = client.get("/api/v1/settings/categorization/preview").json()
    assert preview["high_confidence"] == 1
    assert preview["suggestions"][0]["category_id"] == categories["food"].id
    client.post("/api/v1/settings/categorization/apply")
    pending = db.query(models.Transaction).filter(models.Transaction.category_id.is_(None)).count()
    assert pending == 0


def test_conflicting_examples_are_not_suggested(
    client: TestClient, db: Session, account: models.Account, categories: dict[str, models.Category]
) -> None:
    add(db, account.id, "Ambiguo", categories["food"].id, models.TransactionKind.EXPENSE)
    add(db, account.id, "Ambiguo", categories["auto"].id, models.TransactionKind.EXPENSE)
    add(db, account.id, "Ambiguo", None, models.TransactionKind.EXPENSE)

    preview = client.get("/api/v1/settings/categorization/preview").json()
    assert preview["high_confidence"] == 0


def test_transfer_is_never_autocategorized(
    client: TestClient, db: Session, account: models.Account, categories: dict[str, models.Category]
) -> None:
    add(db, account.id, "Transferencia", categories["food"].id, models.TransactionKind.EXPENSE)
    destination = models.Account(name="Destino", currency=models.Currency.UYU)
    db.add(destination)
    db.commit()
    add(
        db,
        account.id,
        "Transferencia",
        None,
        models.TransactionKind.TRANSFER,
        destination.id,
    )
    preview = client.get("/api/v1/settings/categorization/preview").json()
    assert all(
        item["description"] != "Transferencia" for item in preview["suggestions"]
    )
