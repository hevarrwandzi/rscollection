#!/usr/bin/env bash
set -euo pipefail

mkdir -p backups

timestamp="$(date +%Y%m%d-%H%M%S)"
output="backups/shop-${timestamp}.sql"

docker compose exec -T db pg_dump -U postgres -d shop > "$output"

echo "Backup written to $output"
