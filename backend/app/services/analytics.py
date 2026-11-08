"""Deterministic historical balance analytics.

No estimation, no AI: every figure here is derived directly from
``accounts.opening_balance``, non-voided ``transactions`` rows and
``balance_adjustments`` rows via plain SQL aggregation. Reuses
``services.domain.account_balance`` as the single source of truth for
"balance as of a given date" so results always agree with the balance
already shown elsewhere in the app (account list, reconciliation, etc.).

These functions are intentionally small and composable so a future local
assistant (no LLM money math) can call them as tools:
``balance_at_date``, ``balance_history``, ``balance_summary``.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import NamedTuple

from sqlalchemy import ColumnElement, case, func, or_, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.services import domain
from app.services.reports import ZERO, money

ONE_DAY = timedelta(days=1)


def _transaction_totals(
    db: Session, account: models.Account, date_filter: ColumnElement[bool]
) -> tuple[Decimal, Decimal, Decimal, Decimal, int]:
    """Income, expenses, transfers_in, transfers_out, transaction_count for a date filter."""

    kind = models.Transaction.kind
    income_expr = case(
        (
            (kind == models.TransactionKind.INCOME) & (models.Transaction.account_id == account.id),
            models.Transaction.amount,
        ),
        else_=ZERO,
    )
    expense_expr = case(
        (
            (kind == models.TransactionKind.EXPENSE)
            & (models.Transaction.account_id == account.id),
            models.Transaction.amount,
        ),
        else_=ZERO,
    )
    transfer_in_expr = case(
        (
            (kind == models.TransactionKind.TRANSFER)
            & (models.Transaction.destination_account_id == account.id),
            func.coalesce(models.Transaction.destination_amount, models.Transaction.amount),
        ),
        else_=ZERO,
    )
    transfer_out_expr = case(
        (
            (kind == models.TransactionKind.TRANSFER)
            & (models.Transaction.account_id == account.id),
            models.Transaction.amount,
        ),
        else_=ZERO,
    )
    row = db.execute(
        select(
            func.coalesce(func.sum(income_expr), 0),
            func.coalesce(func.sum(expense_expr), 0),
            func.coalesce(func.sum(transfer_in_expr), 0),
            func.coalesce(func.sum(transfer_out_expr), 0),
            func.count(),
        ).where(
            models.Transaction.owner_id == account.owner_id,
            models.Transaction.voided_at.is_(None),
            date_filter,
            or_(
                models.Transaction.account_id == account.id,
                models.Transaction.destination_account_id == account.id,
            ),
        )
    ).one()
    income, expenses, transfers_in, transfers_out, count = row
    return (
        Decimal(income or 0),
        Decimal(expenses or 0),
        Decimal(transfers_in or 0),
        Decimal(transfers_out or 0),
        int(count or 0),
    )


def _adjustment_total(
    db: Session, account: models.Account, date_filter: ColumnElement[bool]
) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(models.BalanceAdjustment.amount), 0)).where(
            models.BalanceAdjustment.owner_id == account.owner_id,
            models.BalanceAdjustment.account_id == account.id,
            date_filter,
        )
    )
    return Decimal(total or 0)


class DayBreakdown(NamedTuple):
    income: Decimal
    expenses: Decimal
    transfers_in: Decimal
    transfers_out: Decimal
    adjustments: Decimal
    transaction_count: int


def day_breakdown(db: Session, account: models.Account, target_date: date) -> DayBreakdown:
    income, expenses, transfers_in, transfers_out, count = _transaction_totals(
        db, account, models.Transaction.date == target_date
    )
    adjustments = _adjustment_total(db, account, models.BalanceAdjustment.date == target_date)
    return DayBreakdown(income, expenses, transfers_in, transfers_out, adjustments, count)


def balance_at_date(
    db: Session,
    account: models.Account,
    target_date: date,
    moment: schemas.BalanceMoment = "closing",
) -> schemas.BalanceAtDateOut:
    opening = domain.account_balance(db, account, as_of=target_date - ONE_DAY)
    closing = domain.account_balance(db, account, as_of=target_date)
    breakdown = day_breakdown(db, account, target_date)
    balance = closing if moment == "closing" else opening
    return schemas.BalanceAtDateOut(
        account_id=account.id,
        date=target_date,
        moment=moment,
        balance=money(balance),
        opening_balance=money(opening),
        closing_balance=money(closing),
        income=money(breakdown.income),
        expenses=money(breakdown.expenses),
        transfers_in=money(breakdown.transfers_in),
        transfers_out=money(breakdown.transfers_out),
        adjustments=money(breakdown.adjustments),
        net_change=money(closing - opening),
        transaction_count=breakdown.transaction_count,
    )


def _daily_deltas(
    db: Session, account: models.Account, date_from: date, date_to: date
) -> dict[date, Decimal]:
    kind = models.Transaction.kind
    incoming = case(
        (
            (kind == models.TransactionKind.INCOME) & (models.Transaction.account_id == account.id),
            models.Transaction.amount,
        ),
        (
            (kind == models.TransactionKind.TRANSFER)
            & (models.Transaction.destination_account_id == account.id),
            func.coalesce(models.Transaction.destination_amount, models.Transaction.amount),
        ),
        else_=ZERO,
    )
    outgoing = case(
        (
            (kind == models.TransactionKind.EXPENSE)
            & (models.Transaction.account_id == account.id),
            models.Transaction.amount,
        ),
        (
            (kind == models.TransactionKind.TRANSFER)
            & (models.Transaction.account_id == account.id),
            models.Transaction.amount,
        ),
        else_=ZERO,
    )
    deltas: dict[date, Decimal] = {}
    tx_rows = db.execute(
        select(models.Transaction.date, func.coalesce(func.sum(incoming - outgoing), 0))
        .where(
            models.Transaction.owner_id == account.owner_id,
            models.Transaction.voided_at.is_(None),
            models.Transaction.date.between(date_from, date_to),
            or_(
                models.Transaction.account_id == account.id,
                models.Transaction.destination_account_id == account.id,
            ),
        )
        .group_by(models.Transaction.date)
    ).all()
    for day, total in tx_rows:
        deltas[day] = deltas.get(day, ZERO) + Decimal(total or 0)

    adj_rows = db.execute(
        select(
            models.BalanceAdjustment.date,
            func.coalesce(func.sum(models.BalanceAdjustment.amount), 0),
        )
        .where(
            models.BalanceAdjustment.owner_id == account.owner_id,
            models.BalanceAdjustment.account_id == account.id,
            models.BalanceAdjustment.date.between(date_from, date_to),
        )
        .group_by(models.BalanceAdjustment.date)
    ).all()
    for day, total in adj_rows:
        deltas[day] = deltas.get(day, ZERO) + Decimal(total or 0)
    return deltas


def balance_history(
    db: Session, account: models.Account, date_from: date, date_to: date
) -> list[schemas.BalanceHistoryDay]:
    """Daily opening/closing series for ``[date_from, date_to]`` (inclusive).

    Uses two grouped aggregate queries (transactions, adjustments) plus the
    single starting balance, then walks the range accumulating in Python.
    No per-day query: O(1) round-trips regardless of the period length.
    """

    opening_of_range = domain.account_balance(db, account, as_of=date_from - ONE_DAY)
    deltas = _daily_deltas(db, account, date_from, date_to)

    days: list[schemas.BalanceHistoryDay] = []
    running = opening_of_range
    current = date_from
    while current <= date_to:
        opening = money(running)
        closing = money(running + deltas.get(current, ZERO))
        days.append(
            schemas.BalanceHistoryDay(
                date=current, opening_balance=opening, closing_balance=closing
            )
        )
        running = closing
        current += ONE_DAY
    return days


def balance_history_out(
    db: Session, account: models.Account, date_from: date, date_to: date
) -> schemas.BalanceHistoryOut:
    return schemas.BalanceHistoryOut(
        account_id=account.id,
        date_from=date_from,
        date_to=date_to,
        days=balance_history(db, account, date_from, date_to),
    )


def balance_summary(
    db: Session, account: models.Account, date_from: date, date_to: date
) -> schemas.BalanceSummaryOut:
    days = balance_history(db, account, date_from, date_to)
    opening = (
        days[0].opening_balance
        if days
        else domain.account_balance(db, account, as_of=date_from - ONE_DAY)
    )
    closing = days[-1].closing_balance if days else opening

    min_balance, min_date = opening, date_from
    max_balance, max_date = opening, date_from
    for day in days:
        if day.closing_balance < min_balance:
            min_balance, min_date = day.closing_balance, day.date
        if day.closing_balance > max_balance:
            max_balance, max_date = day.closing_balance, day.date

    income, expenses, transfers_in, transfers_out, count = _transaction_totals(
        db, account, models.Transaction.date.between(date_from, date_to)
    )
    adjustments = _adjustment_total(
        db, account, models.BalanceAdjustment.date.between(date_from, date_to)
    )

    return schemas.BalanceSummaryOut(
        account_id=account.id,
        date_from=date_from,
        date_to=date_to,
        opening_balance=money(opening),
        closing_balance=money(closing),
        min_balance=money(min_balance),
        min_balance_date=min_date,
        max_balance=money(max_balance),
        max_balance_date=max_date,
        net_change=money(closing - opening),
        income=money(income),
        expenses=money(expenses),
        transfers_in=money(transfers_in),
        transfers_out=money(transfers_out),
        adjustments=money(adjustments),
        transaction_count=count,
    )


def get_max_balance(
    db: Session, account: models.Account, date_from: date, date_to: date
) -> tuple[Decimal, date]:
    summary = balance_summary(db, account, date_from, date_to)
    return summary.max_balance, summary.max_balance_date


def get_min_balance(
    db: Session, account: models.Account, date_from: date, date_to: date
) -> tuple[Decimal, date]:
    summary = balance_summary(db, account, date_from, date_to)
    return summary.min_balance, summary.min_balance_date
