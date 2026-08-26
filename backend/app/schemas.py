from __future__ import annotations

from datetime import date as Date
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from app.models import (
    Currency,
    ImportDisposition,
    ImportState,
    TransactionKind,
    TransferPurpose,
)

Money = Annotated[Decimal, Field(gt=0, max_digits=13, decimal_places=2)]
SignedMoney = Annotated[
    Decimal,
    Field(
        ge=Decimal("-99999999999.99"),
        le=Decimal("99999999999.99"),
        decimal_places=2,
    ),
]


def valid_month(value: str) -> str:
    if value.startswith("0000"):
        raise ValueError("El año debe ser mayor que cero")
    return value


Month = Annotated[
    str,
    StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    AfterValidator(valid_month),
]

Needle = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=160),
]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    currency: Currency
    opening_balance: SignedMoney = Decimal("0")


class AccountPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=100)
    is_active: bool | None = None


class BalanceAdjustmentCreate(BaseModel):
    actual_balance: SignedMoney
    date: Date = Field(default_factory=Date.today)
    note: str = Field(
        default="Conciliación con saldo bancario", min_length=1, max_length=240
    )


class BalanceAdjustmentOut(ORMModel):
    id: int
    account_id: int
    date: Date
    amount: Decimal
    note: str
    created_at: datetime

class AccountOut(ORMModel):
    id: int
    name: str
    currency: Currency
    opening_balance: Decimal
    current_balance: Decimal
    is_active: bool
    adjustments: list[BalanceAdjustmentOut] = Field(default_factory=list)

class ReconciliationOut(BaseModel):
    account: AccountOut
    calculated_balance: Decimal
    actual_balance: Decimal
    adjustment: BalanceAdjustmentOut | None
    already_reconciled: bool


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: Literal[TransactionKind.INCOME, TransactionKind.EXPENSE]
    parent_id: int | None = None


class CategoryPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    parent_id: int | None = None
    is_active: bool | None = None


class CategoryOut(ORMModel):
    id: int
    name: str
    kind: TransactionKind
    parent_id: int | None
    is_active: bool
class TransactionBase(BaseModel):
    date: Date
    kind: TransactionKind
    amount: Money
    destination_amount: Money | None = None
    purpose: TransferPurpose | None = None
    description: str = Field(min_length=1, max_length=240)
    notes: str | None = None
    account_id: int
    destination_account_id: int | None = None
    category_id: int | None = None

    @model_validator(mode="after")
    def valid_shape(self) -> TransactionBase:
        if self.kind == TransactionKind.TRANSFER:
            if self.destination_account_id is None or self.category_id is not None:
                raise ValueError("Una transferencia requiere cuenta destino")
        elif self.destination_account_id is not None or self.destination_amount is not None:
            raise ValueError("Solo las transferencias admiten cuenta destino y monto recibido")
        return self


class TransactionCreate(TransactionBase):
    pass


class TransactionPatch(BaseModel):
    date: Date | None = None
    kind: TransactionKind | None = None
    amount: Money | None = None
    destination_amount: Money | None = None
    purpose: TransferPurpose | None = None
    description: str | None = Field(None, min_length=1, max_length=240)
    notes: str | None = None
    account_id: int | None = None
    destination_account_id: int | None = None
    category_id: int | None = None


class TransactionOut(ORMModel):
    id: int
    date: Date
    kind: TransactionKind
    amount: Decimal
    destination_amount: Decimal | None
    purpose: TransferPurpose | None
    description: str
    notes: str | None
    account_id: int
    category_source: str | None
    destination_account_id: int | None
    category_id: int | None
    is_voided: bool
    created_at: datetime


class TransactionList(BaseModel):
    items: list[TransactionOut]
    total: int
    page: int
    page_size: int


class CategorizationSuggestion(BaseModel):
    transaction_id: int
    description: str
    category_id: int
    category_name: str
    confidence: str


class CategorizationPreview(BaseModel):
    pending: int
    high_confidence: int
    suggestions: list[CategorizationSuggestion]


class RecurringCreate(BaseModel):
    description: str = Field(min_length=1, max_length=240)
    amount: Money
    day_of_month: int = Field(ge=1, le=31)
    account_id: int
    category_id: int | None = None


class RecurringPatch(BaseModel):
    description: str | None = Field(None, min_length=1, max_length=240)
    amount: Money | None = None
    day_of_month: int | None = Field(None, ge=1, le=31)
    account_id: int | None = None
    category_id: int | None = None
    is_active: bool | None = None


class RecurringOut(ORMModel):
    id: int
    description: str
    amount: Decimal
    day_of_month: int
    account_id: int
    category_id: int | None
    is_active: bool


class RuleCreate(BaseModel):
    needle: Needle
    category_id: int
    priority: int = 100


class RulePatch(BaseModel):
    needle: Needle | None = None
    category_id: int | None = None
    priority: int | None = None
    is_active: bool | None = None


class RuleOut(ORMModel):
    id: int
    needle: str
    category_id: int
    priority: int
    is_active: bool


class BudgetPut(BaseModel):
    amount: Money | None


class BudgetOut(BaseModel):
    currency: Currency
    amount: Decimal | None


class Comparison(BaseModel):
    previous_month: str
    previous_expenses: Decimal
    change_percentage: Decimal | None


class CategorySummary(BaseModel):
    category_id: int | None
    name: str
    amount: Decimal
    percentage: Decimal | None


class Insight(BaseModel):
    type: str
    title: str
    detail: str
    category_id: int | None = None
    transaction_ids: list[int] = Field(default_factory=list)


class IncomeSource(BaseModel):
    name: str
    amount: Decimal
    percentage: Decimal


class MonthlyReport(BaseModel):
    month: str
    currency: Currency
    income: Decimal
    expenses: Decimal
    net: Decimal
    savings: Decimal
    spent_percentage: Decimal | None
    comparison: Comparison
    budget: Decimal | None
    categories: list[CategorySummary]
    income_sources: list[IncomeSource]
    top_expenses: list[TransactionOut]
    recent_transactions: list[TransactionOut]
    insights: list[Insight]


class HistoryMonth(BaseModel):
    month: str
    income: Decimal
    expenses: Decimal
    net: Decimal


class HistoryReport(BaseModel):
    currency: Currency
    months: list[HistoryMonth]


class ImportUploadOut(ORMModel):
    id: str
    filename: str
    state: ImportState
    headers: list[str]
    sample_rows: list[dict[str, str]]


class ImportMapping(BaseModel):
    date: str
    description: str
    amount: str | None = None
    debit: str | None = None
    credit: str | None = None
    kind: str | None = None

    @model_validator(mode="after")
    def has_amount_source(self) -> ImportMapping:
        if self.amount and (self.debit or self.credit):
            raise ValueError("El mapeo debe usar amount o debit/credit, no ambos")
        if not self.amount and not (self.debit or self.credit):
            raise ValueError("El mapeo requiere amount o debit/credit")
        return self


class ImportPreviewRequest(BaseModel):
    account_id: int
    mapping: ImportMapping


class ImportRowOut(ORMModel):
    id: int
    row_number: int
    date: Date | None
    description: str
    amount: Decimal | None
    kind: TransactionKind | None
    category_id: int | None
    disposition: ImportDisposition
    possible_duplicate: bool
    error: str | None
    transaction_id: int | None


class ImportBatchOut(ImportUploadOut):
    account_id: int | None
    mapping: dict[str, str | None] | None
    rows: list[ImportRowOut]


class ImportRowPatch(BaseModel):
    category_id: int | None = None
    disposition: ImportDisposition | None = None


class ImportConfirmOut(BaseModel):
    id: str
    state: ImportState
    imported_count: int
    skipped_count: int
    transaction_ids: list[int]
