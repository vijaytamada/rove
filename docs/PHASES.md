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
- **Depends on:** 1.
- **Outcome:** Four roles can log in; protected endpoints enforce role + scope; e2e tests for auth and RBAC pass.

## Phase 3 — Cities, Stations & Fleet
- **Objective:** Physical network and vehicles.
- **Features:** CRUD cities & stations; vehicle models & vehicles (type=SCOOTER); vehicle status (`AVAILABLE, RESERVED, IN_RIDE, MAINTENANCE, OFFLINE`); station assignment of staff; public browse endpoints (cities → stations → available scooters); seed demo data.
- **Modules:** `Cities`, `Stations`, `Vehicles` (incl. models), staff assignment inside `Users`/`Rbac`.
- **Frontend:** admin/manager screens for cities, stations, fleet; public station & scooter listing.
- **Depends on:** 2.
- **Outcome:** Admin/manager can set up network + fleet within their scope; customers can browse stations and scooters.

## Phase 4 — Customer Booking
- **Objective:** Customer can book and pay (simulated).
- **Features:** availability search by station + time window; `PricingPlan` + upfront price quote (rental + deposit); booking creation (reserves vehicle, 10-min payment hold); `PaymentProvider` interface + mock; payment record; booking code + 6-digit PIN; confirmation; history; cancellation; mock KYC gate (`KycProvider` interface + mock, auto-verify) — the minimum needed to satisfy the "verification" step.
- **Modules:** `Bookings`, `Pricing` (quote only — uses engine's rental part), `Payments` (+ mock provider), `Kyc` (mock), availability logic in `Bookings`.
- **Frontend:** station → scooter → duration → quote → mock pay → confirmation; "My bookings".
- **Depends on:** 3.
- **Outcome:** Customer completes browse→book→pay→confirmed and sees code/PIN; cancellation releases the vehicle; overlapping booking attempts are rejected (tested).

## Phase 5 — Pickup & Return
- **Objective:** Station operations of the rental.
- **Features:** employee finds booking by code/phone; verifies PIN + customer; records start odometer, battery, pre-existing damage notes; start rental (`CONFIRMED → IN_RIDE`, vehicle `IN_RIDE`); return: end odometer (≥ start), battery, damage record, return station (same city); complete (`IN_RIDE → RETURNED`, vehicle → `AVAILABLE` or `MAINTENANCE` if damaged); no-show handling.
- **Modules:** `Rentals` (pickup/return/inspection/damage), reuses `Bookings`, `Vehicles`.
- **Frontend:** station-employee console (today's pickups, returns, forms).
- **Depends on:** 4.
- **Outcome:** Full physical lifecycle works; invalid transitions rejected; staff can't operate outside their station scope.

## Phase 6 — Pricing & Settlement
- **Objective:** Correct money at the end of a rental.
- **Features:** pure pricing engine: included km, excess km, extra-km fee, grace period, late fee, damage fee; deposit reconciliation; refund or outstanding; `Settlement` + line items; auto-generated on return; settlement view for customer & staff; mock refund via PaymentProvider; outstanding flagged on customer (blocks new bookings until cleared).
- **Modules:** `Pricing` (engine), `Settlements`, `Payments` (refund / collect-outstanding, mock).
- **Frontend:** settlement summary on return screen and in booking history.
- **Depends on:** 5.
- **Outcome:** **MVP demo script passes end-to-end.** Engine has table-driven unit tests covering edge cases (exactly on grace boundary, 0 km, deposit < charges, etc.).

## Phase 7 — Operations Dashboard
- **Objective:** Role-specific dashboards.
- **Features:** Super Admin: global counts/revenue/fleet status; City Manager: city bookings, fleet utilization, outstanding settlements; Station Employee: station queue; Customer: home with active rental, history, profile. Read-only aggregate endpoints.
- **Modules:** `Dashboard` (queries only, no new tables).
- **Depends on:** 6.
- **Outcome:** Each role lands on a useful, correctly-scoped dashboard.

## Phase 8 — Notifications
- **Objective:** Customers/staff are informed.
- **Features:** `NotificationProvider` interface; mock (log + DB record) and optionally email via SMTP (Mailpit in Docker); events: booking confirmed/cancelled, payment confirmed, pickup reminder, return reminder, settlement/refund; scheduled reminders (Nest schedule or BullMQ on Redis — add only now).
- **Modules:** `Notifications` (+ event listeners).
- **Depends on:** 6 (7 optional).
- **Outcome:** Lifecycle events produce notification records/emails; reminders fire on schedule.

## Phase 9 — Real OTP & KYC
- **Objective:** Replace mocks with compliant providers.
- **Features:** vendor selection (decision gate); real OTP (expiry, retries, resend, rate limiting via Redis); real KYC/Aadhaar via third-party provider (redirect/SDK flow, status webhook), KYC states + retry/rejection; consent + audit records; no raw Aadhaar stored.
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
- **Objective:** Live vehicle state.
- **Features:** `TelemetryProvider` interface; simulator (emits location/battery/speed/odometer/ignition); ingest endpoint/stream; `TelemetryPoint` history; latest state in Redis; live fleet map; optional: odometer from telemetry cross-checked with staff entry.
- **Modules:** `Telemetry`.
- **Depends on:** 3 (fleet); 7 for UI placement.
- **Outcome:** Live fleet view driven by simulator; history queryable.

## Phase 12 — IoT & Production
**Decision to revisit here:** whether to build a separate staff mobile app (QR scanning, offline station use, smart locks). Until then staff use the website. The customer app never includes staff or admin features.
- **Objective:** Hardware integration and production readiness.
- **Features:** QR vehicle identification; device↔vehicle mapping; smart-lock lock/unlock (`LockProvider`); real-time channel; monitoring, structured logging; security hardening; backups; CI/CD; broader automated tests; production deployment.
- **Depends on:** 11, 10.
- **Outcome:** Production deployment with monitoring and backups.

---

## Open decisions (resolve before the phase shown)
| # | Question | Needed by | Proposed default |
|---|---|---|---|
| 1 | Customer login: password, phone+OTP, or both? | 2 | Email/phone + password; mock OTP verifies phone |
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
| 14 | Git hosting & branching | 1 | `git init`, trunk-based with short feature branches |
