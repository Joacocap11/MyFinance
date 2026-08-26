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
    item = db.scalar(
        select(models.Category).where(
            models.Category.name == name,
            models.Category.kind == kind,
            models.Category.parent_id == parent_id,
        )
    )
    if item is None:
        item = models.Category(name=name, kind=kind, parent_id=parent_id, is_active=True)
        db.add(item)
        db.flush()
    return item


def seed(db: Session) -> None:
    if db.scalar(select(models.Account).where(models.Account.name == "Cuenta principal")) is None:
        db.add(
            models.Account(
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
