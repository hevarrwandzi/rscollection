# Realm Relics Online Shop — DevOps Runbook

Realm Relics is a small e-commerce web application for fantasy accessories. The app uses a Node.js/Express backend, static frontend assets, and PostgreSQL for product data.

This repository is being used as a DevOps practice project: the application exists, and the operational work focuses on making it reproducible, containerized, healthy, and safe to run.

## Tech Stack

- **Runtime:** Node.js 20
- **Backend:** Express
- **Database:** PostgreSQL 17
- **Frontend:** Static HTML/CSS/JavaScript served by Express
- **Reverse proxy:** Nginx 1.27 Alpine
- **Containerization:** Docker + Docker Compose

## Architecture

```text
Browser
  |
  | HTTP :8080
  v
nginx container — reverse proxy
  |
  | Compose internal network: app:3000
  v
app container — Node.js / Express API + static frontend
  |
  | Compose internal network: db:5432
  v
db container — PostgreSQL 17
  |
  v
Docker named volume: aa_db_data / db_data
```

## DevOps Work Implemented

- Dockerized the Node.js application.
- Added Docker Compose with separate `nginx`, `app`, and `db` services.
- Added Nginx as the public entrypoint on host port `8080`, proxying to the app container on the internal Compose network.
- Added PostgreSQL named volume for persistent database data.
- Added `init.sql` database bootstrap for product schema and seed data.
- Added `.env.example` and kept real `.env` out of Git.
- Added `.dockerignore` to keep secrets, Git metadata, and local dependencies out of the image build context.
- Improved Dockerfile with:
  - `node:20-slim`
  - `NODE_ENV=production`
  - `npm ci --omit=dev`
  - non-root `node` runtime user
- Added DB-backed Express health endpoints at `/health` and `/api/health`.
- Added Compose healthchecks for Nginx, app, and database.
- Added `depends_on.condition: service_healthy` so the app waits for PostgreSQL readiness and Nginx waits for app readiness.
- Added restart policies with `restart: unless-stopped`.
- Fixed npm audit vulnerabilities; current expected result is `found 0 vulnerabilities`.

## Required Local Tools

- Docker
- Docker Compose v2
- Git
- curl, optional but useful for smoke tests

Check Docker Compose:

```bash
docker compose version
```

## Environment Variables

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Then edit `.env` and set real values:

```env
DB_HOST=db
DB_PORT=5432
DB_NAME=shop
DB_USER=postgres
DB_PASSWORD=change-me
ADMIN_TOKEN=change-me
```

Notes:

- `.env` must stay private and must not be committed.
- `.env.example` is safe to commit because it contains placeholders only.
- `ADMIN_TOKEN` is required for product create/update/delete routes.

## Run Locally with Docker Compose

Build the image:

```bash
docker compose build
```

Start the stack:

```bash
docker compose up -d
```

Check containers:

```bash
docker compose ps
```

Expected state:

```text
aa-nginx-1   Up ... (healthy)   0.0.0.0:8080->80/tcp
aa-app-1     Up ... (healthy)   3000/tcp
aa-db-1      Up ... (healthy)   5432/tcp
```

Open the site:

```text
http://localhost:8080
```

Admin page:

```text
http://localhost:8080/admin
```

## Smoke Tests

Check API metadata:

```bash
curl -fsS http://localhost:8080/api
```

Check DB-backed health through Nginx:

```bash
curl -fsS http://localhost:8080/health
curl -fsS http://localhost:8080/api/health
```

Check products:

```bash
curl -fsS http://localhost:8080/products
```

Check featured products:

```bash
curl -fsS http://localhost:8080/featured-products
```

Expected result: JSON responses with no 500 errors.

## Healthchecks

The database healthcheck uses PostgreSQL's built-in readiness tool:

```bash
pg_isready -U ${DB_USER} -d ${DB_NAME}
```

The app healthcheck uses Node.js to request the local `/health` endpoint inside the app container:

```bash
node -e "require('http').get('http://localhost:3000/health', res => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
```

Why Node instead of curl/wget? The app image does not install curl or wget, and Node is already available.

The Nginx healthcheck requests `/health` through the reverse proxy:

```bash
curl -f http://localhost:80/health
```

Both `/health` and `/api/health` verify PostgreSQL connectivity by running a lightweight database query. A healthy response looks like:

```json
{
  "status": "ok",
  "database": "connected",
  "uptime_seconds": 12,
  "timestamp": "2026-06-05T01:08:50.483Z"
}
```

Inspect health status:

```bash
docker compose ps
```

Or directly:

```bash
docker inspect --format '{{.Name}} {{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' aa-nginx-1 aa-app-1 aa-db-1
```

## Logs

View app logs:

```bash
docker compose logs -f app
```

View database logs:

```bash
docker compose logs -f db
```

View recent logs only:

```bash
docker compose logs --tail=80 app
```

View Nginx logs:

```bash
docker compose logs --tail=80 nginx
```

## Stop / Start / Rebuild

Stop containers without deleting data:

```bash
docker compose stop
```

Start existing containers:

```bash
docker compose start
```

Restart services:

```bash
docker compose restart
```

Rebuild after Dockerfile or dependency changes:

```bash
docker compose build
docker compose up -d
```

## Database Data and Bootstrap

PostgreSQL data is stored in a named Docker volume:

```yaml
volumes:
  db_data:
```

The initial schema and seed products are loaded from:

```text
init.sql
```

It is mounted into:

```text
/docker-entrypoint-initdb.d/init.sql
```

Important: PostgreSQL init scripts only run when the database volume is empty. If the volume already exists, changing `init.sql` will not automatically re-run it.

## Reset Database for Local Development

Danger: this deletes local database data.

```bash
docker compose down -v
docker compose up -d --build
```

Use this only when local data is disposable.

## Backup Database

Create a backup directory:

```bash
mkdir -p backups
```

Backup with `pg_dump` from inside the db container:

```bash
docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" > backups/shop-$(date +%Y%m%d-%H%M%S).sql
```

If your shell does not have the variables loaded, use explicit values from `.env` manually, for example:

```bash
docker compose exec -T db pg_dump -U postgres -d shop > backups/shop-$(date +%Y%m%d-%H%M%S).sql
```

Do not commit real backup files if they contain production/customer data.

## Restore Database

Danger: restore can overwrite data depending on backup contents.

Basic restore into the current database:

```bash
docker compose exec -T db psql -U postgres -d shop < backups/your-backup.sql
```

For a clean local restore, recreate the database volume first:

```bash
docker compose down -v
docker compose up -d db
# wait until db is healthy
docker compose exec -T db psql -U postgres -d shop < backups/your-backup.sql
docker compose up -d app nginx
```

## Dependency Security Check

Run:

```bash
npm audit --audit-level=moderate
```

Expected current result:

```text
found 0 vulnerabilities
```

After dependency changes, rebuild:

```bash
docker compose build
docker compose up -d
```

## Useful Admin API Pattern

Admin routes require a bearer token:

```bash
curl -X POST http://localhost:8080/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d '{
    "slug": "example-product",
    "name": "Example Product",
    "description": "Example description",
    "material": "Steel",
    "color": "Silver",
    "style": "Pendant",
    "chain_length_cm": 45,
    "price": 25.00,
    "stock": 5,
    "featured": false,
    "image_url": null
  }'
```

## Troubleshooting

### Compose says the DB is not ready

Check database health and logs:

```bash
docker compose ps
docker compose logs --tail=80 db
```

Common causes:

- wrong `DB_USER`, `DB_PASSWORD`, or `DB_NAME`
- old database volume with unexpected data
- broken SQL in `init.sql`

### App returns `Internal server error`

Check app logs:

```bash
docker compose logs --tail=80 app
```

Common causes:

- app cannot connect to PostgreSQL
- missing environment variables
- database schema mismatch
- stale database volume from an older schema

### Changes to `init.sql` do not appear

Postgres init scripts only run on a fresh volume. For local development reset:

```bash
docker compose down -v
docker compose up -d --build
```

### Port 3000 already in use

The app container exposes port `3000` only inside the Docker Compose network. It is not published to the host. The public local entrypoint is Nginx on port `8080`.

If you manually publish app port `3000` later and hit a conflict, find the process:

```bash
ss -ltnp | grep ':3000'
```

Then either stop the conflicting service or change the host port in Compose:

```yaml
ports:
  - "3001:3000"
```

### Port 5432 on host is already in use

This project does not publish PostgreSQL to the host. That is intentional. The app connects to `db:5432` over the Docker Compose internal network.

### Port 8080 already in use

Nginx publishes host port `8080`. If Compose fails because the port is already allocated, find the conflicting process:

```bash
ss -ltnp | grep ':8080'
```

Then either stop the conflicting process or change the host port mapping in Compose:

```yaml
ports:
  - "8081:80"
```

## Production Notes / Next Improvements

Still recommended before a real production deployment:

- Add HTTPS.
- Deploy to VPS or AWS EC2.
- Add GitHub Actions CI/CD.
- Add automated scheduled backups.
- Add external uptime monitoring.
- Restrict CORS for production domains.
- Move secrets to a proper secret manager or deployment environment variables.
- Add rate limiting and tighter production security headers at the reverse proxy/app layer.

## Portfolio Summary

This project demonstrates operational ownership of an e-commerce app:

- containerization
- database service orchestration
- environment variable management
- healthchecks and startup ordering
- Nginx reverse proxy in front of the app container
- restart policies
- Docker build optimization
- dependency vulnerability cleanup
- local runbook and troubleshooting documentation

A concise way to describe this project:

> I took an existing Node.js/PostgreSQL online shop and made it reproducible and safer to operate with Docker Compose, PostgreSQL bootstrapping, environment configuration, DB-backed healthchecks, Nginx reverse proxying, restart policies, non-root container runtime, npm audit cleanup, and a practical runbook.
