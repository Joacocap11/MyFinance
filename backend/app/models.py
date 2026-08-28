from __future__ import annotations

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

MONEY_MAX = Decimal("99999999999.99")


class Currency(enum.StrEnum):
    UYU = "UYU"
    USD = "USD"
    UI = "UI"

class TransactionKind(enum.StrEnum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"


class TransferPurpose(enum.StrEnum):
    REGULAR = "regular"
    SAVINGS = "savings"
    INVESTMENT = "investment"


class ImportState(enum.StrEnum):
    UPLOADED = "uploaded"
    PREVIEWED = "previewed"
    CONFIRMED = "confirmed"


class ImportDisposition(enum.StrEnum):
    IMPORT = "import"
    SKIP = "skip"
    POSSIBLE_DUPLICATE = "possible_duplicate"


def enum_values(enum_class: type[enum.Enum]) -> list[str]:
    return [str(item.value) for item in enum_class]



class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Account(TimestampMixin, Base):
    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint(
            "opening_balance >= -99999999999.99 AND opening_balance <= 99999999999.99",
            name="ck_accounts_opening_balance",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    currency: Mapped[Currency] = mapped_column(
        Enum(Currency, native_enum=False, length=3, values_callable=enum_values)
    )
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class BalanceAdjustment(TimestampMixin, Base):
    __tablename__ = "balance_adjustments"
    __table_args__ = (
        CheckConstraint(
            "amount >= -99999999999.99 AND amount <= 99999999999.99",
            name="ck_balance_adjustments_amount",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    note: Mapped[str] = mapped_column(String(240))

    account: Mapped[Account] = relationship()


class Category(TimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint("kind IN ('income', 'expense')", name="ck_categories_kind"),
        UniqueConstraint("kind", "name", "parent_id", name="uq_category_scope"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[TransactionKind] = mapped_column(
        Enum(TransactionKind, native_enum=False, length=8, values_callable=enum_values)
    )
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    parent: Mapped[Category | None] = relationship(remote_side="Category.id")


class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount > 0 AND amount <= 99999999999.99", name="ck_transactions_amount"),
        CheckConstraint(
            "(kind = 'transfer' AND destination_account_id IS NOT NULL "
            "AND category_id IS NULL) "
            "OR (kind IN ('income', 'expense') AND destination_account_id IS NULL "
            "AND destination_amount IS NULL)",
            name="ck_transactions_shape",
        ),
        CheckConstraint(
            "destination_account_id IS NULL OR account_id <> destination_account_id",
            name="ck_transactions_distinct_accounts",
        ),
        Index("ix_transactions_date_kind", "date", "kind"),
        Index("ix_transactions_semantic_fingerprint", "semantic_fingerprint"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    kind: Mapped[TransactionKind] = mapped_column(
        Enum(TransactionKind, native_enum=False, length=8, values_callable=enum_values)
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    description: Mapped[str] = mapped_column(String(240))
    destination_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    purpose: Mapped[TransferPurpose | None] = mapped_column(
        Enum(TransferPurpose, native_enum=False, length=10, values_callable=enum_values)
    )
    notes: Mapped[str | None] = mapped_column(Text)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    destination_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    category_source: Mapped[str | None] = mapped_column(String(20))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), index=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    origin_key: Mapped[str | None] = mapped_column(String(80), unique=True)
    semantic_fingerprint: Mapped[str | None] = mapped_column(String(80))

    account: Mapped[Account] = relationship(foreign_keys=[account_id])
    destination_account: Mapped[Account | None] = relationship(
        foreign_keys=[destination_account_id]
    )
    category: Mapped[Category | None] = relationship()

    @property
    def is_voided(self) -> bool:
        return self.voided_at is not None


class RecurringExpense(TimestampMixin, Base):
    __tablename__ = "recurring_expenses"
    __table_args__ = (
        CheckConstraint("amount > 0 AND amount <= 99999999999.99", name="ck_recurring_amount"),
        CheckConstraint("day_of_month BETWEEN 1 AND 31", name="ck_recurring_day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    description: Mapped[str] = mapped_column(String(240))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    day_of_month: Mapped[int] = mapped_column(Integer)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class CategorizationRule(TimestampMixin, Base):
    __tablename__ = "categorization_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    needle: Mapped[str] = mapped_column(String(160))
    normalized_needle: Mapped[str] = mapped_column(String(160), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    priority: Mapped[int] = mapped_column(Integer, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class MonthlyBudget(TimestampMixin, Base):
    __tablename__ = "monthly_budgets"
    __table_args__ = (
        CheckConstraint("amount > 0 AND amount <= 99999999999.99", name="ck_budget_amount"),
    )

    currency: Mapped[Currency] = mapped_column(
        Enum(Currency, native_enum=False, length=3, values_callable=enum_values), primary_key=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))


class ImportBatch(TimestampMixin, Base):
    __tablename__ = "import_batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    state: Mapped[ImportState] = mapped_column(
        Enum(ImportState, native_enum=False, length=10, values_callable=enum_values),
        default=ImportState.UPLOADED,
    )
    content: Mapped[str] = mapped_column(Text)
    headers: Mapped[list[str]] = mapped_column(JSON)
    sample_rows: Mapped[list[dict[str, str]]] = mapped_column(JSON)
    mapping: Mapped[dict[str, str | None] | None] = mapped_column(JSON)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    rows: Mapped[list[ImportRow]] = relationship(
        back_populates="batch", cascade="all, delete-orphan", order_by="ImportRow.row_number"
    )


class ImportRow(TimestampMixin, Base):
    __tablename__ = "import_rows"
    __table_args__ = (UniqueConstraint("batch_id", "row_number", name="uq_import_row_number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("import_batches.id", ondelete="CASCADE"))
    row_number: Mapped[int] = mapped_column(Integer)
    raw: Mapped[dict[str, str]] = mapped_column(JSON)
    date: Mapped[date | None] = mapped_column(Date)
    description: Mapped[str] = mapped_column(String(240))
    amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    kind: Mapped[TransactionKind | None] = mapped_column(
        Enum(TransactionKind, native_enum=False, length=8, values_callable=enum_values)
    )
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    disposition: Mapped[ImportDisposition] = mapped_column(
        Enum(ImportDisposition, native_enum=False, length=18, values_callable=enum_values)
    )
    possible_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[str | None] = mapped_column(String(500))
    origin_key: Mapped[str] = mapped_column(String(80))
    semantic_fingerprint: Mapped[str | None] = mapped_column(String(80))
    transaction_id: Mapped[int | None] = mapped_column(ForeignKey("transactions.id"))
    batch: Mapped[ImportBatch] = relationship(back_populates="rows")
