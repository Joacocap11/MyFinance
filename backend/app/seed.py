from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import SessionLocal

EXPENSE_TREE: dict[str, tuple[str, ...]] = {
    "Comida": (),
    "Salidas": (),
    "Auto": (
        "Combustible",
        "Seguro",
        "Patente",
        "Service",
        "Reparaciones",
        "Estacionamiento",
        "Lavado",
        "Otros del auto",
    ),
    "Compras": (),
    "Suscripciones": (),
    "Transporte": (),
    "Salud": (),
    "Educación": (),
    "Tecnología": (),
    "Regalos": (),
    "Otros": (),
}
INCOME_CATEGORIES = ("Sueldo", "Otros ingresos")


def category(
    db: Session,
    name: str,
    kind: models.TransactionKind,
    parent_id: int | None = None,
) -> models.Category:
    owner_id = db.info.get("owner_id")
    if owner_id is None:
        owner_id = db.scalar(select(models.User.id).order_by(models.User.id))
    if owner_id is None:
        raise RuntimeError("No se puede ejecutar seed sin un usuario inicial")
    item = db.scalar(
        select(models.Category).where(
            models.Category.owner_id == owner_id,
            models.Category.name == name,
            models.Category.kind == kind,
            models.Category.parent_id == parent_id,
        )
    )
    if item is None:
        item = models.Category(
            owner_id=owner_id, name=name, kind=kind, parent_id=parent_id, is_active=True
        )
        db.add(item)
        db.flush()
    return item


def seed(db: Session, owner_id: int | None = None, *, create_account: bool = True) -> None:
    owner_id = owner_id or db.scalar(select(models.User.id).order_by(models.User.id))
    if owner_id is None:
        return
    db.info["owner_id"] = owner_id
    if create_account and db.scalar(
        select(models.Account).where(
            models.Account.owner_id == owner_id,
            models.Account.name == "Cuenta principal",
        )
    ) is None:
        db.add(
            models.Account(
                owner_id=owner_id,
                name="Cuenta principal",
                currency=models.Currency.UYU,
                opening_balance=0,
                is_active=True,
            )
        )
    for parent_name, children in EXPENSE_TREE.items():
        parent = category(db, parent_name, models.TransactionKind.EXPENSE)
        for child_name in children:
            category(db, child_name, models.TransactionKind.EXPENSE, parent.id)
    for name in INCOME_CATEGORIES:
        category(db, name, models.TransactionKind.INCOME)
    db.commit()


def main() -> None:
    with SessionLocal() as db:
        seed(db)
    print("Datos iniciales listos.")


if __name__ == "__main__":
    main()
