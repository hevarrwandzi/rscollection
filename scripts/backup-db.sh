#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

db_user="${DB_USER:-postgres}"
db_name="${DB_NAME:-shop}"

mkdir -p backups

timestamp="$(date +%Y%m%d-%H%M%S)"
output="backups/shop-${timestamp}.sql"

echo "Creating backup of database '$db_name' as user '$db_user'..."
docker compose exec -T db pg_dump -U "$db_user" -d "$db_name" > "$output"

echo "Backup written to $output"
