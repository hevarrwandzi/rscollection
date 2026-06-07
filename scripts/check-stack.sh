#!/usr/bin/env bash
set -euo pipefail

echo "Checking Compose config..."
docker compose config --quiet
echo "Compose config OK"

echo "Checking containers..."
docker compose ps
docker compose ps | grep -q "rscollection-caddy-1.*Up"
docker compose ps | grep -q "rscollection-app-1.*healthy"
docker compose ps | grep -q "rscollection-db-1.*healthy"
echo "Containers are healthy"

echo "Checking /health endpoint..."
health_response="$(curl -fsS http://localhost:80/health)"
echo "$health_response"
echo "$health_response" | grep -q '"database":"connected"'
echo "Health endpoint OK"

echo "Checking /products endpoint..."
products_response="$(curl -fsS http://localhost:80/products)"
echo "$products_response"
echo "$products_response" | grep -q '"name":"Crown Charm Chain"'
echo "Products endpoint OK"

echo "Checking database backups..."
find backups -maxdepth 1 -type f -name "*.sql" | grep -q .
echo "Database backup exists"

echo "Checking public port exposure..."
docker compose config | grep -q 'published: "80"'
! docker compose config | grep -q 'published: "3000"'
! docker compose config | grep -q 'published: "5432"'
echo "Only Caddy is publicly exposed"

echo "Checking production dependency vulnerabilities..."
docker compose run --rm app npm audit --omit=dev
echo "Production dependency audit OK"

echo "Stack check passed ^.^"