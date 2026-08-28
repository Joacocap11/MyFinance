#!/usr/bin/env sh
set -eu
umask 077

: "${BACKUP_FILE:?Set BACKUP_FILE to a custom-format .dump file}"
: "${PGHOST:=db}"
: "${PGPORT:=5432}"
: "${PGUSER:=${POSTGRES_USER:-}}"
: "${PGPASSWORD:=${POSTGRES_PASSWORD:-}}"
: "${PGUSER:?Set PGUSER (or POSTGRES_USER)}"
: "${PGPASSWORD:?Set PGPASSWORD (or POSTGRES_PASSWORD)}"
TARGET_DATABASE=${TARGET_DATABASE:-myfinance_restore_check}

case "$TARGET_DATABASE" in
  myfinance|production|prod) echo "Refusing ambiguous production target: $TARGET_DATABASE" >&2; exit 2 ;;
esac
pg_restore --list "$BACKUP_FILE" >/dev/null
if psql -d "$TARGET_DATABASE" -Atqc "SELECT 1" >/dev/null 2>&1; then
  tables=$(psql -d "$TARGET_DATABASE" -Atqc "SELECT count(*) FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace")
  if [ "$tables" -gt 0 ] && [ "${CONFIRM_NONEMPTY_RESTORE:-}" != YES ]; then
    echo "Refusing non-empty target; set CONFIRM_NONEMPTY_RESTORE=YES explicitly" >&2
    exit 3
  fi
else
  createdb "$TARGET_DATABASE"
fi
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$TARGET_DATABASE" "$BACKUP_FILE"
printf 'Restore completed into %s\n' "$TARGET_DATABASE"
