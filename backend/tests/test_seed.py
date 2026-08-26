from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models
from app.seed import seed


def test_seed_is_idempotent_and_contains_required_spanish_categories(db: Session) -> None:
    seed(db)
    first_count = db.scalar(select(func.count()).select_from(models.Category))
    seed(db)
    second_count = db.scalar(select(func.count()).select_from(models.Category))

    assert first_count == second_count
    salary = db.scalar(
        select(models.Category).where(
            models.Category.name == "Sueldo",
            models.Category.kind == models.TransactionKind.INCOME,
        )
    )
    auto = db.scalar(
        select(models.Category).where(
            models.Category.name == "Auto",
            models.Category.kind == models.TransactionKind.EXPENSE,
        )
    )
    assert salary is not None
    assert auto is not None
    children = set(
        db.scalars(select(models.Category.name).where(models.Category.parent_id == auto.id))
    )
    assert {
        "Combustible",
        "Seguro",
        "Patente",
        "Service",
        "Reparaciones",
        "Estacionamiento",
        "Lavado",
        "Otros del auto",
    } <= children
