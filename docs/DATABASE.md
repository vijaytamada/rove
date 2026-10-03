# Database (high level — full schema is designed per phase)

PostgreSQL via Prisma. This lists expected entities and purpose only. Detailed columns are decided in the phase that introduces the entity; update this doc then.

## Conventions
- PKs: `uuid` (or `cuid`). `createdAt`, `updatedAt` on every table.
- Money: `Int` in paise (`INR`). Column names end in `Amount`/`Fee`/`Deposit`. No floats.
- Enums for statuses (Prisma enums). Snake_case DB names via `@@map`/`@map`, camelCase in Prisma.
- Soft delete (`deletedAt`) only where history matters (users, stations, vehicles); otherwise use `status`.
- All times UTC (`timestamptz`).
- No raw Aadhaar, card, UPI, or OTP plaintext stored. Ever.

## Entities
| Entity | Phase | Purpose |
|---|---|---|
| **User** | 2 | Any account. `role` enum (`SUPER_ADMIN, CITY_MANAGER, STATION_EMPLOYEE, CUSTOMER`), email, phone, passwordHash, `phoneVerified`, `kycStatus`, outstanding flag |
| **RefreshToken** | 2 | Hashed refresh tokens, expiry, revoked/rotated |
| **StaffAssignment** | 2/3 | Links staff user → `cityId` (managers) or `stationId` (employees); defines scope |
| **OtpChallenge** | 2 (mock) / 9 | Hashed code/attempt state if not kept purely in Redis |
| **City** | 3 | Name, state, timezone, active flag |
| **Station** | 3 | City FK, name, address, lat/lng, capacity, status, opening hours |
| **VehicleModel** | 3 | Type (`SCOOTER` now), brand, name, battery capacity, range, specs |
| **Vehicle** | 3 | Model FK, current station FK, registration/plate, internal code, status, current odometer, last battery %, (QR/device ids later) |
| **PricingPlan** | 4 | Per model (optional city): hourly rate, included km/hour, extra-km rate, grace minutes, late fee/hour, deposit |
| **Booking** | 4 | Customer, vehicle, pickup station, start/end window, `status`, code, PIN hash, **pricing snapshot**, totals |
| **Payment** | 4 | Booking FK, purpose (`RENTAL_AND_DEPOSIT`, `OUTSTANDING`), amount, status, provider, providerRef, idempotency key |
| **Refund** | 4/6 | Payment FK, amount, status, providerRef, reason (cancellation, deposit return) |
| **KycRecord** | 4 (mock) / 9 | User FK, provider, providerRef, status, consent timestamp, verifiedAt, rejection reason. **No identity numbers** |
| **Rental** | 5 | 1:1 with Booking: actual start/end, start/end odometer, start/end battery, pickup/return station, pickup/return employee |
| **DamageRecord** | 5 | Rental FK, phase (`PICKUP`/`RETURN`), description, severity, fee amount, photo URLs |
| **Settlement** | 6 | Booking FK (1:1), deposit held, total charges, refund amount, outstanding amount, status (`REFUNDED`, `OUTSTANDING`, `CLEARED`, `NO_ACTION`) |
| **SettlementLineItem** | 6 | Settlement FK, type (`EXTRA_KM`, `LATE_FEE`, `DAMAGE`, …), quantity, unit amount, amount |
| **Notification** | 8 | Recipient, channel, template, payload, status, sentAt |
| **AuditLog** | 2+/9 | Actor, action, entity, before/after summary, ip — for staff actions, KYC, refunds |
| **TelemetryPoint** | 11 | Vehicle FK, ts, lat/lng, speed, battery, odometer, ignition (partition/retention later) |
| **DeviceMapping / LockEvent** | 12 | IoT device ↔ vehicle; lock/unlock commands and results |

## Phase 2 notes (implemented: User, RefreshToken, StaffAssignment)
- `User`: email (unique, stored lowercase), optional unique phone (E.164), `passwordHash` (argon2id), `role`, `status`, `phoneVerifiedAt`. `kycStatus` and outstanding-balance fields are added in Phases 4/6.
- `RefreshToken`: stores only the SHA-256 hash of an opaque random token; `revokedAt` marks rotated/revoked tokens (kept for reuse detection).
- `StaffAssignment`: exactly one of `cityId` / `stationId` (DB CHECK). No foreign keys yet; Phase 3 adds them.
- OTP challenges live in Redis (`otp:phone:<userId>`, TTL 5 min; `otp:cooldown:<userId>`, TTL 30 s), not in Postgres. The `OtpChallenge` table from the entity list is not needed.

## Key relationships
```
City 1─* Station 1─* Vehicle *─1 VehicleModel 1─* PricingPlan
User(customer) 1─* Booking *─1 Vehicle
Booking 1─* Payment 1─* Refund
Booking 1─0..1 Rental 1─* DamageRecord
Booking 1─0..1 Settlement 1─* SettlementLineItem
User(staff) *─* City/Station via StaffAssignment
```

## Integrity rules to enforce in DB where possible
- Prevent double-booking: overlap check inside a transaction with a lock on the vehicle row (optionally a Postgres exclusion constraint on `(vehicleId, tstzrange)` for active bookings — added in Phase 4 via raw SQL migration).
- `Rental.endOdometer ≥ startOdometer` (check constraint + service validation).
- Unique: booking code, `(provider, providerRef)`, payment idempotency key, vehicle plate.
- Return station must be in the same city as the pickup station (service validation).

## Seed data (Phase 2/3)
Super admin, 1–2 cities, 2–3 stations each, 1 manager per city, 1 employee per station, ~10 scooters, 1 pricing plan, 1 demo customer.
