#!/usr/bin/env python3
"""Copy an existing MyFinance SQLite database into an already-migrated PostgreSQL database."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from sqlalchemy import MetaData, create_engine, func, select, text

TABLES = (
    "accounts", "categories", "balance_adjustments", "transactions",
    "recurring_expenses", "categorization_rules", "monthly_budgets",
    "import_batches", "import_rows",
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", default="myfinance.db", help="SQLite file path")
    parser.add_argument("--postgres-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--allow-existing", action="store_true", help="allow destination rows")
    args = parser.parse_args()
    if not args.postgres_url:
        parser.error("--postgres-url or DATABASE_URL is required")

    source = create_engine(f"sqlite:///{Path(args.sqlite).resolve()}")
    destination = create_engine(args.postgres_url)
    source_meta = MetaData()
    destination_meta = MetaData()
    source_meta.reflect(bind=source, only=TABLES)
    destination_meta.reflect(bind=destination, only=TABLES)
    with source.connect() as src, destination.begin() as dst:
        counts = {}
        for name in TABLES:
            source_table = source_meta.tables.get(name)
            destination_table = destination_meta.tables.get(name)
            if source_table is None or destination_table is None:
                continue
            if not args.allow_existing and dst.scalar(select(func.count()).select_from(destination_table)):
                raise SystemExit(f"Destination table {name} is not empty; aborting")
            rows = [dict(row) for row in src.execute(select(source_table)).mappings()]
            if rows:
                dst.execute(destination_table.insert(), rows)
            counts[name] = len(rows)
        for name in TABLES:
            table = destination_meta.tables.get(name)
            if table is None or "id" not in table.c:
                continue
            sequence = f"{name}_id_seq"
            dst.execute(text("SELECT setval(:sequence, COALESCE((SELECT MAX(id) FROM \"" + name + "\"), 1))"), {"sequence": sequence})
    print("SQLite → PostgreSQL migration completed:")
    for table, count in counts.items():
        print(f"  {table}: {count}")


if __name__ == "__main__":
    main()
