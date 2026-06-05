#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--clean] backups/shop-YYYYMMDD-HHMMSS.sql"
  echo
  echo "Options:"
  echo "  --clean   Drop and recreate the public schema before restoring."
}

clean_restore=false

if [ "${1:-}" = "--clean" ]; then
  clean_restore=true
  shift
fi

backup_file="${1:-}"

if [ -z "$backup_file" ]; then
  usage
  exit 1
fi

if [ ! -r "$backup_file" ]; then
  echo "Error: backup file '$backup_file' does not exist or is not readable."
  exit 1
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

db_user="${DB_USER:-postgres}"
db_name="${DB_NAME:-shop}"

echo "Restoring database '$db_name' from $backup_file..."

if [ "$clean_restore" = true ]; then
  echo "Cleaning public schema first..."
  docker compose exec -T db psql \
    -v ON_ERROR_STOP=1 \
    -U "$db_user" \
    -d "$db_name" \
    -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
fi

docker compose exec -T db psql \
  -v ON_ERROR_STOP=1 \
  -U "$db_user" \
  -d "$db_name" \
  < "$backup_file"

echo "Database restored successfully."
