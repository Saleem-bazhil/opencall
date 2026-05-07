# OpenCall Production Operations

## Reverse Proxy

Use `infra/caddy/Caddyfile` when you want OpenCall to terminate TLS itself.

Run with the optional proxy overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d --build
```

Required proxy env:

```env
APP_DOMAIN=opencall.example.com
ACME_EMAIL=ops@example.com
NEXT_PUBLIC_API_BASE_URL=https://opencall.example.com
```

If Dokploy already provides HTTPS routing, keep using Dokploy's proxy and use the Caddyfile as the equivalent routing reference.

## Backups

Postgres logical backup:

```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl > backups/opencall-$(date +%F-%H%M).dump
```

Uploads volume backup:

```bash
docker run --rm -v opencall-api-uploads:/data -v "$PWD/backups:/backup" alpine tar -czf /backup/opencall-uploads-$(date +%F-%H%M).tar.gz -C /data .
```

Recommended retention:

- hourly for 24 hours
- daily for 14 days
- weekly for 8 weeks
- monthly for 12 months

## Restore

Restore Postgres into an empty database:

```bash
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl < backups/opencall.dump
```

Restore uploads:

```bash
docker run --rm -v opencall-api-uploads:/data -v "$PWD/backups:/backup" alpine sh -c "rm -rf /data/* && tar -xzf /backup/opencall-uploads.tar.gz -C /data"
```

## Monitoring Readiness

Probe these endpoints:

- Web: `GET /`
- API runtime: `GET /api/v1/health/runtime`
- API DB: `GET /api/v1/health/db`

Track:

- container restarts
- Postgres volume free space
- API p95 latency during report generation
- upload failures and HTTP 413/499/502/504 rates
- database backup age and restore-test age

## Production Safety

- Keep `NEXT_PUBLIC_API_BASE_URL` public and browser-reachable.
- Keep Postgres internal-only.
- Prefer proxy-level rate limiting for `/api/v1/auth/login`, `/api/v1/uploads`, and `/admin`.
- Keep CORS scoped to the production web origin if the API is exposed on a separate domain.
- Keep secure cookies enabled behind a trusted proxy.

## Deployment Checklist

- Confirm migrations are present in `infra/postgres/migrations`.
- Confirm `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `ADMIN_COOKIE_SECRET`, and `ADMIN_SESSION_SECRET` are set.
- Confirm `NEXT_PUBLIC_API_BASE_URL` points to the production HTTPS URL.
- Take a Postgres backup before deploy.
- Deploy with `docker compose up -d --build`.
- Verify web, API runtime, and DB health endpoints.
- Upload a small Flex WIP test file in the target environment.

## Rollback Checklist

- Keep the previous image tag available.
- Stop web/API containers, not Postgres.
- Start previous web/API images against the same Postgres and uploads volumes.
- Restore Postgres only if a migration or data mutation must be reversed.
- Verify report history and exports after rollback.

## Upgrade Checklist

- Read migration files before deployment.
- Run a backup.
- Deploy during a low-usage window.
- Watch API logs and healthchecks for the first 10 minutes.
- Run one generate/export workflow after deployment.
