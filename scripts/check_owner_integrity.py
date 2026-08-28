#!/usr/bin/env python3
"""Exit non-zero when personal records violate ownership invariants."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

CHECKS = {
    "null_accounts": "SELECT count(*) AS count FROM accounts WHERE owner_id IS NULL",
    "null_adjustments": "SELECT count(*) AS count FROM balance_adjustments WHERE owner_id IS NULL",
    "null_categories": "SELECT count(*) AS count FROM categories WHERE owner_id IS NULL",
    "null_transactions": "SELECT count(*) AS count FROM transactions WHERE owner_id IS NULL",
    "null_recurring": "SELECT count(*) AS count FROM recurring_expenses WHERE owner_id IS NULL",
    "null_rules": "SELECT count(*) AS count FROM categorization_rules WHERE owner_id IS NULL",
    "null_budgets": "SELECT count(*) AS count FROM monthly_budgets WHERE owner_id IS NULL",
    "null_imports": "SELECT count(*) AS count FROM import_batches WHERE owner_id IS NULL",
    "transaction_account_owner": """
        SELECT count(*) AS count FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE t.owner_id <> a.owner_id
           OR (t.destination_account_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM accounts d WHERE d.id = t.destination_account_id AND d.owner_id <> t.owner_id))
    """,
    "transaction_category_owner": """
        SELECT count(*) AS count FROM transactions t JOIN categories c ON c.id = t.category_id
        WHERE c.owner_id <> t.owner_id
    """,
    "adjustment_account_owner": """
        SELECT count(*) AS count FROM balance_adjustments b JOIN accounts a ON a.id = b.account_id
        WHERE b.owner_id <> a.owner_id
    """,
    "recurring_account_owner": """
        SELECT count(*) AS count FROM recurring_expenses r JOIN accounts a ON a.id = r.account_id
        WHERE r.owner_id <> a.owner_id
    """,
    "recurring_category_owner": """
        SELECT count(*) AS count FROM recurring_expenses r JOIN categories c ON c.id = r.category_id
        WHERE r.owner_id <> c.owner_id
    """,
    "rule_category_owner": """
        SELECT count(*) AS count FROM categorization_rules r JOIN categories c ON c.id = r.category_id
        WHERE r.owner_id <> c.owner_id
    """,
    "import_account_owner": """
        SELECT count(*) AS count FROM import_batches i JOIN accounts a ON a.id = i.account_id
        WHERE i.owner_id <> a.owner_id
    """,
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    database_url = os.environ["DATABASE_URL"].replace(
        "postgresql+psycopg://", "postgresql://", 1
    )
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            results = {}
            for name, query in CHECKS.items():
                cur.execute(query)
                results[name] = int(cur.fetchone()["count"])
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        import json

        args.output.write_text(json.dumps(results, indent=2, sort_keys=True) + "\n")
    for name, count in results.items():
        print(f"{name}: {count}")
    if any(results.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
