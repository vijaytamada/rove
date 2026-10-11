# Backend

NestJS 12 (ESM) + Prisma 7 + PostgreSQL + Redis modular monolith. See `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/DEV_SETUP.md`.

## Run
```bash
# repo root: cp .env.example .env ; cd infra && docker compose up -d
cd backend
npm install
npm run prisma:deploy      # apply migrations
npm run start:dev          # http://localhost:3001
```
- Health: `GET /api/v1/health` (database + Redis status)
- Swagger UI: `/api/docs` · OpenAPI JSON: `/api/docs-json`

## Scripts
| Script | What |
|---|---|
| `npm run start:dev` | watch mode |
| `npm run build` | `prisma generate` + `nest build` |
| `npm test` | unit tests (Vitest) |
| `npm run test:e2e` | e2e tests (needs Postgres + Redis running) |
| `npm run lint` | oxlint |
| `npm run prisma:migrate` | create/apply a dev migration |
| `npm run prisma:deploy` | apply existing migrations |

## Layout
`src/config` env validation (zod) · `src/infra` Prisma + Redis services · `src/modules/<name>` feature modules · `src/providers` mock/real providers · `src/modules/pricing` plans + the pure quote function (`rental-quote.ts`; the settlement engine joins it in Phase 6) · `prisma/` schema + migrations · `test/` e2e.

## Notes
- ESM project: relative imports use the `.js` suffix (`import { X } from './x.js'`).
- Prisma 7: connection URL lives in `prisma.config.ts` (reads root `.env`); the client is generated to `src/generated/prisma` (git-ignored) and uses the `pg` driver adapter.
- Injection: use explicit `@Inject(Token)` on constructor params (Vitest doesn't emit decorator metadata).
- Config loads from `.env` or the repo-root `.env`; the app fails fast on invalid config.
