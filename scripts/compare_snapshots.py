#!/usr/bin/env python3
"""Compare financial snapshots while allowing migration metadata changes."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def flatten(value: object, prefix: str = "") -> dict[str, object]:
    if isinstance(value, dict):
        result: dict[str, object] = {}
        for key, child in value.items():
            result.update(flatten(child, f"{prefix}.{key}" if prefix else key))
        return result
    if isinstance(value, list):
        return {prefix: value}
    return {prefix: value}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    args = parser.parse_args()
    before = flatten(json.loads(args.before.read_text()))
    after = flatten(json.loads(args.after.read_text()))
    keys = sorted(set(before) | set(after))
    differences = {
        key: {"before": before.get(key), "after": after.get(key)}
        for key in keys
        if before.get(key) != after.get(key)
        and key not in {"database.alembic_revision"}
    }
    if differences:
        print(json.dumps(differences, ensure_ascii=False, indent=2, sort_keys=True))
        raise SystemExit(1)
    print("No financial differences; only allowed migration metadata changed.")


if __name__ == "__main__":
    main()
