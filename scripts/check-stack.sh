#!/usr/bin/env bash
set -euo pipefail

echo "Checking Compose config..."
docker compose config --quiet
echo "Compose config OK"

echo "Checking containers..."
docker compose ps
docker compose ps | grep -q "aa-nginx-1.*healthy"
docker compose ps | grep -q "aa-app-1.*healthy"
docker compose ps | grep -q "aa-db-1.*healthy"
echo "Containers are healthy"

echo "Checking /health endpoint..."
health_response="$(curl -fsS http://localhost:8080/health)"
echo "$health_response"
echo "$health_response" | grep -q '"database":"connected"'
echo "Health endpoint OK"

echo "Checking /products endpoint..."
products_response="$(curl -fsS http://localhost:8080/products)"
echo "$products_response"
echo "$products_response" | grep -q '"name":"Crystal Guardian Pendant"'
echo "Products endpoint OK"

echo "Checking database backups..."
find backups -maxdepth 1 -type f -name "*.sql" | grep -q .
echo "Database backup exists"

echo "Stack check passed ^.^"