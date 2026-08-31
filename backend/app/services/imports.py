from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.services.domain import (
    DomainError,
    current_owner_id,
    match_rule,
    normalize_text,
    owner_clause,
    semantic_fingerprint,
    validate_category,
)

ORIGIN_VERSION = "csv-v2"


def decode_csv(content: bytes) -> tuple[str, list[str], list[dict[str, str]]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise DomainError("El CSV debe estar codificado en UTF-8") from exc
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    if not reader.fieldnames or any(not name or not name.strip() for name in reader.fieldnames):
        raise DomainError("El CSV debe tener encabezados válidos")
    headers = [name.strip() for name in reader.fieldnames]
    if len(headers) != len(set(headers)):
        raise DomainError("El CSV contiene encabezados duplicados")
    rows = [
        {str(key).strip(): (value or "").strip() for key, value in row.items() if key is not None}
        for row in reader
    ]
    if not rows:
        raise DomainError("El CSV no contiene filas de datos")
    return text, headers, rows


def create_upload(db: Session, filename: str, content: bytes) -> models.ImportBatch:
    text, headers, rows = decode_csv(content)
    batch = models.ImportBatch(
        id=str(uuid4()),
        owner_id=current_owner_id(db),
        filename=filename,
        state=models.ImportState.UPLOADED,
        content=text,
        headers=headers,
        sample_rows=rows[:5],
        mapping=None,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def csv_rows(batch: models.ImportBatch) -> list[dict[str, str]]:
    try:
        dialect = csv.Sniffer().sniff(batch.content[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    return [
        {str(key).strip(): (value or "").strip() for key, value in row.items() if key is not None}
        for row in csv.DictReader(io.StringIO(batch.content), dialect=dialect)
    ]


def parse_date(value: str) -> date:
    value = value.strip()
    for pattern in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, pattern).date()
        except ValueError:
            pass
    raise DomainError(f"Fecha inválida en el CSV: {value}")


def parse_decimal(value: str) -> Decimal:
    token = value.strip().replace("\u00a0", " ")
    if not token:
        raise DomainError("Hay un importe vacío en el CSV")

    currency = r"(?:UYU|USD|U\$S|\$U|\$)"
    prefix = re.match(rf"^{currency}\s*", token, flags=re.IGNORECASE)
    suffix = re.search(rf"\s*{currency}$", token, flags=re.IGNORECASE)
    if prefix and suffix:
        raise DomainError(f"Importe inválido en el CSV: {value}")
    if prefix:
        token = token[prefix.end() :]
    elif suffix:
        token = token[: suffix.start()]
    token = token.replace(" ", "")
    if not re.fullmatch(r"[+-]?\d[\d.,]*", token):
        raise DomainError(f"Importe inválido en el CSV: {value}")

    sign = ""
    if token[0] in "+-":
        sign, token = token[0], token[1:]

    if "," in token and "." in token:
        decimal_separator = "," if token.rfind(",") > token.rfind(".") else "."
        grouping_separator = "." if decimal_separator == "," else ","
        integer_part, fraction = token.rsplit(decimal_separator, 1)
        groups = integer_part.split(grouping_separator)
        if (
            not 1 <= len(fraction) <= 2
            or decimal_separator in integer_part
            or not groups[0].isdigit()
            or not 1 <= len(groups[0]) <= 3
            or any(len(group) != 3 or not group.isdigit() for group in groups[1:])
        ):
            raise DomainError(f"Importe inválido en el CSV: {value}")
        cleaned = f"{sign}{''.join(groups)}.{fraction}"
    elif "," in token or "." in token:
        separator = "," if "," in token else "."
        groups = token.split(separator)
        if (
            len(groups) == 2
            and 1 <= len(groups[1]) <= 2
            and all(group.isdigit() for group in groups)
        ):
            cleaned = f"{sign}{groups[0]}.{groups[1]}"
        elif (
            1 <= len(groups[0]) <= 3
            and groups[0].isdigit()
            and all(len(group) == 3 and group.isdigit() for group in groups[1:])
        ):
            cleaned = f"{sign}{''.join(groups)}"
        else:
            raise DomainError(f"Importe inválido en el CSV: {value}")
    else:
        cleaned = f"{sign}{token}"

    try:
        amount = Decimal(cleaned)
    except InvalidOperation as exc:
        raise DomainError(f"Importe inválido en el CSV: {value}") from exc
    exponent = amount.as_tuple().exponent
    if (
        not amount.is_finite()
        or amount == 0
        or abs(amount) > models.MONEY_MAX
        or not isinstance(exponent, int)
        or exponent < -2
    ):
        raise DomainError(f"Importe fuera de rango o con más de 2 decimales: {value}")
    return amount


def parse_kind(value: str) -> models.TransactionKind:
    normalized = normalize_text(value)
    if normalized in {"income", "ingreso", "credito", "credit", "haber"}:
        return models.TransactionKind.INCOME
    if normalized in {"expense", "gasto", "debito", "debit", "debe"}:
        return models.TransactionKind.EXPENSE
    if normalized in {"transfer", "transferencia"}:
        return models.TransactionKind.TRANSFER
    raise DomainError(f"Tipo de movimiento inválido en el CSV: {value}")


def mapped_value(raw: dict[str, str], column: str | None, label: str) -> str:
    if not column or column not in raw:
        raise DomainError(f"La columna mapeada para {label} no existe")
    return raw[column]


def category_from_path(db: Session, value: str, kind: models.TransactionKind) -> int | None:
    parts = [part.strip() for part in value.split(">") if part.strip()]
    if not parts:
        return None
    parent_id: int | None = None
    category: models.Category | None = None
    for part in parts:
        category = db.scalar(
            select(models.Category).where(
                models.Category.name == part,
                models.Category.kind == kind,
                models.Category.parent_id == parent_id,
                owner_clause(db, models.Category),
            )
        )
        if category is None:
            return None
        parent_id = category.id
    return category.id if category else None


def row_values(
    raw: dict[str, str], mapping: schemas.ImportMapping
) -> tuple[date, str, Decimal, models.TransactionKind]:
    posted_on = parse_date(mapped_value(raw, mapping.date, "date"))
    description = mapped_value(raw, mapping.description, "description").strip()
    if not description:
        raise DomainError("Hay una descripción vacía en el CSV")
    if len(description) > 240:
        raise DomainError("Hay una descripción de más de 240 caracteres")

    if mapping.debit or mapping.credit:
        debit = (
            parse_decimal(raw[mapping.debit]) if mapping.debit and raw.get(mapping.debit) else None
        )
        credit = (
            parse_decimal(raw[mapping.credit])
            if mapping.credit and raw.get(mapping.credit)
            else None
        )
        if (debit is None) == (credit is None):
            raise DomainError("Cada fila debe tener exactamente un valor debit o credit")
        selected = debit if debit is not None else credit
        assert selected is not None
        amount = abs(selected)
        kind = (
            models.TransactionKind.EXPENSE if debit is not None else models.TransactionKind.INCOME
        )
    else:
        signed = parse_decimal(mapped_value(raw, mapping.amount, "amount"))
        if mapping.kind and raw.get(mapping.kind):
            kind = parse_kind(raw[mapping.kind])
        else:
            kind = models.TransactionKind.INCOME if signed > 0 else models.TransactionKind.EXPENSE
        amount = abs(signed)
    return posted_on, description, amount, kind


def native_fields(
    db: Session, raw: dict[str, str], mapping: schemas.ImportMapping, source: models.Account
) -> dict[str, object]:
    if mapping.currency and raw.get(mapping.currency) and raw[mapping.currency] != source.currency:
        raise DomainError("La moneda del CSV no coincide con la cuenta de destino")
    destination_account_id = None
    destination: models.Account | None = None
    if mapping.destination_account and raw.get(mapping.destination_account):
        destination = db.scalar(
            select(models.Account).where(
                models.Account.name == raw[mapping.destination_account],
                owner_clause(db, models.Account),
            )
        )
        if destination is None:
            raise DomainError("La cuenta destino de la transferencia no existe")
        destination_account_id = destination.id
        if (
            mapping.destination_currency
            and raw.get(mapping.destination_currency)
            and raw[mapping.destination_currency] != destination.currency
        ):
            raise DomainError("La moneda de destino no coincide con la cuenta destino")
    destination_amount = (
        parse_decimal(raw[mapping.destination_amount])
        if mapping.destination_amount and raw.get(mapping.destination_amount)
        else None
    )
    try:
        purpose = (
            models.TransferPurpose(raw[mapping.purpose])
            if mapping.purpose and raw.get(mapping.purpose)
            else None
        )
    except ValueError as exc:
        raise DomainError("Propósito de transferencia inválido") from exc
    return {
        "destination_account_id": destination_account_id,
        "destination_amount": destination_amount,
        "purpose": purpose,
        "notes": raw.get(mapping.notes, "") or None if mapping.notes else None,
        "voided": bool(
            mapping.status and raw.get(mapping.status, "").lower() in {"voided", "anulado"}
        ),
    }


def digest(payload: object) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def preview_import(
    db: Session, batch: models.ImportBatch, request: schemas.ImportPreviewRequest
) -> models.ImportBatch:
    if batch.state == models.ImportState.CONFIRMED:
        raise DomainError("Una importación confirmada no puede modificarse", 409)
    account = db.scalar(
        select(models.Account).where(
            models.Account.id == request.account_id,
            owner_clause(db, models.Account),
        )
    )
    if account is None or not account.is_active:
        raise DomainError("La cuenta no existe o está inactiva")
    mapping = {
        "date": request.mapping.date,
        "description": request.mapping.description,
        "amount": request.mapping.amount,
        "debit": request.mapping.debit,
        "credit": request.mapping.credit,
        "kind": request.mapping.kind,
        "currency": request.mapping.currency,
        "category": request.mapping.category,
        "destination_account": request.mapping.destination_account,
        "destination_currency": request.mapping.destination_currency,
        "destination_amount": request.mapping.destination_amount,
        "purpose": request.mapping.purpose,
        "status": request.mapping.status,
        "notes": request.mapping.notes,
    }
    missing = {column for column in mapping.values() if column and column not in batch.headers}
    if missing:
        raise DomainError(f"Columnas inexistentes: {', '.join(sorted(missing))}")

    batch.rows.clear()
    db.flush()
    occurrences: defaultdict[str, int] = defaultdict(int)
    file_digest = digest(batch.content)
    for number, raw in enumerate(csv_rows(batch), start=2):
        raw_digest = digest({"headers": batch.headers, "row": raw})
        occurrence = occurrences[raw_digest]
        occurrences[raw_digest] += 1
        origin_payload = {
            "account_id": account.id,
            "file": file_digest,
            "row": raw_digest,
            "occurrence": occurrence,
        }
        origin = f"{ORIGIN_VERSION}:{digest(origin_payload)}"
        try:
            posted_on, description, amount, kind = row_values(raw, request.mapping)
        except DomainError as exc:
            description = raw.get(request.mapping.description, "").strip()
            batch.rows.append(
                models.ImportRow(
                    row_number=number,
                    raw=raw,
                    date=None,
                    description=(description or "Fila sin descripción")[:240],
                    amount=None,
                    kind=None,
                    category_id=None,
                    disposition=models.ImportDisposition.SKIP,
                    possible_duplicate=False,
                    error=str(exc.detail)[:500],
                    origin_key=origin,
                    semantic_fingerprint=None,
                    transaction_id=None,
                )
            )
            continue

        category_id = (
            category_from_path(db, raw.get(request.mapping.category, ""), kind)
            if request.mapping.category
            else match_rule(db, description, kind)
        )
        semantic = semantic_fingerprint(
            account_id=account.id,
            posted_on=posted_on,
            description=description,
            amount=amount,
            kind=kind,
        )
        exact = db.scalar(
            select(models.Transaction).where(
                models.Transaction.origin_key == origin,
                owner_clause(db, models.Transaction),
            )
        )
        collision = db.scalar(
            select(models.Transaction.id)
            .where(
                models.Transaction.semantic_fingerprint == semantic,
                models.Transaction.voided_at.is_(None),
                owner_clause(db, models.Transaction),
            )
            .limit(1)
        )
        if exact:
            disposition = models.ImportDisposition.SKIP
            transaction_id = exact.id
            possible_duplicate = False
        elif collision:
            disposition = models.ImportDisposition.POSSIBLE_DUPLICATE
            transaction_id = None
            possible_duplicate = True
        else:
            disposition = models.ImportDisposition.IMPORT
            transaction_id = None
            possible_duplicate = False
        batch.rows.append(
            models.ImportRow(
                row_number=number,
                raw=raw,
                date=posted_on,
                description=description,
                amount=amount,
                kind=kind,
                category_id=category_id,
                disposition=disposition,
                possible_duplicate=possible_duplicate,
                error=None,
                origin_key=origin,
                semantic_fingerprint=semantic,
                transaction_id=transaction_id,
            )
        )
    batch.mapping = mapping
    batch.account_id = account.id
    batch.state = models.ImportState.PREVIEWED
    db.commit()
    db.refresh(batch)
    return batch


def patch_import_row(
    db: Session, batch: models.ImportBatch, row: models.ImportRow, patch: schemas.ImportRowPatch
) -> models.ImportRow:
    if batch.state != models.ImportState.PREVIEWED:
        raise DomainError("Solo se pueden editar filas en vista previa", 409)
    if row.error is not None:
        raise DomainError("Las filas con errores solo pueden omitirse")
    values = patch.model_dump(exclude_unset=True)
    assert row.kind is not None
    if "category_id" in values and values["category_id"] is not None:
        validate_category(db, values["category_id"], row.kind)
    if values.get("disposition") == models.ImportDisposition.POSSIBLE_DUPLICATE:
        raise DomainError("Elija importar o ignorar la posible duplicación")
    for key, value in values.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def confirm_import(db: Session, batch_id: str) -> schemas.ImportConfirmOut:
    batch = db.scalar(
        select(models.ImportBatch)
        .where(
            models.ImportBatch.id == batch_id,
            owner_clause(db, models.ImportBatch),
        )
        .with_for_update()
    )
    if batch is None:
        raise DomainError("Importación no encontrada", 404)
    if batch.state == models.ImportState.UPLOADED:
        raise DomainError("Debe generar la vista previa antes de confirmar", 409)
    if batch.state == models.ImportState.CONFIRMED:
        return confirm_result(batch)
    assert batch.account_id is not None
    account = db.scalar(
        select(models.Account).where(
            models.Account.id == batch.account_id,
            owner_clause(db, models.Account),
        )
    )
    if account is None or not account.is_active:
        raise DomainError("La cuenta no existe o está inactiva", 409)
    mapping = schemas.ImportMapping(**(batch.mapping or {}))
    try:
        for row in batch.rows:
            if row.disposition != models.ImportDisposition.IMPORT:
                continue
            if row.error or row.date is None or row.amount is None or row.kind is None:
                raise DomainError("Una fila inválida no se puede importar", 409)
            if row.kind != models.TransactionKind.TRANSFER:
                validate_category(db, row.category_id, row.kind)
            exact = db.scalar(
                select(models.Transaction).where(
                    models.Transaction.origin_key == row.origin_key,
                    owner_clause(db, models.Transaction),
                )
            )
            if exact:
                row.disposition = models.ImportDisposition.SKIP
                row.transaction_id = exact.id
                continue
            fields = native_fields(db, row.raw, mapping, account)
            if row.kind == models.TransactionKind.TRANSFER:
                if fields["destination_account_id"] is None:
                    raise DomainError("Una transferencia requiere cuenta destino")
                category_id = None
            else:
                category_id = row.category_id
                fields = {
                    "destination_account_id": None,
                    "destination_amount": None,
                    "purpose": None,
                    "notes": fields["notes"],
                    "voided": fields["voided"],
                }
            transaction = models.Transaction(
                owner_id=current_owner_id(db),
                date=row.date,
                kind=row.kind,
                amount=row.amount,
                description=row.description,
                account_id=batch.account_id,
                category_id=category_id,
                origin_key=row.origin_key,
                semantic_fingerprint=row.semantic_fingerprint,
                destination_account_id=fields["destination_account_id"],
                destination_amount=fields["destination_amount"],
                purpose=fields["purpose"],
                notes=fields["notes"],
                voided_at=datetime.now() if fields["voided"] else None,
            )
            db.add(transaction)
            db.flush()
            row.transaction_id = transaction.id
        batch.state = models.ImportState.CONFIRMED
        db.commit()
        db.refresh(batch)
    except Exception:
        db.rollback()
        raise
    return confirm_result(batch)


def confirm_result(batch: models.ImportBatch) -> schemas.ImportConfirmOut:
    imported = [
        row.transaction_id
        for row in batch.rows
        if row.disposition == models.ImportDisposition.IMPORT and row.transaction_id is not None
    ]
    return schemas.ImportConfirmOut(
        id=batch.id,
        state=batch.state,
        imported_count=len(imported),
        skipped_count=len(batch.rows) - len(imported),
        transaction_ids=imported,
    )
