#!/usr/bin/env sh
set -eu

: "${PGHOST:=db}"
: "${PGPORT:=5432}"
: "${PGDATABASE:?Set PGDATABASE (or POSTGRES_DB)}"
: "${PGUSER:?Set PGUSER (or POSTGRES_USER)}"
: "${PGPASSWORD:?Set PGPASSWORD (or POSTGRES_PASSWORD)}"
BACKUP_DIR=${BACKUP_DIR:-backups}
mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/${PGDATABASE}_$(date +%Y-%m-%d_%H%M).sql.gz"
pg_dump --format=plain --no-owner --no-privileges | gzip -9 > "$file"
printf 'Backup written to %s\n' "$file"
