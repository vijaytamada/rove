# Project Context — E-Scooter Rental Platform

> Read this file first in every Claude Code session. Then read `docs/PHASES.md` and find the **current phase**.

## Brand (temporary)
Working brand name: **Rove** (placeholder, not trademark-checked). Keep it in one config constant (`APP_NAME`) on web/Flutter so renaming is a one-line change. Don't bake it into code identifiers, package names, or DB names.

## What this is
A station-based e-scooter rental platform. Customers pick a station, browse scooters, verify, book, pay (rental + security deposit), pick up at a station, ride, return to a station, and receive a settlement (deposit refund or outstanding amount).
E-scooters only for now; bikes/cars must stay *possible* but are NOT built.

## Current phase
**Phases 1-6 complete (Phase 5 is merged into `dev`; Phase 6, Pricing & Settlement, is on `feature/settlement` until the user asks for the merge into `dev`). Next: Phase 7 (Operations dashboard). See `docs/TESTING.md` for how to run every suite and the QA scripts in `tools/qa/`.**
Phase 6 facts: the bill is made by the pure `calculateFinalCharges` (`pricing/settlement-charges.ts`) inside the return transaction (`SettlementsService.createInTx`); the refund of what is left of the deposit is automatic and per ride right after the commit (`finishRefund`), no batch; a failed refund leaves the settlement `REFUND_PENDING` and staff retry it (`POST /settlements/:id/retry-refund`); a booking is `RETURNED` while the refund is pending and `SETTLED` after (or when nothing is owed back); an amount owed is `OUTSTANDING` on the settlement, blocks new bookings (`OUTSTANDING_BALANCE`) and is paid by the customer (`/bookings/:id/settlement/pay`) or at the desk (`/settlements/:id/collect`); one successful `DEPOSIT_RETURN` refund per payment is a database index; cancelled and no-show bookings have no settlement; waiving charges and a refund review hold are not built. Web: `/bookings/[id]/settle`, `/staff/settlements`, `<SettlementSummary>`; app: `SettleScreen`, `SettlementSummary`.
Phase 5 facts: the station desk lives under `/station/bookings` (`modules/rentals`); the rules are pure functions in `rental-rules.ts` (pickup opens 15 min before the start, no-show after 60 min, 5 wrong PINs lock pickup for 15 min); staff responses carry `actions` with a plain-language reason and never the PIN; a scooter that is out has `Vehicle.stationId = null`; a booking that is out is visible to staff of its whole city, anything else only to its stations (404 otherwise); no-show refunds the deposit and keeps the rental; damage fees are recorded but only charged in Phase 6; the web desk uses server actions in `frontend/src/app/actions/desk.ts` and forms in `components/desk/`.
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

## Current state (update at the end of every task)
Phases 1-6 complete (**Phase 6 settlement on 2026-10-08**: final bill with extra km, late fee and damage taken from the deposit, automatic deposit refund or an amount owed that blocks booking until paid, on web, app and the station console; **Phase 5 pickup and return on 2026-10-08**: station desk on the website with hand-over, take-back and no-show, ride states for customers on web and Flutter; foundation, auth + roles, cities/stations/vehicle models/fleet, admin console, customer app station browsing, and **Phase 4 booking** on 2026-10-08: pricing plans, quote, 10-minute hold, mock payment + KYC, cancellation refunds, My bookings, city popup selector, admin pricing page; website and Flutter in sync) plus phone + OTP sign-in for customers (backend, website, Flutter, QA scripts, docs). Admin console UI was reworked on 2026-10-04 (full-width lists, modal add forms, role-aware staff form, card tables on phones) and one-time codes are entered in six boxes on web and Flutter. The profile is read-only with pencil buttons, and a phone change is a two-step verified flow (new number, then code; saved only after the code is right) on web and Flutter. Sign-in screens were simplified: title "Let's get you riding", fixed `+91` prefix + 10 digits (India only for now), button "Continue". Tests at last full run (2026-10-08): backend 94 unit + 163 e2e, Flutter 80, QA `sweep` 128/128, `pages` 200 + 19 content checks, `race` 6/6, website lint + build clean, Android emulator walkthrough of the whole booking flow. Branches: `main` (stable) and `dev` (integration; `dev` runs ahead of `main`); work happens on `feature/*` branches cut from `dev`, merged into `dev` when done, and `dev` into `main` when a batch is stable; no git remote yet. **Next:** merge Phase 6 into `dev` when asked, then Phase 7 (role dashboards). Open: waiving or adjusting a charge, a refund review hold, real gateway refund webhooks (Phase 10). Open items: add a git remote when the user provides one; optional non-India phone numbers; real SMS provider and India DLT registration (Phase 9).

## Repo layout
`backend/` NestJS API · `frontend/` Next.js · `flutter/` mobile · `infra/` docker compose · `docs/` plan & design docs · `.ai-context/` this file.

## Auth model: phone + OTP for customers, email + password for staff
Customers sign in with phone number + one-time code (`/auth/phone/request|verify|signup`; a new number gets a name step and an account; mock code `123456` until Phase 9). Staff, city managers and admins sign in with email + password (`/auth/login`, website `/login/staff`). No public registration; customers need no email or password (optional email deferred to Phase 8). `User.email`/`passwordHash` are nullable with CHECKs (staff need both, customers need a phone). Code limits and Redis keys are documented in `modules/auth/otp.service.ts`; API in `docs/API.md`, decisions in `docs/PROJECT_PLAN.md`. Backend, website, Flutter app, QA scripts and docs are all done and merged into `main`.

## UI direction
**Modern, minimal, simple, clean.** The website is a responsive website (desktop top navigation + wide layouts; phones get a compact header and bottom tabs) used by customers, station employees, city managers and admins; staff/admin use a sidebar console. The Flutter app is a separate native **customer-only** app; station employees, city managers and admins use the website, and a separate staff app is planned for later (not now). Both share the backend API, the design tokens and the screen specs, but are not pixel copies. Neutral palette + one green accent, near-black primary buttons, lots of whitespace. Tailwind. Clients never compute money. Full guide: `docs/UI.md`.

## Branches
`main` = stable, released state. `dev` = integration branch that collects finished features. They were level on 2026-10-04 and `dev` is expected to run ahead of `main`. Every change is made on a feature branch created from `dev` (`feature/<short-name>`); never commit directly to `dev` or `main`. When a feature is finished (its tests pass, docs updated), merge it into `dev` with `--no-ff` and delete the feature branch. Only when several features on `dev` are stable together (full re-test in `docs/TESTING.md` passes) and the user says so, merge `dev` into `main` (`--no-ff`; a fast-forward if `main` has nothing new). Each merge happens only when the user asks. No remote is configured yet, so nothing is pushed.

## Development rules
1. Build phase by phase. Do **not** implement future-phase features early.
2. Before changing code: read this file, `docs/PHASES.md`, and inspect the existing repo.
3. Keep changes focused on the current phase; don't touch unrelated modules.
4. Small, testable increments. Add tests for business logic (pricing engine especially).
5. Do not add a dependency unless it is actually needed now.
6. **Keep the docs current with every piece of work, in the same commit as the code, so no information is lost between sessions.** Update whatever the change touches: this file (current state, auth model, branches), `docs/PHASES.md` (status), `docs/API.md` (endpoints, error codes), `docs/DATABASE.md`, `docs/RBAC.md`, `docs/UI.md`, `docs/ARCHITECTURE.md`, `docs/DEV_SETUP.md`, `docs/TESTING.md` (test counts, new findings, known limitations), the READMEs, and add every product/architecture decision to `docs/PROJECT_PLAN.md` → Decision Log. Before finishing a task, check these for stale statements (search for the old behaviour), not just the file you expected.
   Keep a one-paragraph "Current state" below up to date: what works, what is in progress, what is next.
7. **Keep the website and the Flutter app in sync.** A customer-facing logic or UI change on one is made on the other in the same task (same flow, wording, validation, layout intent), with tests on both. The staff/admin console is web-only by design, so console-only changes need no app counterpart. Verify the app with `flutter analyze` + `flutter test`, and on the Android emulator (`Rove_Pixel`) for anything visual.
8. If a requirement is ambiguous, state the ambiguity and pick the simplest reasonable option; record it in the Decision Log.
9. Keep it simple: no microservices, no CQRS/event-sourcing, no premature optimization.

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
