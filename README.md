# E-Scooter Rental Platform

Station-based e-scooter rental: browse → book → pay → pick up → ride → return → settle.
Modular-monolith NestJS backend, Next.js web, Flutter mobile. Mock integrations first; real OTP/KYC/payments/IoT in later phases.

**Status:** Phases 1-3 complete (auth and roles, cities, stations, fleet, admin console, customer app browsing), plus phone + OTP sign-in for customers. Next: Phase 4 — Booking. See `docs/PHASES.md`.

**Branches:** `main` is stable; `dev` collects finished features; changes are made on `feature/*` branches cut from `dev`. `dev` is merged into `main` once a batch of features is stable (see `docs/DEV_SETUP.md` §9).

## Layout
| Path | What |
|---|---|
| `backend/` | NestJS + Prisma API (`src/`, `prisma/`, `test/`) |
| `frontend/` | Next.js + Tailwind web app |
| `flutter/` | Flutter mobile app (scaffolded in Phase 1, built after MVP backend) |
| `infra/` | Docker Compose for Postgres + Redis |
| `docs/` | Plan, phases, architecture, DB, API, RBAC |
| `.ai-context/` | Project context + rules for Claude Code sessions |

## Start here
1. `.ai-context/PROJECT_CONTEXT.md` — rules & context
2. `docs/PHASES.md` — roadmap and current phase
3. `docs/ARCHITECTURE.md` — how it fits together

## Quick start
Full step-by-step guide (prerequisites, which terminal, Flutter modes, troubleshooting): **[docs/DEV_SETUP.md](docs/DEV_SETUP.md)**.

```bash
cp .env.example .env
cd infra && docker compose up -d              # Postgres :5442, Redis :6389
cd ../backend && npm install && npm run prisma:deploy && npm run start:dev
# new terminal:  cd frontend && npm install && npm run dev
# new terminal:  cd flutter && flutter emulators --launch Rove_Pixel && flutter run
```
API health http://localhost:3001/api/v1/health · Swagger http://localhost:3001/api/docs · Web http://localhost:3000
