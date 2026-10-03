# Project Context — E-Scooter Rental Platform

> Read this file first in every Claude Code session. Then read `docs/PHASES.md` and find the **current phase**.

## Brand (temporary)
Working brand name: **Rove** (placeholder, not trademark-checked). Keep it in one config constant (`APP_NAME`) on web/Flutter so renaming is a one-line change. Don't bake it into code identifiers, package names, or DB names.

## What this is
A station-based e-scooter rental platform. Customers pick a station, browse scooters, verify, book, pay (rental + security deposit), pick up at a station, ride, return to a station, and receive a settlement (deposit refund or outstanding amount).
E-scooters only for now; bikes/cars must stay *possible* but are NOT built.

## Current phase
**Phases 1 (Foundation) and 2 (Authentication & RBAC) complete. Phase 3 (Cities, Stations & Fleet) complete (backend, website, Flutter browsing). Next: Phase 4 (Customer Booking). A full test pass was done after Phase 3: see `docs/TESTING.md` for how to run every suite and the QA scripts in `tools/qa/`.**
Phase 3 facts: management reads live under `/manage/*`, writes on resource paths; public browse endpoints are `@Public()`; every management service calls `ScopeService` (`assertStationIdAccess`, `stationFilter`); vehicle status rules are in `modules/vehicles/vehicle-status.ts`; admin web pages use server actions in `frontend/src/app/actions/admin.ts` and `<ActionForm>`; e2e test data uses the `e2e-` prefix and is cleaned up (seed data is never touched).
Phase 2 facts: global `JwtAuthGuard` + `RolesGuard` (`@Public()`, `@Roles()`, `@CurrentUser()`), `ScopeService` for city/station scope, opaque rotating refresh tokens, mock OTP behind `OTP_PROVIDER`, uniform error body with stable `code`, seed users via `npm run prisma:seed`. Flutter auth (sign in/register/profile/OTP, secure token storage, auto refresh) is done too. Web auth: httpOnly cookies set by server actions, `src/proxy.ts` refreshes tokens and redirects by role, pages re-check with `requireUser/requireRole` (`src/lib/dal.ts`). `StaffAssignment` city/station ids have no FK until Phase 3 adds those tables.
Foundation facts: NestJS 12 is ESM (`.js` import suffixes, explicit `@Inject()`), Prisma 7 (URL in `prisma.config.ts`, client generated to `backend/src/generated/prisma`), Vitest + oxlint, Next.js 16 (read `frontend/AGENTS.md`), Docker host ports Postgres 5442 / Redis 6389, backend 3001, web 3000. Run commands: `docs/DEV_SETUP.md`.
Update this line whenever a phase completes.

## Roles
`SUPER_ADMIN` (global) · `CITY_MANAGER` (one or more cities) · `STATION_EMPLOYEE` (one or more stations) · `CUSTOMER` (own data only). See `docs/RBAC.md`.

## Stack
- Backend: TypeScript, NestJS, Prisma, PostgreSQL, Redis — **modular monolith** (no microservices)
- Web: Next.js + TypeScript + Tailwind
- Mobile: Flutter/Dart (customer app comes after the web MVP flow works)
- Infra: Docker Compose · Docs: Swagger/OpenAPI · Auth: JWT (access + refresh)

## Repo layout
`backend/` NestJS API · `frontend/` Next.js · `flutter/` mobile · `infra/` docker compose · `docs/` plan & design docs · `.ai-context/` this file.

## UI direction
**Modern, minimal, simple, clean.** The website is a responsive website (desktop top navigation + wide layouts; phones get a compact header and bottom tabs) used by customers, station employees, city managers and admins; staff/admin use a sidebar console. The Flutter app is a separate native **customer-only** app; station employees, city managers and admins use the website, and a separate staff app is planned for later (not now). Both share the backend API, the design tokens and the screen specs, but are not pixel copies. Neutral palette + one green accent, near-black primary buttons, lots of whitespace. Tailwind. Clients never compute money. Full guide: `docs/UI.md`.

## Development rules
1. Build phase by phase. Do **not** implement future-phase features early.
2. Before changing code: read this file, `docs/PHASES.md`, and inspect the existing repo.
3. Keep changes focused on the current phase; don't touch unrelated modules.
4. Small, testable increments. Add tests for business logic (pricing engine especially).
5. Do not add a dependency unless it is actually needed now.
6. Update docs when an architectural/product decision changes (and log it in `docs/PROJECT_PLAN.md` → Decision Log).
7. If a requirement is ambiguous, state the ambiguity and pick the simplest reasonable option; record it in the Decision Log.
8. Keep it simple: no microservices, no CQRS/event-sourcing, no premature optimization.

## Architecture rules
- Every external service (OTP, KYC, payment, notification, telemetry) is behind an **interface + injection token**. Mock implementation is the default. Business modules depend on the interface only. Provider is chosen by env var (e.g. `PAYMENT_PROVIDER=mock`). See `docs/ARCHITECTURE.md` §Provider abstraction.
- **Money** is stored as integer minor units (paise) in `INR`. Never use floats for money.
- **Pricing engine** is a pure, framework-free function (`pricing/` — input → breakdown). No DB or Nest imports inside it.
- **Authorization** is enforced by guards + a scope check (city/station) in services, never only in the UI.
- **State machines** (Booking, Vehicle) change state only through service methods that validate transitions.
- Vehicle is generic: `Vehicle.type` enum (only `SCOOTER` now) + `VehicleModel`. No scooter-only columns on `Vehicle` itself that would block bikes/cars.
- Timestamps in UTC; city has an IANA timezone for display/late-fee day boundaries.

## Security / privacy rules
- **Never store raw Aadhaar numbers**, OTPs in plaintext, card/UPI details, or full provider payloads containing PII. Store only provider reference IDs, status, timestamps, consent record.
- Passwords: argon2/bcrypt hash. Refresh tokens: stored hashed, rotated.
- No secrets in the repo; `.env.example` lists variable names only.
- Mock OTP code is accepted only when `NODE_ENV !== production`.

## Mock vs real
Phases 1–8 use mocks for OTP, KYC, payment, notification, telemetry. Real providers arrive in Phases 9–12. Don't pick or integrate a vendor before its phase.

## Conventions
- Backend module = `src/modules/<name>/{controller,service,dto,module}`; shared code in `src/common/`; provider interfaces in `src/providers/<kind>/`.
- REST, JSON, `/api/v1` prefix, Swagger at `/api/docs`. DTOs validated with `class-validator`.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`).
- Tests: Jest (unit + e2e) in backend. A phase is "done" only when its completion checklist in `docs/PHASES.md` is satisfied.
