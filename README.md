# RS Collection Online Shop — DevOps Runbook

RS Collection is a small e-commerce web application for anime and gaming accessories. The app uses a Node.js/Express backend, static frontend assets, and PostgreSQL for product data.

This repository is being used as a DevOps practice project: the application exists, and the operational work focuses on making it reproducible, containerized, healthy, and safe to run.

## Tech Stack

- **Runtime:** Node.js 20
- **Backend:** Express
- **Database:** PostgreSQL 17
- **Frontend:** Static HTML/CSS/JavaScript served by Express
- **Reverse proxy / HTTPS:** Caddy 2 Alpine with automatic Let's Encrypt TLS
- **Containerization:** Docker + Docker Compose

## Architecture

```text
Browser
  |
  | HTTPS :443 / HTTP :80 redirect
  v
caddy container — reverse proxy + automatic HTTPS
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
Docker named volume: db_data
```

## DevOps Work Implemented

- Dockerized the Node.js application.
- Added Docker Compose with separate `caddy`, `app`, and `db` services.
- Added Caddy as the public entrypoint on host ports `80` and `443`, proxying to the app container on the internal Compose network and managing TLS certificates automatically.
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
- Added Compose healthchecks for the app and database, with Caddy depending on a healthy app before starting.
- Added `depends_on.condition: service_healthy` so the app waits for PostgreSQL readiness and Caddy waits for app readiness.
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

Copy the example environment file before starting the stack:

```bash
cp .env.example .env
```

Then edit `.env` with real local or server values. Required variables:

```env
DB_USER=postgres
DB_PASSWORD=change-me
DB_NAME=shop
DB_HOST=db
DB_PORT=5432
ADMIN_TOKEN=change-me
PORT=3000
CADDY_SITE=:80
```

Variable purpose:

- `DB_USER` - PostgreSQL username.
- `DB_PASSWORD` - PostgreSQL password.
- `DB_NAME` - PostgreSQL database name.
- `DB_HOST` - database host inside Docker Compose, usually `db`.
- `DB_PORT` - PostgreSQL port, usually `5432`.
- `ADMIN_TOKEN` - token required for admin product create/update/delete routes.
- `PORT` - app port inside the container, usually `3000`.
- `CADDY_SITE` - Caddy site address. Use `:80` for local/CI and `rscollection.online, www.rscollection.online` on production.

Notes:

- `.env` must stay private and must not be committed.
- `.env.example` is safe to commit because it contains placeholders only.
- Use strong, unique values for `DB_PASSWORD` and `ADMIN_TOKEN` on a real server.

## Production HTTPS Deployment

Production runs on AWS EC2 at:

```text
https://rscollection.online
https://www.rscollection.online
```

Production `.env` should include:

```env
CADDY_SITE=rscollection.online, www.rscollection.online
```

Caddy automatically obtains and renews Let's Encrypt certificates. HTTP requests on port `80` redirect to HTTPS on port `443`.

Redeploy on the EC2 host from the repository directory:

```bash
git pull
docker compose down --remove-orphans
docker compose up -d --build
docker compose ps
curl -fsS https://rscollection.online/health
```

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
rscollection-caddy-1   Up ...   0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
rscollection-app-1     Up ... (healthy)   3000/tcp
rscollection-db-1      Up ... (healthy)   5432/tcp
```

Open the site:

```text
http://localhost
```

Admin page:

```text
http://localhost/admin
```

## Smoke Tests

Run the full local stack validation script:

```bash
./scripts/check-stack.sh
```

The script verifies:

- Docker Compose config is valid
- Caddy, app, and database containers are running/healthy
- `/health` returns database connected
- `/products` returns product data
- at least one database backup exists
- only Caddy is publicly exposed
- production dependencies have no known audit vulnerabilities

Expected final output:

```text
Stack check passed ^.^
```

Manual checks are also useful when debugging individual endpoints.

Check API metadata:

```bash
curl -fsS http://localhost/api
```

Check DB-backed health through Caddy:

```bash
curl -fsS http://localhost/health
curl -fsS http://localhost/api/health
```

Check products:

```bash
curl -fsS http://localhost/products
```

Check featured products:

```bash
curl -fsS http://localhost/featured-products
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

Caddy proxies `/health` through to the app container:

```bash
curl -fsS http://localhost/health
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
docker inspect --format '{{.Name}} {{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' rscollection-caddy-1 rscollection-app-1 rscollection-db-1
```

## Logs

View all service logs:

```bash
docker compose logs
```

Follow all logs live:

```bash
docker compose logs -f
```

View one service:

```bash
docker compose logs app
docker compose logs db
docker compose logs caddy
```

Follow one service live:

```bash
docker compose logs -f app
```

View recent logs only:

```bash
docker compose logs --tail=80 app
docker compose logs --tail=80 db
docker compose logs --tail=80 caddy
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

Backups are written to the local `backups/` directory. The directory placeholder `backups/.gitkeep` is safe to commit, but generated backup files are ignored by Git.

Create a backup with the helper script:

```bash
./scripts/backup-db.sh
```

The script runs `pg_dump` inside the `db` container and writes a timestamped SQL file like:

```text
backups/shop-YYYYMMDD-HHMMSS.sql
```

Verify a backup exists:

```bash
ls -lh backups/
```

Do not commit real backup files if they contain production/customer data.

## Restore Database

Danger: restore changes database data. Only restore when the target database can be overwritten or repaired from another backup.

Restore a backup into the current database:

```bash
./scripts/restore-db.sh backups/shop-YYYYMMDD-HHMMSS.sql
```

For a cleaner local restore, the restore script also supports resetting the `public` schema first:

```bash
./scripts/restore-db.sh --clean backups/shop-YYYYMMDD-HHMMSS.sql
```

The restore script:

- loads `DB_USER` and `DB_NAME` from `.env` when available
- defaults to `postgres` / `shop`
- uses `psql -v ON_ERROR_STOP=1` so SQL restore errors fail loudly
- checks that the backup file exists before restoring

After restoring, check the app:

```bash
docker compose ps
curl -fsS http://localhost/health
curl -fsS http://localhost/products
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
curl -X POST http://localhost/products \
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

### `/health` fails or does not show database connected

Start with the full stack check:

```bash
./scripts/check-stack.sh
```

Then inspect container health:

```bash
docker compose ps
```

Check the app and database logs:

```bash
docker compose logs --tail=80 app
docker compose logs --tail=80 db
```

Confirm only Caddy is published to the host:

```bash
docker compose config | grep -A5 -n "ports:"
```

Common causes:

- app cannot connect to PostgreSQL
- wrong `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_HOST`, or `DB_PORT`
- database container is unhealthy or still starting
- stale database volume from an older schema
- `/health` route changed but Compose/Caddy routing were not updated

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

The app container exposes port `3000` only inside the Docker Compose network. It is not published to the host. The public entrypoint is Caddy on ports `80` and `443`.

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

### Port 80 or 443 already in use

Caddy publishes host ports `80` and `443`. If Compose fails because a port is already allocated, find the conflicting process:

```bash
ss -ltnp | grep -E ':(80|443)'
```

Then either stop the conflicting process or change the host port mapping in Compose:

```yaml
ports:
  - "8081:80"  # local-only temporary override; production must use 80/443 for HTTPS
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
- Caddy reverse proxy with automatic HTTPS in front of the app container
- restart policies
- Docker build optimization
- dependency vulnerability cleanup
- local runbook and troubleshooting documentation

A concise way to describe this project:

> I took an existing Node.js/PostgreSQL online shop and made it reproducible and safer to operate with Docker Compose, PostgreSQL bootstrapping, environment configuration, DB-backed healthchecks, Caddy reverse proxying and automatic HTTPS, restart policies, non-root container runtime, npm audit cleanup, and a practical runbook.
