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
| **User** | 2 | Any account. `role` enum (`SUPER_ADMIN, CITY_MANAGER, STATION_EMPLOYEE, CUSTOMER`), email (staff), phone (customers), passwordHash (staff), `phoneVerified`, `kycStatus`, outstanding flag |
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
| **Settlement** | 6 | Booking FK (1:1), deposit held, total charges, refund amount, outstanding amount, status (`REFUND_PENDING`, `REFUNDED`, `OUTSTANDING`, `CLEARED`, `NO_ACTION`), `settledAt`, `clearedAt` |
| **SettlementLineItem** | 6 | Settlement FK, type (`EXTRA_KM`, `LATE_FEE`, `DAMAGE`), description, quantity (started km or hours; 1 for damage), unit amount, amount |
| **Notification** | 8 | User FK (cascade), `type` (`BOOKING_CONFIRMED`, `BOOKING_CANCELLED`, `BOOKING_EXPIRED`, `PICKUP_REMINDER`, `RIDE_STARTED`, `RETURN_REMINDER`, `RETURN_OVERDUE`, `RIDE_COMPLETED`, `REFUND_SENT`, `PAYMENT_RECEIVED`, `NO_SHOW`), title, body (the finished text, in the city's time), optional Booking FK (cascade), `dedupeKey` (unique, `<EVENT>:<bookingId>`: one message per event), `readAt`, `createdAt`. Delivery outside the app is not tracked |
| **AuditLog** | 2+/9 | Actor, action, entity, before/after summary, ip — for staff actions, KYC, refunds |
| **TelemetryPoint** | 11 | Vehicle FK, ts, lat/lng, speed, battery, odometer, ignition (partition/retention later) |
| **DeviceMapping / LockEvent** | 12 | IoT device ↔ vehicle; lock/unlock commands and results |

## Phase 2 notes (implemented: User, RefreshToken, StaffAssignment)
- `User`: email (unique, stored lowercase, nullable), unique phone (E.164, nullable), `passwordHash` (argon2id, nullable), `role`, `status`, `phoneVerifiedAt`. CHECK constraints: staff roles must have an email and password; customers must have a phone. Customers sign in with a phone code, so they need no email or password (an optional email was left out of Phase 8 and is still open). `kycStatus` and outstanding-balance fields are added in Phases 4/6.
- `RefreshToken`: stores only the SHA-256 hash of an opaque random token; `revokedAt` marks rotated/revoked tokens (kept for reuse detection).
- `StaffAssignment`: exactly one of `cityId` / `stationId` (DB CHECK). No foreign keys yet; Phase 3 adds them.
- OTP challenges live in Redis (`otp:phone:<userId>`, TTL 5 min; `otp:cooldown:<userId>`, TTL 30 s), not in Postgres. The `OtpChallenge` table from the entity list is not needed.

## Phase 3 notes (implemented: City, Station, VehicleModel, Vehicle)
- `City`: unique (name, state); `timezone` (IANA); `isActive` hides it from customers. Never deleted.
- `Station`: unique (city, name); lat/lng, `capacity`, optional `opensAt`/`closesAt` (HH:mm, city time zone), `status` ACTIVE/INACTIVE. Never deleted. CHECKs: capacity > 0, valid lat/lng.
- `VehicleModel`: global catalogue; `type` enum (SCOOTER only now); range, top speed, optional battery Wh; `isActive` retires a model.
- `Vehicle`: `code` unique, optional unique `registrationNumber`, `status`, `batteryPercent`, `odometerKm`, nullable `stationId` (null while out on a ride, set by Phase 5), `retiredAt` (soft delete). CHECKs: battery 0-100, odometer >= 0. Type-specific attributes live on `VehicleModel` so bikes and cars can be added later.
- `StaffAssignment.cityId/stationId` now have foreign keys (ON DELETE RESTRICT).

## Phase 4 notes (implemented: PricingPlan, Booking, Payment, Refund, KycRecord)
- `PricingPlan`: per model, optional city (null = default for every city). Unique (model, city) plus a partial unique index for one default per model. Fields: `hourlyRateAmount`, optional `dailyRateAmount` (cap on any rental), `includedKmPerHour`, `extraKmRateAmount`, `graceMinutes`, `lateFeePerHourAmount`, `depositAmount`, `isActive`. CHECKs on amounts. The excess-km, late and grace values are copied onto the booking and used by the settlement engine.
- `Booking`: user, vehicle, pickup station, `startAt`/`endAt`/`hours`, `status` (`PENDING_PAYMENT, CONFIRMED, IN_RIDE, RETURNED, SETTLED, CANCELLED, EXPIRED, NO_SHOW`; Phase 4 uses the first, second, sixth and seventh; Phase 5 adds `IN_RIDE`, `RETURNED` and `NO_SHOW`), `holdExpiresAt`, `rentalAmount`/`depositAmount`/`totalAmount` (CHECK total = rental + deposit), `pricingSnapshot` (JSON: the rates the customer agreed to), `confirmedAt`, `cancelledAt`, unique `code` (RV-XXXXXX). **No overlaps:** a Postgres exclusion constraint (`btree_gist`) forbids two live bookings (`PENDING_PAYMENT, CONFIRMED, IN_RIDE`) on one vehicle with overlapping time ranges; back-to-back is allowed. The service also locks the vehicle row, and marks expired holds `EXPIRED` before inserting so they never block. The PIN is **not stored**: it is an HMAC of the booking id (see `booking-codes.ts`).
- `Vehicle.status` stays `AVAILABLE` while a booking exists: availability comes from bookings, so a scooter can be booked for several non-overlapping windows. `RESERVED`/`IN_RIDE` are set at pickup in Phase 5.
- `Payment` (`RENTAL_AND_DEPOSIT`, or `OUTSTANDING` for what a customer pays after a ride): `chargeAmount`, `status`, `provider`, `providerRef`, unique `idempotencyKey`, `failureReason`, `paidAt`. `Refund`: `refundAmount`, `status`, `reason`, `provider`, `providerRef`.
- `Rental` (Phase 5): 1:1 with `Booking`; `startedAt`/`endedAt`, `startOdometerKm`/`endOdometerKm`, `startBatteryPercent`/`endBatteryPercent`, pickup and return station and employee, and `originalVehicleId` + `swapReason` when staff handed over a different scooter of the same model (the booking then points at the new one). Created at handover, completed at return. The late fee, extra km and damage charges are billed on the Settlement.
- `DamageRecord` (Phase 5): per rental, `phase` (`PICKUP` = already there, `RETURN` = new), `description`, `severity` (`MINOR`, `MODERATE`, `MAJOR`), flat `feeAmount` in paise entered by staff (charged against the deposit on the Settlement), who recorded it.
- While a scooter is out, `Vehicle.stationId` is null; returning it sets the return station. `Refund.reason` can be `NO_SHOW`.
- `Settlement` (Phase 6): 1:1 with `Booking`, created inside the return transaction. Database checks: all amounts >= 0; money goes one way (`refundAmount = 0 OR outstandingAmount = 0`); `refund = max(deposit - charges, 0)` and `outstanding = max(charges - deposit, 0)`; the status only fits the amounts (`REFUND_PENDING`/`REFUNDED` need a refund, `OUTSTANDING`/`CLEARED` need an amount owed, `NO_ACTION` needs neither). `SettlementLineItem`: `amount = quantity x unitAmount`. A partial unique index on `Refund(paymentId)` where `reason = DEPOSIT_RETURN` and `status = SUCCEEDED` allows one successful deposit refund per payment. `Refund.reason` `DEPOSIT_RETURN` is what is left of the deposit after the charges.
- `KycRecord`: one per user; provider, `providerRef`, `status`, `consentAt`, `verifiedAt`, `rejectionReason`. Never an identity number.

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
Super admin, 1–2 cities, 2–3 stations each, 1 manager per city, 1 employee per station, ~10 scooters, one default pricing plan per model (₹49/₹69/₹99 per hour), 1 demo customer (not identity-verified, so the first booking shows that step).
