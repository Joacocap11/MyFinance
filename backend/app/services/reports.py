from __future__ import annotations

from calendar import monthrange
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas

ZERO = Decimal("0.00")
PERCENT = Decimal("0.01")


def month_bounds(month: str) -> tuple[date, date]:
    year, number = (int(part) for part in month.split("-"))
    return date(year, number, 1), date(year, number, monthrange(year, number)[1])


def shift_month(first: date, offset: int) -> date:
    serial = first.year * 12 + first.month - 1 + offset
    return date(serial // 12, serial % 12 + 1, 1)


def money(value: Decimal | int) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def percentage(numerator: Decimal, denominator: Decimal) -> Decimal | None:
    if denominator == 0:
        return None
    return (numerator * 100 / denominator).quantize(PERCENT, rounding=ROUND_HALF_UP)


def transactions_for_month(
    db: Session, month: str, currency: models.Currency
) -> list[models.Transaction]:
    start, end = month_bounds(month)
    return list(
        db.scalars(
            select(models.Transaction)
            .join(models.Account, models.Transaction.account_id == models.Account.id)
            .where(
                models.Transaction.date.between(start, end),
                models.Transaction.voided_at.is_(None),
                models.Account.currency == currency,
            )
            .order_by(models.Transaction.date.desc(), models.Transaction.id.desc())
        )
    )


def top_category(db: Session, category_id: int | None) -> models.Category | None:
    if category_id is None:
        return None
    category = db.get(models.Category, category_id)
    seen: set[int] = set()
    while category is not None and category.parent_id is not None:
        if category.id in seen:
            return None
        seen.add(category.id)
        category = db.get(models.Category, category.parent_id)
    return category


def monthly_report(db: Session, month: str, currency: models.Currency) -> schemas.MonthlyReport:
    rows = transactions_for_month(db, month, currency)
    income = money(
        sum((row.amount for row in rows if row.kind == models.TransactionKind.INCOME), ZERO)
    )
    expense_rows = [row for row in rows if row.kind == models.TransactionKind.EXPENSE]
    expenses = money(sum((row.amount for row in expense_rows), ZERO))
    income_sources_totals: dict[str, Decimal] = {}
    for row in rows:
        if row.kind == models.TransactionKind.INCOME:
            source = top_category(db, row.category_id)
            name = source.name if source else "Sin categoría"
            income_sources_totals[name] = income_sources_totals.get(name, ZERO) + row.amount
    income_sources = [
        schemas.IncomeSource(
            name=name,
            amount=money(amount),
            percentage=percentage(amount, income) or ZERO,
        )
        for name, amount in sorted(
            income_sources_totals.items(), key=lambda item: item[1], reverse=True
        )
    ]

    start, _ = month_bounds(month)
    previous = shift_month(start, -1).strftime("%Y-%m")
    previous_expenses = money(
        sum(
            (
                row.amount
                for row in transactions_for_month(db, previous, currency)
                if row.kind == models.TransactionKind.EXPENSE
            ),
            ZERO,
        )
    )
    budget_row = db.get(models.MonthlyBudget, currency)
    budget = money(budget_row.amount) if budget_row else None

    totals: dict[int | None, Decimal] = {}
    names: dict[int | None, str] = {None: "Sin categoría"}
    evidence: dict[int | None, list[int]] = {}
    for row in expense_rows:
        root = top_category(db, row.category_id)
        key = root.id if root else None
        names[key] = root.name if root else "Sin categoría"
        totals[key] = totals.get(key, ZERO) + row.amount
        evidence.setdefault(key, []).append(row.id)
    categories = [
        schemas.CategorySummary(
            category_id=key,
            name=names[key],
            amount=money(amount),
            percentage=percentage(amount, expenses),
        )
        for key, amount in sorted(totals.items(), key=lambda item: item[1], reverse=True)
    ]

    top_expenses = sorted(
        expense_rows, key=lambda row: (row.amount, row.date, row.id), reverse=True
    )[:5]
    recent = rows[:5]
    insights: list[schemas.Insight] = []
    if categories:
        leader = categories[0]
        insights.append(
            schemas.Insight(
                type="top_category",
                title=f"{leader.name} lidera tus gastos",
                detail=f"Representa {leader.percentage or ZERO}% del gasto del mes.",
                category_id=leader.category_id,
                transaction_ids=evidence[leader.category_id][:5],
            )
        )
    change = percentage(expenses - previous_expenses, previous_expenses)
    if change is not None and expenses != previous_expenses:
        direction = "más" if change > 0 else "menos"
        insights.append(
            schemas.Insight(
                type="month_comparison",
                title=f"Gastaste {abs(change)}% {direction}",
                detail=f"Comparación con {previous}.",
                transaction_ids=[row.id for row in expense_rows[:5]],
            )
        )
    if budget is not None:
        remaining = budget - expenses
        insights.append(
            schemas.Insight(
                type="budget",
                title="Presupuesto mensual",
                detail=(
                    f"Quedan {money(remaining)} {currency.value}."
                    if remaining >= 0
                    else f"Superaste el presupuesto por {money(abs(remaining))} {currency.value}."
                ),
                transaction_ids=[row.id for row in expense_rows[:5]],
            )
        )

    return schemas.MonthlyReport(
        month=month,
        currency=currency,
        income=income,
        expenses=expenses,
        net=money(income - expenses),
        savings=money(
            sum(
                (
                    row.amount
                    for row in rows
                    if row.kind == models.TransactionKind.TRANSFER
                    and row.purpose == models.TransferPurpose.SAVINGS
                ),
                ZERO,
            )
        ),
        spent_percentage=percentage(expenses, budget) if budget is not None else None,
        comparison=schemas.Comparison(
            previous_month=previous,
            previous_expenses=previous_expenses,
            change_percentage=change,
        ),
        budget=budget,
        categories=categories,
        income_sources=income_sources,
        top_expenses=[schemas.TransactionOut.model_validate(row) for row in top_expenses],
        recent_transactions=[schemas.TransactionOut.model_validate(row) for row in recent],
        insights=insights[:3],
    )


def history_report(db: Session, months: int, currency: models.Currency) -> schemas.HistoryReport:
    current = date.today().replace(day=1)
    result: list[schemas.HistoryMonth] = []
    for offset in range(-(months - 1), 1):
        month = shift_month(current, offset).strftime("%Y-%m")
        rows = transactions_for_month(db, month, currency)
        income = money(
            sum((r.amount for r in rows if r.kind == models.TransactionKind.INCOME), ZERO)
        )
        expenses = money(
            sum((r.amount for r in rows if r.kind == models.TransactionKind.EXPENSE), ZERO)
        )
        result.append(
            schemas.HistoryMonth(
                month=month, income=income, expenses=expenses, net=money(income - expenses)
            )
        )
    return schemas.HistoryReport(currency=currency, months=result)
