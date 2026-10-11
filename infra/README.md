# Infra

Local development infrastructure (Docker Compose project name `rove`).

| Service | Container | Host port | Notes |
|---|---|---|---|
| PostgreSQL 16 | `rove-postgres` | **5442** | user/password/db = `rove` (dev only) |
| Redis 7 | `rove-redis` | **6389** | |

Host ports are deliberately non-default (5442/6389) so Rove doesn't clash with other local Postgres/Redis stacks. Override with `POSTGRES_PORT` / `REDIS_PORT` in the root `.env` (and keep `DATABASE_URL` / `REDIS_URL` in sync).

```bash
cd infra
docker compose up -d        # start
docker compose ps           # status (healthchecks)
docker compose down         # stop (data kept in volumes)
docker compose down -v      # stop and DELETE data
```

Backend and frontend run on the host in development. `docker-compose.prod.yml` is the production-style stack (Postgres, Redis, a migration job, the API and the website; see `docs/DEV_SETUP.md` §5b and `production.env.example`). (No `mailpit`: email notifications were not built in Phase 8.) Full run guide: `docs/DEV_SETUP.md`.
