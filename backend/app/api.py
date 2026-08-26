from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import get_settings
from app.db import get_db
from app.services import domain, imports, reports

Db = Annotated[Session, Depends(get_db)]
router = APIRouter(prefix="/api/v1")


@router.get("/transactions", response_model=schemas.TransactionList)
def list_transactions(
    db: Db,
    date_from: date | None = None,
    date_to: date | None = None,
    month: schemas.Month | None = None,
    currency: models.Currency | None = None,
    kind: models.TransactionKind | None = None,
    category_id: int | None = None,
    account_id: int | None = None,
    min_amount: Decimal | None = Query(None, gt=0),
    max_amount: Decimal | None = Query(None, gt=0),
    search: str | None = None,
    include_voided: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> schemas.TransactionList:
    query = select(models.Transaction)
    if month:
        date_from, date_to = reports.month_bounds(month)
    if currency:
        query = query.where(models.Transaction.account.has(models.Account.currency == currency))
    if date_from:
        query = query.where(models.Transaction.date >= date_from)
    if date_to:
        query = query.where(models.Transaction.date <= date_to)
    if kind:
        query = query.where(models.Transaction.kind == kind)
    if category_id is not None:
        ids = category_descendants(db, category_id)
        query = query.where(models.Transaction.category_id.in_(ids))
    if account_id is not None:
        query = query.where(
            or_(
                models.Transaction.account_id == account_id,
                models.Transaction.destination_account_id == account_id,
            )
        )
    if min_amount is not None:
        query = query.where(models.Transaction.amount >= min_amount)
    if max_amount is not None:
        query = query.where(models.Transaction.amount <= max_amount)
    if search:
        query = query.where(
            or_(
                models.Transaction.description.ilike(f"%{search}%"),
                models.Transaction.notes.ilike(f"%{search}%"),
            )
        )
    if not include_voided:
        query = query.where(models.Transaction.voided_at.is_(None))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = list(
        db.scalars(
            query.order_by(models.Transaction.date.desc(), models.Transaction.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return schemas.TransactionList(
        items=[schemas.TransactionOut.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/transactions", response_model=schemas.TransactionOut, status_code=201)
def post_transaction(data: schemas.TransactionCreate, db: Db) -> models.Transaction:
    return domain.create_transaction(db, data)


@router.get("/transactions/{transaction_id}", response_model=schemas.TransactionOut)
def get_transaction(transaction_id: int, db: Db) -> models.Transaction:
    return domain.get_or_404(db, models.Transaction, transaction_id)


@router.patch("/transactions/{transaction_id}", response_model=schemas.TransactionOut)
def update_transaction(
    transaction_id: int, data: schemas.TransactionPatch, db: Db
) -> models.Transaction:
    transaction = domain.get_or_404(db, models.Transaction, transaction_id)
    return domain.patch_transaction(db, transaction, data)


@router.post("/transactions/{transaction_id}/void", response_model=schemas.TransactionOut)
def void_transaction(transaction_id: int, db: Db) -> models.Transaction:
    transaction = domain.get_or_404(db, models.Transaction, transaction_id)
    return domain.void_transaction(db, transaction)


@router.get("/reports/monthly", response_model=schemas.MonthlyReport)
def monthly_report(
    month: schemas.Month, currency: models.Currency, db: Db
) -> schemas.MonthlyReport:
    return reports.monthly_report(db, month, currency)


@router.get("/reports/history", response_model=schemas.HistoryReport)
def history_report(
    currency: models.Currency, db: Db, months: int = Query(12, ge=1, le=60)
) -> schemas.HistoryReport:
    return reports.history_report(db, months, currency)


@router.get("/settings/accounts", response_model=list[schemas.AccountOut])
def list_accounts(db: Db) -> list[schemas.AccountOut]:
    accounts = db.scalars(select(models.Account).order_by(models.Account.name)).all()
    return [domain.account_out(db, account) for account in accounts]


@router.get("/settings/accounts/{account_id}", response_model=schemas.AccountOut)
def get_account(account_id: int, db: Db) -> schemas.AccountOut:
    return domain.account_out(db, domain.get_or_404(db, models.Account, account_id))


@router.post("/settings/accounts", response_model=schemas.AccountOut, status_code=201)
def create_account(data: schemas.AccountCreate, db: Db) -> schemas.AccountOut:
    account = models.Account(**data.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return domain.account_out(db, account)


@router.patch("/settings/accounts/{account_id}", response_model=schemas.AccountOut)
def patch_account(account_id: int, data: schemas.AccountPatch, db: Db) -> schemas.AccountOut:
    account = domain.get_or_404(db, models.Account, account_id)
    apply_patch(account, data)
    db.commit()
    db.refresh(account)
    return domain.account_out(db, account)


@router.get("/settings/categories", response_model=list[schemas.CategoryOut])
def list_categories(db: Db, kind: models.TransactionKind | None = None) -> list[models.Category]:
    query = select(models.Category)
    if kind:
        if kind == models.TransactionKind.TRANSFER:
            return []
        query = query.where(models.Category.kind == kind)
    return list(db.scalars(query.order_by(models.Category.kind, models.Category.name)))


@router.get("/settings/categories/{category_id}", response_model=schemas.CategoryOut)
def get_category(category_id: int, db: Db) -> models.Category:
    return domain.get_or_404(db, models.Category, category_id)


@router.post("/settings/categories", response_model=schemas.CategoryOut, status_code=201)
def create_category(data: schemas.CategoryCreate, db: Db) -> models.Category:
    domain.validate_category_parent(db, data.kind, data.parent_id)
    category = models.Category(**data.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.patch("/settings/categories/{category_id}", response_model=schemas.CategoryOut)
def patch_category(category_id: int, data: schemas.CategoryPatch, db: Db) -> models.Category:
    category = domain.get_or_404(db, models.Category, category_id)
    values = data.model_dump(exclude_unset=True)
    if "parent_id" in values:
        domain.validate_category_parent(db, category.kind, values["parent_id"], category.id)
    for key, value in values.items():
        setattr(category, key, value)
    db.commit()
    db.refresh(category)
    return category


@router.get("/settings/recurring-expenses", response_model=list[schemas.RecurringOut])
def list_recurring(db: Db) -> list[models.RecurringExpense]:
    return list(db.scalars(select(models.RecurringExpense).order_by(models.RecurringExpense.id)))


@router.get("/settings/recurring-expenses/{item_id}", response_model=schemas.RecurringOut)
def get_recurring(item_id: int, db: Db) -> models.RecurringExpense:
    return domain.get_or_404(db, models.RecurringExpense, item_id)


def validate_recurring(db: Session, account_id: int, category_id: int | None) -> None:
    account = db.get(models.Account, account_id)
    if account is None or not account.is_active:
        raise domain.DomainError("La cuenta no existe o está inactiva")
    domain.validate_category(db, category_id, models.TransactionKind.EXPENSE)


@router.post("/settings/recurring-expenses", response_model=schemas.RecurringOut, status_code=201)
def create_recurring(data: schemas.RecurringCreate, db: Db) -> models.RecurringExpense:
    validate_recurring(db, data.account_id, data.category_id)
    item = models.RecurringExpense(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/settings/recurring-expenses/{item_id}", response_model=schemas.RecurringOut)
def patch_recurring(item_id: int, data: schemas.RecurringPatch, db: Db) -> models.RecurringExpense:
    item = domain.get_or_404(db, models.RecurringExpense, item_id)
    values = data.model_dump(exclude_unset=True)
    validate_recurring(
        db,
        values.get("account_id", item.account_id),
        values.get("category_id", item.category_id),
    )
    for key, value in values.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.get("/settings/rules", response_model=list[schemas.RuleOut])
def list_rules(db: Db) -> list[models.CategorizationRule]:
    return list(
        db.scalars(
            select(models.CategorizationRule).order_by(
                models.CategorizationRule.priority, models.CategorizationRule.id
            )
        )
    )


@router.get("/settings/rules/{rule_id}", response_model=schemas.RuleOut)
def get_rule(rule_id: int, db: Db) -> models.CategorizationRule:
    return domain.get_or_404(db, models.CategorizationRule, rule_id)


def validate_rule_category(db: Session, category_id: int) -> None:
    category = db.get(models.Category, category_id)
    if category is None or not category.is_active:
        raise domain.DomainError("La categoría no existe o está inactiva")
    if category.kind not in {models.TransactionKind.INCOME, models.TransactionKind.EXPENSE}:
        raise domain.DomainError("La categoría de la regla no es válida")


@router.post("/settings/rules", response_model=schemas.RuleOut, status_code=201)
def create_rule(data: schemas.RuleCreate, db: Db) -> models.CategorizationRule:
    validate_rule_category(db, data.category_id)
    rule = models.CategorizationRule(
        **data.model_dump(), normalized_needle=domain.normalize_text(data.needle)
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.patch("/settings/rules/{rule_id}", response_model=schemas.RuleOut)
def patch_rule(rule_id: int, data: schemas.RulePatch, db: Db) -> models.CategorizationRule:
    rule = domain.get_or_404(db, models.CategorizationRule, rule_id)
    values = data.model_dump(exclude_unset=True)
    if "category_id" in values:
        validate_rule_category(db, values["category_id"])
    for key, value in values.items():
        setattr(rule, key, value)
    if "needle" in values:
        rule.normalized_needle = domain.normalize_text(values["needle"])
    db.commit()
    db.refresh(rule)
    return rule


@router.get("/settings/monthly-budget", response_model=schemas.BudgetOut)
def get_budget(currency: models.Currency, db: Db) -> schemas.BudgetOut:
    budget = db.get(models.MonthlyBudget, currency)
    return schemas.BudgetOut(currency=currency, amount=budget.amount if budget else None)


@router.put("/settings/monthly-budget", response_model=schemas.BudgetOut)
def put_budget(currency: models.Currency, data: schemas.BudgetPut, db: Db) -> schemas.BudgetOut:
    budget = db.get(models.MonthlyBudget, currency)
    if data.amount is None:
        if budget:
            db.delete(budget)
            db.commit()
        return schemas.BudgetOut(currency=currency, amount=None)
    if budget:
        budget.amount = data.amount
    else:
        budget = models.MonthlyBudget(currency=currency, amount=data.amount)
        db.add(budget)
    db.commit()
    return schemas.BudgetOut(currency=currency, amount=budget.amount)


@router.post("/imports", response_model=schemas.ImportUploadOut, status_code=201)
async def upload_import(db: Db, file: Annotated[UploadFile, File()]) -> models.ImportBatch:
    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        raise domain.DomainError("Solo se admiten archivos CSV", 415)
    content = await file.read(get_settings().upload_max_bytes + 1)
    if len(content) > get_settings().upload_max_bytes:
        raise domain.DomainError("El archivo supera el límite de 2 MiB", 413)
    return imports.create_upload(db, filename, content)


@router.post("/imports/{batch_id}/preview", response_model=schemas.ImportBatchOut)
def preview_import(batch_id: str, data: schemas.ImportPreviewRequest, db: Db) -> models.ImportBatch:
    batch = domain.get_or_404(db, models.ImportBatch, batch_id)
    return imports.preview_import(db, batch, data)


@router.get("/imports/{batch_id}", response_model=schemas.ImportBatchOut)
def get_import(batch_id: str, db: Db) -> models.ImportBatch:
    return domain.get_or_404(db, models.ImportBatch, batch_id)


@router.patch("/imports/{batch_id}/rows/{row_id}", response_model=schemas.ImportRowOut)
def patch_import_row(
    batch_id: str, row_id: int, data: schemas.ImportRowPatch, db: Db
) -> models.ImportRow:
    batch = domain.get_or_404(db, models.ImportBatch, batch_id)
    row = db.get(models.ImportRow, row_id)
    if row is None or row.batch_id != batch.id:
        raise domain.DomainError("Fila de importación no encontrada", 404)
    return imports.patch_import_row(db, batch, row, data)


@router.post("/imports/{batch_id}/confirm", response_model=schemas.ImportConfirmOut)
def confirm_import(batch_id: str, db: Db) -> schemas.ImportConfirmOut:
    return imports.confirm_import(db, batch_id)


def apply_patch(target: object, patch: BaseModel) -> None:
    for key, value in patch.model_dump(exclude_unset=True).items():
        setattr(target, key, value)


def category_descendants(db: Session, category_id: int) -> list[int]:
    if db.get(models.Category, category_id) is None:
        raise domain.DomainError("La categoría no existe", 404)
    ids = [category_id]
    cursor = 0
    while cursor < len(ids):
        children = db.scalars(
            select(models.Category.id).where(models.Category.parent_id == ids[cursor])
        ).all()
        ids.extend(child for child in children if child not in ids)
        cursor += 1
    return ids
