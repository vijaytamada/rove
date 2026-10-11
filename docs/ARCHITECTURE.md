# Architecture

## 1. Shape
```
 Next.js web ─┐                         ┌─ PostgreSQL (Prisma)
 Flutter app ─┼─ REST /api/v1 (JWT) ─ NestJS modular monolith ─┤
 (later IoT) ─┘                         └─ Redis (cache, rate-limit, later telemetry/queues)
```
One deployable backend. Modules communicate through injected services (no HTTP between modules). A module may be extracted later only if there is a proven need.

## 2. Backend layout
```
backend/src/
  main.ts, app.module.ts
  config/            env validation (zod or class-validator)
  common/            guards, decorators, filters, pipes, pagination, money utils
  infra/             prisma/, redis/ services
  providers/         <kind>/{interface.ts, tokens.ts, mock.provider.ts, <real>.provider.ts, <kind>.module.ts}
  modules/
    auth/ users/ rbac/ cities/ stations/ vehicles/
    bookings/ rentals/ payments/ settlements/ kyc/ notifications/ dashboard/ telemetry/
  pricing/           PURE engine — no Nest/Prisma imports
backend/prisma/      schema.prisma, migrations/, seed.ts
backend/test/        e2e tests
```

## 3. Modules (initial)
| Module | Phase | Responsibility |
|---|---|---|
| Config / Prisma / Redis / Health | 1 | Infrastructure |
| Auth | 2 | Customer phone + OTP sign-in and sign-up, staff email + password login, JWT, refresh, logout |
| Users | 2 | Profile, staff management, staff assignments |
| Rbac | 2 | Roles, guards, scope checks (`@Roles`, `@Scoped`) |
| Cities | 3 | City CRUD, timezone |
| Stations | 3 | Station CRUD, location, capacity, status |
| Vehicles | 3 | VehicleModel, Vehicle, status, availability queries |
| Bookings | 4 | Quote→booking, code/PIN, state machine, history, cancel, expiry |
| Payments | 4/6/10 | Payment/refund records, uses `PaymentProvider` |
| Kyc | 4 (mock) / 9 | KYC status, uses `KycProvider` |
| Rentals | 5 | Pickup, return, odometer/battery, damage |
| Pricing (engine) | 4/6 | Pure calc: quote + final charges |
| Settlements | 6 | Persist settlement, deposit reconciliation, refund/outstanding |
| Dashboard | 7 | Read-only aggregates |
| Notifications | 8 | Event → notification via `NotificationProvider` |
| Telemetry | 11 | Ingest, latest state, history |
| AuditLog | 9 | Sensitive-action audit trail (can start earlier as a small helper) |

Dependency direction (no cycles): `Rentals → Bookings → Vehicles/Pricing/Payments/Kyc`; `Settlements → Pricing/Payments/Rentals`; `Dashboard → everything (read-only)`; `Bookings`, `Rentals` and `Settlements` call `NotificationEventsService` (in `Notifications`, which depends only on Prisma and the provider) after their own work is saved; every call is safe to repeat and never throws. A plain call was chosen over an event bus: one process, one database, and the callers must wait for the message to be stored so tests (and the customer's next screen) see it. `Jobs` (`modules/jobs`) runs the minute job over `Notifications`.

## 4. Provider abstraction
Pattern: interface + injection token + env-selected implementation. Business code injects the token.

```ts
// providers/payment/payment.provider.ts
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export interface PaymentProvider {
  createPayment(i: { amount: number; reference: string; customerId: string }): Promise<{ providerRef: string; status: 'PENDING'|'SUCCEEDED'|'FAILED'; checkoutUrl?: string }>;
  getPayment(providerRef: string): Promise<{ status: 'PENDING'|'SUCCEEDED'|'FAILED' }>;
  refund(i: { providerRef: string; amount: number; reason?: string }): Promise<{ refundRef: string; status: 'SUCCEEDED'|'FAILED'|'PENDING' }>;
}
// module: { provide: PAYMENT_PROVIDER, useClass: process.env.PAYMENT_PROVIDER === 'mock' ? MockPaymentProvider : RazorpayLike... }
```
Use `useFactory` with `ConfigService`; unknown value → startup error.

| Interface | Methods (initial) | Mock behavior | Real later |
|---|---|---|---|
| `OtpProvider` | `send(phone, purpose) → {challengeId}`, `verify(challengeId, code) → boolean` | Logs code; accepts `123456` (non-prod only) | SMS OTP vendor (Ph. 9). Expiry/retries/rate-limit live in our `Otp` service, not the provider |
| `KycProvider` | `start(userId, consentRef) → {sessionId, redirectUrl?}`, `getResult(sessionId) → {status, providerRef}`; webhook parser later | Immediately `VERIFIED` (magic name `REJECT` → `REJECTED` for testing) | Compliant Aadhaar/KYC vendor (Ph. 9). Returns status + opaque refs only |
| `PaymentProvider` | see above | Instant success; `amount % 100 == 99` or a flag → failure for tests | Gateway (Ph. 10); adds webhook verification |
| `NotificationProvider` | `deliver({userId, phone, title, body})` (the in-app copy is stored by `NotificationsService`; the provider only delivers outside the app) | Logs the message | SMS (Ph. 9, needs India DLT templates), push, email |
| `TelemetryProvider` | `start(host)` / `stop()`, where `host` offers `listVehicles()` and `ingest(readings)` (so a simulator reads the fleet and a real gateway just calls `ingest` as messages arrive) | `mock` does nothing; `simulator` moves scooters on a ride | MQTT/HTTP device gateway (Ph. 12) |
| `LockProvider` (Ph. 12) | `lock(vehicleId)`, `unlock(vehicleId)` | No-op success | Smart-lock vendor |

Rules: providers return normalized domain types (never vendor payloads); persist only `providerRef` + status; every provider call is idempotent via our `reference`; mock and real share the same contract tests.

## 5. State machines
**Booking:** `PENDING_PAYMENT → CONFIRMED → IN_RIDE → RETURNED → SETTLED`; side exits: `PENDING_PAYMENT → EXPIRED|CANCELLED`, `CONFIRMED → CANCELLED|NO_SHOW`. (`SETTLED` with outstanding amount keeps `Settlement.status=OUTSTANDING` until cleared.)
**Vehicle:** `AVAILABLE ⇄ RESERVED → IN_RIDE → AVAILABLE|MAINTENANCE`; `MAINTENANCE|OFFLINE ⇄ AVAILABLE` (manager). Availability for a time window is derived from overlapping active bookings, not only from the status column; `RESERVED`/`IN_RIDE` reflect *now*.
**Payment:** `PENDING → SUCCEEDED|FAILED`; refunds are separate records.

Transitions are implemented in one service method each, inside a DB transaction, validating current state.

## 6. Key flows
1. **Booking:** quote (engine) → create `Booking(PENDING_PAYMENT)` + hold vehicle in a transaction (overlap check, row lock / unique constraint) → `PaymentProvider.createPayment` (rental + deposit) → on success `CONFIRMED`, generate code + PIN → emit `booking.confirmed`.
2. **Pickup:** employee (scoped to station) looks up code → verify PIN, KYC, payment → record odometer/battery/notes → `Rental` created, booking `IN_RIDE`, vehicle `IN_RIDE`.
3. **Return:** employee records end odometer/battery/damage/return station → booking `RETURNED`, vehicle `AVAILABLE|MAINTENANCE`, vehicle's `stationId` = return station → engine computes final charges → `Settlement` → refund (provider) or outstanding → booking `SETTLED`.

## 7. Pricing engine
`pricing/rental-quote.ts`: `quoteRental(plan, hours)`. `pricing/settlement-charges.ts`: `calculateFinalCharges(plan, ride)` → `{ lines[], totalCharges, depositHeld, refundAmount, outstandingAmount, outcome }`; `settlements/settlements.service.ts` stores the result and moves the money. Inputs are plain data (integers, Date); no I/O. Table-driven Vitest tests. Plan values are **snapshotted onto the booking** at creation so later plan edits don't change old bookings.

## 8. Cross-cutting
- **Auth:** access JWT (15 min) + refresh token (7–30 days, hashed in DB, rotated, revocable).
- **Validation:** global `ValidationPipe` (whitelist, forbid unknown).
- **Errors:** uniform JSON `{ statusCode, code, message, details? }`; stable `code` strings for the frontend.
- **Pagination:** `?page&limit` (default 20, max 100) → `{ items, total, page, limit }`.
- **Redis:** OTP attempt counters and send caps, login failure counters, per-IP request limits (`rl:*`), the minute job's lock, the newest telemetry reading per scooter. No data lives only in Redis that cannot be rebuilt.
- **Logging and tracing:** every request gets an id (`X-Request-Id`, also in error bodies); in production the logs are JSON lines (one per request with the route pattern, status, duration and user id, plus the application's own messages) for a log collector. Health: `/health` (report), `/health/live`, `/health/ready` (503 when a dependency is down).
- **Capacity (measured on one laptop, see `docs/TESTING.md` *Load test*):** one backend process is CPU-bound at roughly 200-600 requests a second depending on the endpoint, mostly the cost of database statements, so hot reads load their relations in one statement (`relationJoins`) and the dashboards use a fixed number of grouped queries with a short cache. The website renders about 40-50 pages a second per instance. Scaling out means more API processes (stateless) and more website processes behind a proxy, and a connection pool (`DB_POOL_MAX`) sized so all processes together stay under Postgres's connection limit.
- **Abuse limits:** `infra/rate-limit` (Redis counters, `@RateLimit(name, limit, windowSeconds)` on a route, applied by a global guard that runs before authentication), plus the per-email and per-IP sign-in throttles and the one-time-code limits. The client IP honours `TRUST_PROXY`.
- **Web security headers:** a per-request nonce Content-Security-Policy from the website's proxy (`src/proxy.ts`, `src/lib/csp.ts`), plus `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and HSTS (`next.config.ts`).
- **Testing:** unit (engine, state machines), e2e with a test Postgres (Docker), no mocks of Prisma for business flows.
- **Frontend:** Next.js App Router, typed API client (generated from OpenAPI when stable), role-based layouts: `(public)`, `(customer)`, `(staff)`, `(admin)`.
- **Multi-vehicle future:** `Vehicle.type` + `VehicleModel`; pricing plan keyed by model; type-specific attributes live on `VehicleModel` (or a JSON `specs` column) rather than as `Vehicle` columns.

## 9. Local infra (Phase 1)
`infra/docker-compose.yml`: `postgres:16`, `redis:7` (email was not built in Phase 8, so no `mailpit`). Backend/frontend run on host via npm in dev. For a production-style stack see `infra/docker-compose.prod.yml` (Postgres, Redis, a one-off migration job, the API and the website; images from `backend/Dockerfile` and `frontend/Dockerfile`); TLS and the public entry point are the operator's reverse proxy.
