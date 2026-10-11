# Phases

Each phase ends with a usable increment and a completion checklist. Don't start a phase before the previous one is complete. Update `.ai-context/PROJECT_CONTEXT.md` → *Current phase* on completion.

```
1 Foundation → 2 Auth & RBAC → 3 Cities/Stations/Fleet → 4 Booking → 5 Pickup & Return
→ 6 Pricing & Settlement → 7 Dashboards → 8 Notifications → 9 Real OTP+KYC
→ 10 Real Payments → 11 GPS/Telemetry → 12 IoT & Production
```
**MVP = Phases 1–6** (core lifecycle on mocks). Phase 7 makes it operable.

---

## Phase 1 — Project Foundation
**Status: complete.**
- **Objective:** Runnable skeleton of every app + local infra.
- **Features:** repo skeleton; NestJS app with config validation, health endpoint, Swagger at `/api/docs`; Prisma + initial migration (empty/minimal); Postgres + Redis via Docker Compose; Next.js app (landing + health check calling backend); Flutter project created (hello world); `.env.example`; lint/format; CI-less README quick-start.
- **Backend modules:** `Config`, `Prisma`, `Redis`, `Health`.
- **Frontend/mobile:** Next.js scaffold + Tailwind; Flutter scaffold only.
- **Depends on:** nothing.
- **Outcome / done when:** `docker compose up` starts Postgres+Redis; backend boots, `/api/v1/health` OK, Swagger loads; frontend loads and shows backend health; docs quick-start verified from scratch.

## Phase 2 — Authentication & RBAC
**Status: complete.** Backend: 21 unit + 31 e2e tests. Web: responsive website with login, register, profile (mock phone verification), role-aware routes and a staff/admin console layout. Flutter: sign in, register, home, profile with phone verification (27 tests). Decisions and API details: `docs/API.md`, `docs/RBAC.md`, `docs/PROJECT_PLAN.md` (Decision Log). Deferred to Phase 3: city managers creating employees in their cities, FKs on assignments, staff seed data.
- **Objective:** Identity and permissions foundation.
- **Features:** register (customer), login, password hashing, JWT access + rotating refresh tokens, logout, `GET/PATCH /me`; roles; guards + decorators; scope model (city/station assignments); `OtpProvider` interface + mock (phone verification); super-admin seed; seed staff users.
- **Modules:** `Auth`, `Users`, `Rbac` (guards/decorators), `Otp` provider (mock).
- **Frontend:** login/register/profile pages, auth state, role-aware route guard.
- **Change after Phase 3:** customer sign-in became phone + one-time code (new numbers add a name step), registration was removed, and staff keep email + password on a separate `/login/staff` page. See `docs/API.md` and the Decision Log.
- **Depends on:** 1.
- **Outcome:** Four roles can log in; protected endpoints enforce role + scope; e2e tests for auth and RBAC pass.

## Phase 3 — Cities, Stations & Fleet
**Status: complete and fully tested** (see `docs/TESTING.md`). Backend: 70 e2e + 31 unit tests. Flutter: Stations tab (city picker, stations, scooters; 36 tests). Website: public `/stations` browsing; admin console for cities, stations (edit), fleet (add/edit/status/retire), vehicle models, staff; station employee console. Details: `docs/API.md`, `docs/RBAC.md`, `docs/DATABASE.md`.
- **Objective:** Physical network and vehicles.
- **Features:** CRUD cities & stations; vehicle models & vehicles (type=SCOOTER); vehicle status (`AVAILABLE, RESERVED, IN_RIDE, MAINTENANCE, OFFLINE`); station assignment of staff; public browse endpoints (cities → stations → available scooters); seed demo data.
- **Modules:** `Cities`, `Stations`, `Vehicles` (incl. models), staff assignment inside `Users`/`Rbac`.
- **Frontend:** admin/manager screens for cities, stations, fleet; public station & scooter listing.
- **Depends on:** 2.
- **Outcome:** Admin/manager can set up network + fleet within their scope; customers can browse stations and scooters.

## Phase 4 — Customer Booking
**Status: complete and fully tested** (see `docs/TESTING.md`). Backend: pricing plans (+ admin CRUD), quote, bookings with a 10-minute payment hold, overlap-proof availability, idempotent mock payment, cancellation refunds, mock KYC. Website and Flutter: city selector, station → scooter → start/duration → live quote → identity check → payment → confirmation (code + PIN), My bookings, booking detail with cancel. Website console: pricing plans. Decisions: `docs/PROJECT_PLAN.md`.
- **Objective:** Customer can book and pay (simulated).
- **Features:** availability search by station + time window; `PricingPlan` + upfront price quote (rental + deposit); booking creation (reserves vehicle, 10-min payment hold); `PaymentProvider` interface + mock; payment record; booking code + 6-digit PIN; confirmation; history; cancellation; mock KYC gate (`KycProvider` interface + mock, auto-verify) — the minimum needed to satisfy the "verification" step.
- **Modules:** `Bookings`, `Pricing` (quote only — uses engine's rental part), `Payments` (+ mock provider), `Kyc` (mock), availability logic in `Bookings`.
- **Frontend:** station → scooter → duration → quote → mock pay → confirmation; "My bookings".
- **Depends on:** 3.
- **Outcome:** Customer completes browse→book→pay→confirmed and sees code/PIN; cancellation releases the vehicle; overlapping booking attempts are rejected (tested).

## Phase 5 — Pickup & Return
**Status: complete and tested** (see `docs/TESTING.md`; on `feature/pickup-return`, to be merged into `dev` when the user says so). Backend: station desk API under `/station/bookings` (queue with search, handover with PIN + ID check, readings and existing damage, replacement scooter, return to any station of the city with damage and maintenance, no-show with deposit refund), `Rental` and `DamageRecord`; 20 e2e + 7 unit tests. Website: station desk at `/staff` (three queues, search, station filter), booking page with the hand-over, take-back and no-show actions, scooters at `/staff/fleet`. Customers see *On a ride*, *Returned* and *No-show* on the website and in the Flutter app. Details: `docs/API.md`, `docs/RBAC.md`, `docs/DATABASE.md`, `docs/UI.md`, decisions in `docs/PROJECT_PLAN.md`.
- **Objective:** Station operations of the rental.
- **Features:** employee finds booking by code/phone; verifies PIN + customer; records start odometer, battery, pre-existing damage notes; start rental (`CONFIRMED → IN_RIDE`, vehicle `IN_RIDE`); return: end odometer (≥ start), battery, damage record, return station (same city); complete (`IN_RIDE → RETURNED`, vehicle → `AVAILABLE` or `MAINTENANCE` if damaged); no-show handling.
- **Modules:** `Rentals` (pickup/return/inspection/damage), reuses `Bookings`, `Vehicles`.
- **Frontend:** station-employee console (today's pickups, returns, forms).
- **Depends on:** 4.
- **Outcome:** Full physical lifecycle works; invalid transitions rejected; staff can't operate outside their station scope.

## Phase 6 — Pricing & Settlement
**Status: complete and tested; merged into `dev` on 2026-10-09 (role-by-role pass on web and app done).** Pure charge engine (`pricing/settlement-charges.ts`, 33 table-driven tests), `Settlement` + line items made inside the return transaction, automatic per-ride deposit refund with a failed-refund state and staff retry, amounts owed (customer pays on web or app, or at the desk; blocks new bookings), final bill on the booking page of both clients, staff Settlements list. Backend: 22 settlement e2e tests; Flutter: 5 new tests. Not built: waiving charges, review hold on refunds (see decisions in `docs/PROJECT_PLAN.md`).
- **Objective:** Correct money at the end of a rental.
- **Features:** pure pricing engine: included km, excess km, extra-km fee, grace period, late fee, damage fee; deposit reconciliation; refund or outstanding; `Settlement` + line items; auto-generated on return; settlement view for customer & staff; mock refund via PaymentProvider; outstanding flagged on customer (blocks new bookings until cleared).
- **Modules:** `Pricing` (engine), `Settlements`, `Payments` (refund / collect-outstanding, mock).
- **Frontend:** settlement summary on return screen and in booking history.
- **Depends on:** 5.
- **Outcome:** **MVP demo script passes end-to-end.** Engine has table-driven unit tests covering edge cases (exactly on grace boundary, 0 km, deposit < charges, etc.).

## Phase 7 — Operations Dashboard
**Status: complete and tested; merged into `dev` on 2026-10-11.** `GET /dashboard/admin|city/:id|station/:id|customer` (read-only, no new tables, rolling 24 hour / 7 day / 30 day windows); website: `/admin` overview for admins and managers (right now, fleet and utilization, activity, money, a row per city or station), a station strip on the desk, and the customer home with recent rides and money owed; app: the same customer home. Backend: 10 unit + 16 e2e tests; Flutter: 4 new tests.
- **Objective:** Role-specific dashboards.
- **Features:** Super Admin: global counts/revenue/fleet status; City Manager: city bookings, fleet utilization, outstanding settlements; Station Employee: station queue; Customer: home with active rental, history, profile. Read-only aggregate endpoints.
- **Modules:** `Dashboard` (queries only, no new tables).
- **Depends on:** 6.
- **Outcome:** Each role lands on a useful, correctly-scoped dashboard.

## Phase 8 — Notifications
**Status: complete and tested; merged into `dev` on 2026-10-11.** In-app inbox for customers (booking confirmed and cancelled, expired hold, pickup and return reminders, overdue, ride started and complete with the final bill, refund sent, payment received, no-show) on the website (bell + `/notifications`) and in the app (bell + inbox screen), a `NotificationProvider` seam (mock logs), and the minute background job (`modules/jobs`) that expires unpaid holds and sends reminders. Backend: 21 new unit + 28 new e2e tests; Flutter: 9 new tests. Email was **not** built (decision in `docs/PROJECT_PLAN.md`); staff are not notified yet.
- **Objective:** Customers/staff are informed.
- **Features:** `NotificationProvider` interface; mock (log + DB record) and optionally email via SMTP (Mailpit in Docker); events: booking confirmed/cancelled, payment confirmed, pickup reminder, return reminder, settlement/refund; scheduled reminders (Nest schedule or BullMQ on Redis — add only now).
- **Modules:** `Notifications` (+ event listeners).
- **Depends on:** 6 (7 optional).
- **Outcome:** Lifecycle events produce notification records/emails; reminders fire on schedule.

## Phase 9 — Real OTP & KYC
**Status: partly built (vendor-independent half done and tested on `feature/audit-and-kyc`, merged into `dev` when the user says so).** Done: audit trail (`AuditLog`, automatic for every staff write, `/audit-logs`, website `/admin/audit`), identity-check lifecycle (pending, signed webhook `POST /webhooks/kyc`, rejection with reason, 3 tries, support reset, notifications), pending/rejected/retry screens on the website and in the app. **Still to do, needs the owner:** SMS vendor and India DLT registration (start early), identity vendor and its hosted-check redirect, legal review of Aadhaar use, SMS auto-read in the app. Backend: 22 new unit + 28 new e2e tests; Flutter: 6 new tests.
- **Objective:** Replace mocks with compliant providers.
- **Features:** vendor selection (decision gate); real SMS provider behind the already-built customer sign-in flow (the flow, expiry, retries, resend cooldown, send caps and Redis rate limits exist since the phone-login change; this phase only swaps the mock provider, and adds SMS auto-read in the Flutter app). **Start the India DLT sender/template registration early: it takes days to weeks.** real KYC/Aadhaar via third-party provider (redirect/SDK flow, status webhook), KYC states + retry/rejection; consent + audit records; no raw Aadhaar stored.
- **Modules:** new provider implementations; `Kyc` expanded; `AuditLog`.
- **Depends on:** stable MVP; legal/compliance review.
- **Outcome:** Real customers can verify; flipping env var switches mock↔real; no business-code changes.

## Phase 10 — Real Payments
- **Objective:** Real money movement.
- **Features:** gateway selection (decision gate); orders, confirmation, signed webhooks (idempotent), failed payments/retry, refunds + partial refunds, deposit handling (charge vs pre-auth — decision), payment history, reconciliation basics.
- **Modules:** `Payments` real provider, webhook controller.
- **Depends on:** 6; 9 recommended.
- **Outcome:** End-to-end paid rental in gateway test mode, then live.

## Phase 11 — GPS & Telemetry
**Status: complete and tested on `feature/telemetry` (merged into `dev` when the user says so).** `TelemetryProvider` (mock, simulator), `POST /telemetry` with a device key, `TelemetryPoint` history with retention, newest reading in Redis, `GET /fleet/live` and `GET /vehicles/:id/telemetry` scoped per role, and a live map on the website (`/staff/map`). Backend: 29 new unit + 19 new e2e tests. Console-only: no app counterpart. Not built: cross-checking the staff odometer against telemetry (optional in the plan), a real device gateway (Phase 12).
- **Objective:** Live vehicle state.
- **Features:** `TelemetryProvider` interface; simulator (emits location/battery/speed/odometer/ignition); ingest endpoint/stream; `TelemetryPoint` history; latest state in Redis; live fleet map; optional: odometer from telemetry cross-checked with staff entry.
- **Modules:** `Telemetry`.
- **Depends on:** 3 (fleet); 7 for UI placement.
- **Outcome:** Live fleet view driven by simulator; history queryable.

## Phase 12 — IoT & Production
**Status: first half built and tested on `feature/hardening` (merged into `dev` when the user says so).** Done (no decision needed): per-IP rate limits and the client-IP handling (`TRUST_PROXY`), a per-IP sign-in throttle, Swagger off in production, a nonce Content-Security-Policy and security headers on the website, request ids and JSON logs, `/health/live` and `/health/ready`, database backup / restore / verify scripts (tried), Dockerfiles and a production compose file (the whole stack started once), a CI workflow, the unused `@nestjs/mau` removed (audit 9 to 4, the rest is the Prisma CLI), and the wrong-PIN field error. Backend: 16 new unit + 12 new e2e tests. **Waiting for the owner:** the hardware (smart locks, QR stickers, trackers) and whether to build a staff mobile app, the production host, a domain and TLS, monitoring and alerting tools, and the real SMS, identity and payment vendors (Phases 9 and 10), without which the API will not start in production.
**Decision to revisit here:** whether to build a separate staff mobile app (QR scanning, offline station use, smart locks). Until then staff use the website. The customer app never includes staff or admin features.
- **Objective:** Hardware integration and production readiness.
- **Features:** QR vehicle identification; device↔vehicle mapping; smart-lock lock/unlock (`LockProvider`); real-time channel; monitoring, structured logging; security hardening; backups; CI/CD; broader automated tests; production deployment.
- **Depends on:** 11, 10.
- **Outcome:** Production deployment with monitoring and backups.

---

## Open decisions (resolve before the phase shown)
| # | Question | Needed by | Proposed default |
|---|---|---|---|
| 1 | Customer login: password, phone+OTP, or both? | 2 | **Resolved:** customers use phone + OTP only; staff use email + password (mock OTP until Phase 9) |
| 2 | Is Flutter in the MVP, or web only? | 1 | Scaffold only; build after Phase 6 |
| 3 | Booking: hourly, daily, or both? Min/max duration? | 4 | Hourly with min 1h; daily = 24h plan |
| 4 | Does a booking reserve a specific vehicle or a model at a station? | 4 | Specific vehicle |
| 5 | Cancellation policy / refund windows | 4 | Full refund > 2h before start |
| 6 | Late fee: per started hour or per minute? Grace length? | 6 | Per started hour, 15-min grace |
| 7 | Deposit amount: flat or per model? | 4 | Per `PricingPlan` |
| 8 | Cross-station / cross-city returns and fees | 5 | Same city, any station, no fee |
| 9 | Damage fee: flat entry by staff, or catalogue? | 5 | Flat amount entered by staff |
| 10 | How is an outstanding amount collected? | 6 | Flagged; blocks new bookings; mock "pay outstanding" |
| 11 | KYC/OTP/payment vendors; legal review of Aadhaar use | 9/10 | Decide at phase start |
| 12 | Staff multi-station / multi-city assignment? | 3 | Yes, via `StaffAssignment` rows |
| 13 | Languages/i18n, GST invoices | later | English only, no invoices |
| 14 | Git hosting & branching | 1 | **Resolved (2026-10-04):** `main` (stable) and `dev` (integration); work on `feature/*` branches cut from `dev`, merged into `dev` when done, `dev` into `main` when a batch is stable; no remote yet. See `docs/DEV_SETUP.md` §9 |
