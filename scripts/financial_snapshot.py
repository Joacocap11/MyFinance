#!/usr/bin/env python3
"""Write a non-sensitive, reproducible financial snapshot from PostgreSQL."""
from __future__ import annotations

import argparse
import json
import os
from datetime import date
from decimal import Decimal
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

TABLES = {
    "users": "users",
    "accounts": "accounts",
    "transactions": "transactions",
    "categories": "categories",
    "categorization_rules": "categorization_rules",
    "recurring_rules": "recurring_expenses",
    "recurring_occurrences": "recurring_occurrences",
    "budgets": "monthly_budgets",
    "imports": "import_batches",
    "adjustments": "balance_adjustments",
}


def decimal(value: Decimal | int | None) -> str:
    return format(Decimal(value or 0).quantize(Decimal("0.01")), "f")


def query_one(conn: psycopg.Connection, query: str, params: tuple[object, ...] = ()) -> dict:
    with conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchone() or {}


def query_all(conn: psycopg.Connection, query: str, params: tuple[object, ...] = ()) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(query, params)
        return list(cur.fetchall())


def snapshot(conn: psycopg.Connection, month: str) -> dict:
    revision = query_one(conn, "SELECT version_num FROM alembic_version")
    counts = {}
    for key, table in TABLES.items():
        counts[key] = (
            int(query_one(conn, f"SELECT count(*) AS count FROM {table}")["count"])
            if _table_exists(conn, table)
            else 0
        )
    accounts = [
        {
            "id": row["id"],
            "name": row["name"],
            "currency": row["currency"],
            "balance": decimal(row["opening_balance"] + row["movement"] + row["adjustments"]),
        }
        for row in query_all(
            conn,
            """
            SELECT a.id, a.name, a.currency, a.opening_balance,
                   COALESCE(SUM(CASE
                     WHEN t.voided_at IS NOT NULL THEN 0
                     WHEN t.kind = 'income' AND t.account_id = a.id THEN t.amount
                     WHEN t.kind = 'expense' AND t.account_id = a.id THEN -t.amount
                     WHEN t.kind = 'transfer' AND t.account_id = a.id THEN -t.amount
                     WHEN t.kind = 'transfer' AND t.destination_account_id = a.id THEN t.amount
                     ELSE 0 END), 0) AS movement,
                   COALESCE((SELECT SUM(ba.amount) FROM balance_adjustments ba
                             WHERE ba.account_id = a.id), 0) AS adjustments
            FROM accounts a
            LEFT JOIN transactions t ON t.account_id = a.id OR t.destination_account_id = a.id
            GROUP BY a.id, a.name, a.currency, a.opening_balance
            ORDER BY a.id
            """,
        )
    ]
    currency_totals = query_all(
        conn,
        """
        SELECT a.currency,
               count(t.id) FILTER (WHERE t.kind != 'transfer') AS movements,
               COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'income'), 0) AS credits,
               COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'expense'), 0) AS debits
        FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
        GROUP BY a.currency ORDER BY a.currency
        """,
    )
    flow = query_one(
        conn,
        """
        SELECT COALESCE(SUM(amount) FILTER (WHERE kind = 'income'), 0) AS income,
               COALESCE(SUM(amount) FILTER (WHERE kind = 'expense'), 0) AS expenses
        FROM transactions
        WHERE voided_at IS NULL AND to_char(date, 'YYYY-MM') = %s
        """,
        (month,),
    )
    transaction_counts = query_one(
        conn,
        """SELECT count(*) AS total,
                  count(*) FILTER (WHERE voided_at IS NULL) AS posted,
                  count(*) FILTER (WHERE voided_at IS NOT NULL) AS voided
           FROM transactions""",
    )
    return {
        "database": {"alembic_revision": revision.get("version_num")},
        "counts": counts,
        "accounts": accounts,
        "currency_totals": [
            {"currency": row["currency"], "movements": int(row["movements"]), "credits": decimal(row["credits"]), "debits": decimal(row["debits"])}
            for row in currency_totals
        ],
        "period": {"month": month, "income": decimal(flow["income"]), "expenses": decimal(flow["expenses"]), "result": decimal(flow["income"] - flow["expenses"])},
        "transactions": {key: int(transaction_counts[key]) for key in ("total", "posted", "voided")},
    }


def _table_exists(conn: psycopg.Connection, table: str) -> bool:
    return bool(query_one(conn, "SELECT to_regclass(%s) AS name", (table,))["name"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--month", default=date.today().strftime("%Y-%m"))
    args = parser.parse_args()
    database_url = os.environ["DATABASE_URL"].replace(
        "postgresql+psycopg://", "postgresql://", 1
    )
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        result = snapshot(conn, args.month)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    print(args.output)


if __name__ == "__main__":
    main()
