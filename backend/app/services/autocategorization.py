from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.services.domain import normalize_text


@dataclass(frozen=True)
class Suggestion:
    transaction: models.Transaction
    category_id: int
    confidence: str


def suggestions(db: Session) -> list[Suggestion]:
    examples = defaultdict(set)
    for row in db.scalars(
        select(models.Transaction).where(models.Transaction.category_id.is_not(None))
    ):
        if row.category_id is not None:
            examples[(normalize_text(row.description), row.kind)].add(row.category_id)
    result = []
    for row in db.scalars(
        select(models.Transaction).where(models.Transaction.category_id.is_(None))
    ):
        if row.kind == models.TransactionKind.TRANSFER:
            continue
        categories = examples.get((normalize_text(row.description), row.kind), set())
        if len(categories) == 1:
            result.append(Suggestion(row, next(iter(categories)), "high"))
    return result


def apply_high_confidence(db: Session) -> int:
    items = suggestions(db)
    for item in items:
        item.transaction.category_id = item.category_id
        item.transaction.category_source = "historical_auto"
    db.commit()
    return len(items)
