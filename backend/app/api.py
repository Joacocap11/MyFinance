from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.config import get_settings
from app.db import get_db
from app.seed import seed as seed_data
from app.services import autocategorization, domain, imports, reports

Db = Annotated[Session, Depends(get_db)]
router = APIRouter(prefix="/api/v1", dependencies=[Depends(auth.current_user)])
public_router = APIRouter(prefix="/api/v1")


class AuthCredentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str
    password: str


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    refresh_token: str


def _validate_password(password: str) -> None:
    if error := auth.password_policy_error(password):
        raise domain.DomainError(error, 422)


def _user_count_with_registration_lock(db: Session) -> int:
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(184467440737095516)"))
    return db.scalar(select(func.count()).select_from(models.User)) or 0


def _ensure_user_slot(db: Session) -> int:
    current_users = _user_count_with_registration_lock(db)
    if current_users >= get_settings().max_users:
        raise HTTPException(status_code=409, detail="Se alcanzó el límite máximo de cuentas.")
    return current_users


@public_router.get("/auth/registration-status")
def registration_status(db: Db) -> dict[str, int | bool]:
    current_users = db.scalar(select(func.count()).select_from(models.User)) or 0
    max_users = get_settings().max_users
    remaining_slots = max(max_users - current_users, 0)
    return {
        "enabled": current_users < max_users,
        "current_users": current_users,
        "max_users": max_users,
        "remaining_slots": remaining_slots,
    }


@public_router.post("/auth/register", status_code=201)
def register(data: AuthCredentials, db: Db) -> dict[str, object]:
    email = data.email.strip().lower()
    if "@" not in email:
        raise domain.DomainError("Email y contraseña son obligatorios", 422)
    _validate_password(data.password)
    current_users = _ensure_user_slot(db)
    user = models.User(
        email=email,
        password_hash=auth.hash_password(data.password),
        is_admin=current_users == 0,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    seed_data(db, user.id, create_account=False)
    return {
        "user": {"id": user.id, "email": user.email, "is_admin": user.is_admin},
        **auth.issue_tokens(user),
    }


@public_router.post("/auth/login")
def login(data: AuthCredentials, db: Db) -> dict[str, object]:
    user = db.scalar(select(models.User).where(models.User.email == data.email.strip().lower()))
    if (
        user is None
        or not user.is_active
        or not auth.verify_password(data.password, user.password_hash)
    ):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    return {
        "user": {"id": user.id, "email": user.email, "is_admin": user.is_admin},
        **auth.issue_tokens(user),
    }


@public_router.post("/auth/refresh")
def refresh(data: RefreshRequest, db: Db) -> dict[str, object]:
    payload = auth._decode(data.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Refresh token requerido")
    user = db.get(models.User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario no disponible")
    return auth.issue_tokens(user)


@public_router.get("/auth/me")
def me(user: auth.CurrentUser) -> dict[str, object]:
    return {"id": user.id, "email": user.email, "is_admin": user.is_admin}


@router.post("/auth/change-password")
def change_password(data: schemas.PasswordChange, db: Db, user: auth.CurrentUser) -> dict[str, str]:
    if not auth.verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="La contraseña actual es incorrecta")
    _validate_password(data.new_password)
    user.password_hash = auth.hash_password(data.new_password)
    db.commit()
    return {"detail": "Contraseña actualizada. Iniciá sesión nuevamente."}


@router.get(
    "/admin/users", response_model=list[schemas.UserOut], dependencies=[Depends(auth.require_admin)]
)
def list_users(db: Db) -> list[models.User]:
    return list(db.scalars(select(models.User).order_by(models.User.id)))


@router.post(
    "/admin/users",
    response_model=schemas.UserOut,
    status_code=201,
    dependencies=[Depends(auth.require_admin)],
)
def create_user(data: schemas.UserCreate, db: Db) -> models.User:
    email = data.email.strip().lower()
    if "@" not in email:
        raise domain.DomainError("Email inválido", 422)
    if db.scalar(select(models.User).where(models.User.email == email)):
        raise domain.DomainError("El email ya está registrado", 409)
    _validate_password(data.password)
    _ensure_user_slot(db)
    user = models.User(
        email=email, password_hash=auth.hash_password(data.password), is_admin=data.is_admin
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    seed_data(db, user.id, create_account=False)
    return user


@router.patch(
    "/admin/users/{user_id}",
    response_model=schemas.UserOut,
    dependencies=[Depends(auth.require_admin)],
)
def patch_user(
    user_id: int, data: schemas.UserPatch, db: Db, admin: auth.CurrentUser
) -> models.User:
    user = db.get(models.User, user_id)
    if user is None:
        raise domain.DomainError("Usuario no encontrado", 404)
    values = data.model_dump(exclude_unset=True)
    if user.id == admin.id and values.get("is_active") is False:
        raise domain.DomainError("No podés desactivar tu propio usuario", 409)
    if user.id == admin.id and values.get("is_admin") is False:
        raise domain.DomainError("No podés quitarte permisos de administrador", 409)
    if values.get("is_admin") is False and user.is_admin:
        admins = (
            db.scalar(
                select(func.count())
                .select_from(models.User)
                .where(models.User.is_admin.is_(True), models.User.is_active.is_(True))
            )
            or 0
        )
        if admins <= 1:
            raise domain.DomainError("Debe existir al menos un administrador activo", 409)
    for key, value in values.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


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
    query = select(models.Transaction).where(domain.owner_clause(db, models.Transaction))
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


@router.get("/settings/categorization/preview", response_model=schemas.CategorizationPreview)
def categorization_preview(db: Db) -> schemas.CategorizationPreview:
    pending = (
        db.scalar(
            select(func.count())
            .select_from(models.Transaction)
            .where(
                models.Transaction.category_id.is_(None),
                domain.owner_clause(db, models.Transaction),
            )
        )
        or 0
    )
    items = autocategorization.suggestions(db)
    suggestions = []
    for item in items:
        category = db.scalar(
            select(models.Category).where(
                models.Category.id == item.category_id, domain.owner_clause(db, models.Category)
            )
        )
        if category is None:
            continue
        suggestions.append(
            schemas.CategorizationSuggestion(
                transaction_id=item.transaction.id,
                description=item.transaction.description,
                category_id=item.category_id,
                category_name=category.name,
                confidence=item.confidence,
            )
        )
    return schemas.CategorizationPreview(
        pending=pending, high_confidence=len(suggestions), suggestions=suggestions
    )


@router.post("/settings/categorization/apply", response_model=schemas.CategorizationPreview)
def categorization_apply(db: Db) -> schemas.CategorizationPreview:
    autocategorization.apply_high_confidence(db)
    return categorization_preview(db)


@router.get("/reports/history", response_model=schemas.HistoryReport)
def history_report(
    currency: models.Currency, db: Db, months: int = Query(12, ge=1, le=60)
) -> schemas.HistoryReport:
    return reports.history_report(db, months, currency)


@router.get("/settings/accounts", response_model=list[schemas.AccountOut])
def list_accounts(db: Db) -> list[schemas.AccountOut]:
    accounts = db.scalars(
        select(models.Account)
        .where(domain.owner_clause(db, models.Account))
        .order_by(models.Account.name)
    ).all()
    return [domain.account_out(db, account) for account in accounts]


@router.get("/settings/accounts/{account_id}", response_model=schemas.AccountOut)
def get_account(account_id: int, db: Db) -> schemas.AccountOut:
    return domain.account_out(db, domain.get_or_404(db, models.Account, account_id))


@router.post("/settings/accounts", response_model=schemas.AccountOut, status_code=201)
def create_account(data: schemas.AccountCreate, db: Db) -> schemas.AccountOut:
    account = models.Account(owner_id=domain.current_owner_id(db), **data.model_dump())
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


@router.post("/settings/accounts/{account_id}/reconcile", response_model=schemas.ReconciliationOut)
def reconcile_account(
    account_id: int, data: schemas.BalanceAdjustmentCreate, db: Db
) -> schemas.ReconciliationOut:
    account = domain.get_or_404(db, models.Account, account_id)
    calculated = domain.account_balance(db, account)
    adjustment = data.actual_balance - calculated
    item: models.BalanceAdjustment | None = None
    if adjustment != 0:
        item = models.BalanceAdjustment(
            owner_id=account.owner_id,
            account_id=account.id,
            date=data.date,
            amount=adjustment,
            note=data.note,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
    return schemas.ReconciliationOut(
        account=domain.account_out(db, account),
        calculated_balance=calculated,
        actual_balance=data.actual_balance,
        adjustment=schemas.BalanceAdjustmentOut.model_validate(item) if item else None,
        already_reconciled=adjustment == 0,
    )


@router.delete("/settings/accounts/{account_id}", status_code=204)
def delete_account(account_id: int, db: Db) -> None:
    account = domain.get_or_404(db, models.Account, account_id)
    has_transactions = db.scalar(
        select(models.Transaction.id)
        .where(
            domain.owner_clause(db, models.Transaction),
            or_(
                models.Transaction.account_id == account_id,
                models.Transaction.destination_account_id == account_id,
            ),
        )
        .limit(1)
    )
    has_recurring = db.scalar(
        select(models.RecurringExpense.id)
        .where(
            domain.owner_clause(db, models.RecurringExpense),
            models.RecurringExpense.account_id == account_id,
        )
        .limit(1)
    )
    has_imports = db.scalar(
        select(models.ImportBatch.id)
        .where(
            domain.owner_clause(db, models.ImportBatch), models.ImportBatch.account_id == account_id
        )
        .limit(1)
    )
    has_adjustments = db.scalar(
        select(models.BalanceAdjustment.id)
        .where(
            domain.owner_clause(db, models.BalanceAdjustment),
            models.BalanceAdjustment.account_id == account_id,
        )
        .limit(1)
    )
    if has_transactions or has_recurring or has_imports or has_adjustments:
        raise domain.DomainError(
            "No se puede eliminar una cuenta con movimientos o configuraciones "
            "asociadas. Podés archivarla para conservar el historial.",
            409,
        )
    db.delete(account)
    db.commit()


@router.get("/settings/categories", response_model=list[schemas.CategoryOut])
def list_categories(db: Db, kind: models.TransactionKind | None = None) -> list[models.Category]:
    query = select(models.Category).where(domain.owner_clause(db, models.Category))
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
    category = models.Category(owner_id=domain.current_owner_id(db), **data.model_dump())
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
    return list(
        db.scalars(
            select(models.RecurringExpense)
            .where(domain.owner_clause(db, models.RecurringExpense))
            .order_by(models.RecurringExpense.id)
        )
    )


@router.get("/settings/recurring-expenses/{item_id}", response_model=schemas.RecurringOut)
def get_recurring(item_id: int, db: Db) -> models.RecurringExpense:
    return domain.get_or_404(db, models.RecurringExpense, item_id)


def validate_recurring(db: Session, account_id: int, category_id: int | None) -> None:
    account = db.scalar(
        select(models.Account).where(
            models.Account.id == account_id, domain.owner_clause(db, models.Account)
        )
    )
    if account is None or not account.is_active:
        raise domain.DomainError("La cuenta no existe o está inactiva")
    domain.validate_category(db, category_id, models.TransactionKind.EXPENSE)


@router.post("/settings/recurring-expenses", response_model=schemas.RecurringOut, status_code=201)
def create_recurring(data: schemas.RecurringCreate, db: Db) -> models.RecurringExpense:
    validate_recurring(db, data.account_id, data.category_id)
    item = models.RecurringExpense(owner_id=domain.current_owner_id(db), **data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/settings/recurring-expenses/{item_id}", response_model=schemas.RecurringOut)
def patch_recurring(item_id: int, data: schemas.RecurringPatch, db: Db) -> models.RecurringExpense:
    item = domain.get_or_404(db, models.RecurringExpense, item_id)
    values = data.model_dump(exclude_unset=True)
    validate_recurring(
        db, values.get("account_id", item.account_id), values.get("category_id", item.category_id)
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
            select(models.CategorizationRule)
            .where(domain.owner_clause(db, models.CategorizationRule))
            .order_by(models.CategorizationRule.priority, models.CategorizationRule.id)
        )
    )


@router.get("/settings/rules/{rule_id}", response_model=schemas.RuleOut)
def get_rule(rule_id: int, db: Db) -> models.CategorizationRule:
    return domain.get_or_404(db, models.CategorizationRule, rule_id)


def validate_rule_category(db: Session, category_id: int) -> None:
    category = domain.validate_category(
        db, category_id, models.TransactionKind.EXPENSE, active=False
    )
    if (
        category is None
        or not category.is_active
        or category.kind not in {models.TransactionKind.INCOME, models.TransactionKind.EXPENSE}
    ):
        raise domain.DomainError("La categoría de la regla no es válida")


@router.post("/settings/rules", response_model=schemas.RuleOut, status_code=201)
def create_rule(data: schemas.RuleCreate, db: Db) -> models.CategorizationRule:
    category = db.scalar(
        select(models.Category).where(
            models.Category.id == data.category_id, domain.owner_clause(db, models.Category)
        )
    )
    if (
        category is None
        or not category.is_active
        or category.kind not in {models.TransactionKind.INCOME, models.TransactionKind.EXPENSE}
    ):
        raise domain.DomainError("La categoría de la regla no es válida")
    rule = models.CategorizationRule(
        owner_id=domain.current_owner_id(db),
        **data.model_dump(),
        normalized_needle=domain.normalize_text(data.needle),
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
        category = db.scalar(
            select(models.Category).where(
                models.Category.id == values["category_id"],
                domain.owner_clause(db, models.Category),
            )
        )
        if (
            category is None
            or not category.is_active
            or category.kind not in {models.TransactionKind.INCOME, models.TransactionKind.EXPENSE}
        ):
            raise domain.DomainError("La categoría de la regla no es válida")
    for key, value in values.items():
        setattr(rule, key, value)
    if "needle" in values:
        rule.normalized_needle = domain.normalize_text(values["needle"])
    db.commit()
    db.refresh(rule)
    return rule


@router.get("/settings/monthly-budget", response_model=schemas.BudgetOut)
def get_budget(currency: models.Currency, db: Db) -> schemas.BudgetOut:
    budget = db.scalar(
        select(models.MonthlyBudget).where(
            models.MonthlyBudget.owner_id == domain.current_owner_id(db),
            models.MonthlyBudget.currency == currency,
        )
    )
    return schemas.BudgetOut(currency=currency, amount=budget.amount if budget else None)


@router.put("/settings/monthly-budget", response_model=schemas.BudgetOut)
def put_budget(currency: models.Currency, data: schemas.BudgetPut, db: Db) -> schemas.BudgetOut:
    budget = db.scalar(
        select(models.MonthlyBudget).where(
            models.MonthlyBudget.owner_id == domain.current_owner_id(db),
            models.MonthlyBudget.currency == currency,
        )
    )
    if data.amount is None:
        if budget:
            db.delete(budget)
            db.commit()
        return schemas.BudgetOut(currency=currency, amount=None)
    if budget:
        budget.amount = data.amount
    else:
        budget = models.MonthlyBudget(
            owner_id=domain.current_owner_id(db), currency=currency, amount=data.amount
        )
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
    row = db.scalar(
        select(models.ImportRow).where(
            models.ImportRow.id == row_id, models.ImportRow.batch_id == batch.id
        )
    )
    if row is None:
        raise domain.DomainError("Fila de importación no encontrada", 404)
    return imports.patch_import_row(db, batch, row, data)


@router.post("/imports/{batch_id}/confirm", response_model=schemas.ImportConfirmOut)
def confirm_import(batch_id: str, db: Db) -> schemas.ImportConfirmOut:
    return imports.confirm_import(db, batch_id)


def apply_patch(target: object, patch: BaseModel) -> None:
    for key, value in patch.model_dump(exclude_unset=True).items():
        setattr(target, key, value)


def category_descendants(db: Session, category_id: int) -> list[int]:
    if (
        db.scalar(
            select(models.Category.id).where(
                models.Category.id == category_id, domain.owner_clause(db, models.Category)
            )
        )
        is None
    ):
        raise domain.DomainError("La categoría no existe", 404)
    ids = [category_id]
    cursor = 0
    while cursor < len(ids):
        children = db.scalars(
            select(models.Category.id).where(
                models.Category.parent_id == ids[cursor], domain.owner_clause(db, models.Category)
            )
        ).all()
        ids.extend(child for child in children if child not in ids)
        cursor += 1
    return ids
