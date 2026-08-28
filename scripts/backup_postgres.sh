#!/usr/bin/env sh
set -eu
umask 077

: "${PGHOST:=db}"
: "${PGDATABASE:=${POSTGRES_DB:-}}"
: "${PGUSER:=${POSTGRES_USER:-}}"
: "${PGPASSWORD:=${POSTGRES_PASSWORD:-}}"
: "${PGDATABASE:?Set PGDATABASE (or POSTGRES_DB)}"
: "${PGUSER:?Set PGUSER (or POSTGRES_USER)}"
: "${PGPASSWORD:?Set PGPASSWORD (or POSTGRES_PASSWORD)}"
BACKUP_DIR=${BACKUP_DIR:-backups}
mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/${PGDATABASE}_$(date +%Y%m%d_%H%M%S).dump"
pg_dump --format=custom --no-owner --no-privileges --file="$file"
[ -s "$file" ]
pg_restore --list "$file" >/dev/null
printf 'Backup written to %s\n' "$file"
