# API

REST + JSON, prefix `/api/v1`, Swagger UI at `/api/docs`, OpenAPI JSON at `/api/docs-json`. This file holds conventions and the *planned* endpoint list; Swagger is the source of truth once implemented.

## Conventions
- Auth: `Authorization: Bearer <accessJWT>`. Public endpoints are explicitly marked `@Public()`.
- Errors: `{ "statusCode": 409, "code": "VEHICLE_NOT_AVAILABLE", "message": "...", "details": {} }`. `code` is stable.
- Pagination: `?page=1&limit=20` → `{ items, total, page, limit }`.
- Money: integer paise, field names suffixed `Amount`/`Fee`; currency implied `INR`.
- Dates: ISO-8601 UTC.
- Idempotency: payment-creating endpoints accept `Idempotency-Key` header.
- IDs: UUID strings.

## Planned endpoints (high level)

### Phase 1 — Foundation
`GET /health`

### Phase 2 — Auth & users (implemented)
| Endpoint | Access | Notes |
|---|---|---|
| `POST /auth/phone/request` | public | **Customers.** Body `{ phone }` (E.164, `+919876543210`). Sends a sign-in code. Returns `{ expiresInSeconds: 300, resendAfterSeconds: 30 }`, identical for known, unknown and staff numbers (no account enumeration); staff numbers are never sent a code |
| `POST /auth/phone/verify` | public | Body `{ phone, code }`. Known number: `{ status: 'SIGNED_IN', user, accessToken, refreshToken, expiresIn }`. New number: `{ status: 'NEEDS_NAME', signupToken }` (no account yet) |
| `POST /auth/phone/signup` | public | Body `{ signupToken, fullName }`. Creates the `CUSTOMER` and returns the signed-in result. The ticket is single use and lasts 10 minutes (`SIGNUP_EXPIRED`) |
| `POST /auth/login` | public | **Staff, city managers and admins** (email + password). A customer can never use it. Same error for unknown email and wrong password (`INVALID_CREDENTIALS`); disabled accounts get `ACCOUNT_DISABLED`. There is no public registration: `POST /auth/register` was removed |
| `POST /auth/refresh` | public | Body `{ refreshToken }`. Rotates: old token is revoked, new pair returned. Reusing a revoked token revokes all sessions (`INVALID_REFRESH_TOKEN`) |
| `POST /auth/logout` | public | Body `{ refreshToken }`; 204 |
| `POST /auth/phone/change` | signed in | **Change the profile phone, step 1.** Body `{ phone }` (E.164, the NEW number). Sends a code to it; nothing is saved yet. `PHONE_TAKEN` (409) if another account uses it, `PHONE_UNCHANGED` (409) if it is already your verified number. Returns `{ expiresInSeconds, resendAfterSeconds }`. Same limits as sign-in codes |
| `POST /auth/phone/change/verify` | signed in | **Step 2.** Body `{ code }`; 204. The new number is saved and marked verified only now. `OTP_EXPIRED` if no change is pending; 5 wrong attempts lock the challenge |
| `POST /auth/otp/send` | signed in | For a number that is already saved but unverified (for example a staff phone added by an admin): sends a code to it (mock: always `123456`, dev only). Same limits as sign-in codes |
| `POST /auth/otp/verify` | signed in | Body `{ code }`; 204. 5 wrong attempts lock the challenge |
| `GET /me` · `PATCH /me` | signed in | Profile incl. `phoneVerified` and `scope { cityIds, stationIds }`. `PATCH` accepts `fullName` only; sending `phone` is rejected (400). The phone changes through `/auth/phone/change` |
| `POST /users` | SUPER_ADMIN (managers: employees only, see Phase 3) | Create `CITY_MANAGER` / `STATION_EMPLOYEE` / `SUPER_ADMIN` with optional `assignments` |
| `GET /users?role&page&limit` · `GET /users/:id` | SUPER_ADMIN (managers: their employees) | |
| `PATCH /users/:id` | SUPER_ADMIN (managers: their employees) | `fullName`, `status`. Disabling revokes the user's sessions; can't disable yourself |
| `PUT /users/:id/assignments` | SUPER_ADMIN (managers: their employees) | Replaces the user's city/station assignments |

Tokens: access token = JWT (15 min, `Authorization: Bearer`); refresh token = opaque random string (30 days), stored hashed.
Staff login is throttled: 10 failed attempts per email in 15 minutes returns 429 `TOO_MANY_ATTEMPTS`. Oversized bodies return 413 `PAYLOAD_TOO_LARGE`.
Sign-in codes are limited per phone number and overall: 30 s between sends (`OTP_RESEND_TOO_SOON`), 5 sends per number per hour (`OTP_TOO_MANY_REQUESTS`), 5 wrong attempts per code (`OTP_TOO_MANY_ATTEMPTS`), and a daily cap on all sends, `OTP_DAILY_SEND_CAP` (default 5000), after which sending returns 503 `OTP_UNAVAILABLE`. Codes last 5 minutes (`OTP_EXPIRED`).
Error codes added: `UNAUTHENTICATED`, `INVALID_TOKEN`, `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `INVALID_REFRESH_TOKEN`, `EMAIL_TAKEN`, `PHONE_TAKEN`, `PHONE_REQUIRED`, `PHONE_ALREADY_VERIFIED`, `PHONE_UNCHANGED`, `OTP_INVALID`, `OTP_EXPIRED`, `OTP_RESEND_TOO_SOON`, `OTP_TOO_MANY_ATTEMPTS`, `OTP_TOO_MANY_REQUESTS`, `OTP_UNAVAILABLE`, `SIGNUP_EXPIRED`, `FORBIDDEN_ROLE`, `FORBIDDEN_SCOPE`, `INVALID_ASSIGNMENT`, `INVALID_ROLE`, `CANNOT_DISABLE_SELF`, `USER_NOT_FOUND`, `VALIDATION_ERROR`.

### Phase 3 — Network & fleet (implemented)
Public (no sign-in):
| Endpoint | Notes |
|---|---|
| `GET /cities` | Active cities |
| `GET /cities/:cityId/stations` | Active stations of an active city, each with `availableVehicles` |
| `GET /stations/:id` | One active station |
| `GET /stations/:id/vehicles` | Available scooters only (no registration number or odometer). Phase 4 adds the time window and prices (below) |

Management (signed in; scope enforced by role):
| Endpoint | Access |
|---|---|
| `GET /manage/cities` · `POST /cities` · `PATCH /cities/:id` | list: admin, manager (own cities); create/update: **super admin** |
| `GET /manage/stations?cityId&status` | admin, manager (own cities), employee (own stations) |
| `POST /stations` · `PATCH /stations/:id` | admin, manager (own cities). City is immutable. Opening hours are both set or both empty |
| `GET /manage/vehicle-models` | any staff. `POST /vehicle-models` · `PATCH /vehicle-models/:id`: **super admin** (global catalogue) |
| `GET /manage/vehicles?stationId&cityId&status&modelId` · `GET /manage/vehicles/:id` | admin, manager (own cities), employee (own stations) |
| `POST /vehicles` · `PATCH /vehicles/:id` · `DELETE /vehicles/:id` | admin, manager (own cities). PATCH can move a scooter to another station you manage. DELETE retires it (soft delete). Station capacity is enforced |
| `PATCH /vehicles/:id/status` | admin/manager: AVAILABLE, MAINTENANCE, OFFLINE. Employee: MAINTENANCE only, own station. RESERVED/IN_RIDE are system-controlled; reserved or in-ride vehicles cannot be changed (409) |
| `POST /users` · `GET /users` · `GET|PATCH /users/:id` · `PUT /users/:id/assignments` | admin: everyone; **manager: station employees of their own cities** (must assign at least one station inside their cities) |

List endpoints take `?page&limit`. Codes added: `CITY_NOT_FOUND`, `CITY_EXISTS`, `INVALID_TIMEZONE`, `STATION_NOT_FOUND`, `STATION_EXISTS`, `INVALID_HOURS`, `STATION_FULL`, `MODEL_NOT_FOUND`, `MODEL_EXISTS`, `VEHICLE_NOT_FOUND`, `VEHICLE_CODE_TAKEN`, `REGISTRATION_TAKEN`, `VEHICLE_BUSY`, `VEHICLE_CHANGED`, `INVALID_STATUS_CHANGE`, `UNKNOWN_CITY`, `UNKNOWN_STATION`.

### Phase 4 — Booking (implemented)
Public:
| Endpoint | Notes |
|---|---|
| `GET /vehicles/:id` | One scooter (no registration/odometer) with `pricing` and its `station` summary (incl. city `timezone`). Shown even while it is booked right now; 404 for retired scooters or inactive stations |
| `GET /stations/:stationId/vehicles?startAt&hours` | Scooters free for the window (default: now for 1 hour). Booked scooters and unexpired payment holds are left out. Each scooter has `pricing` (null = no plan yet, cannot be booked). Stations also carry `openNow` |
| `POST /bookings/quote` | Body `{ vehicleId, startAt?, hours }` (hours 1-24, start up to 7 days ahead, default now). Returns `rentalAmount`, `depositAmount`, `totalAmount`, `includedKm`, `startAt`, `endAt`, `pricing`, `station`, `holdMinutes`. Fails with the same errors a booking would (closed station, scooter booked, no plan) |

Customers only (`CUSTOMER`; staff get 403):
| Endpoint | Notes |
|---|---|
| `GET /kyc/status` · `POST /kyc/start` | Mock identity check. `start` needs `{ consent: true }` (`CONSENT_REQUIRED`) and verifies at once. Status `NOT_STARTED / PENDING / VERIFIED / REJECTED` |
| `POST /bookings` | Same body as the quote. Needs a verified identity (`KYC_REQUIRED` 403). Holds the scooter for 10 minutes (`PENDING_PAYMENT`, `holdExpiresAt`). 409 `VEHICLE_NOT_AVAILABLE`, `OVERLAPPING_BOOKING` (you already have one then), `TOO_MANY_BOOKINGS` (5 open at once), `STATION_CLOSED` (start outside opening hours), `NO_PRICING_PLAN` |
| `POST /bookings/:id/pay` | Mock checkout. Optional `Idempotency-Key` header (8-100 chars): the same key never charges twice (`IDEMPOTENCY_KEY_REUSED` if it belongs to another booking). Body `{ simulate: 'FAIL' }` makes the mock decline (never in production). Success: `CONFIRMED` with the PIN. 402 `PAYMENT_FAILED` keeps the hold so the customer can retry. 409 `ALREADY_PAID`, `PAYMENT_IN_PROGRESS`, `HOLD_EXPIRED` (a payment that lands after the hold ran out is refunded at once) |
| `GET /bookings?tab=active\|upcoming\|past&page&limit` · `GET /bookings/:id` | Own bookings only (404 for others). Active = waiting for payment, started or in progress; upcoming = paid, not started; past = finished. A booking view has `code` (RV-XXXXXX), `pin` (only when confirmed/in progress), amounts, the agreed `pricing` snapshot, `payment`, `refundedAmount` and `cancellation { allowed, refundAmount, retainedAmount }` (what cancelling right now would do, so clients never work out money) |
| `POST /bookings/:id/cancel` | Unpaid: nothing moves. Paid: everything back if cancelled 2+ hours before the start or within 10 minutes of paying, otherwise only the deposit (rental kept). 409 `CANNOT_CANCEL` once started, ended, cancelled or expired |

Staff (read for all staff, write for super admins): `GET /manage/pricing-plans?modelId&cityId` · `POST /pricing-plans` · `PATCH /pricing-plans/:id`. One default plan per model (no city) and at most one per model and city; a city plan replaces the default there (`PLAN_EXISTS`, `INVALID_DAY_RATE`, `PLAN_NOT_FOUND`).
A scooter with a live booking cannot be moved, retired or set to maintenance/offline (409 `VEHICLE_BOOKED`).
Codes added: `KYC_REQUIRED`, `CONSENT_REQUIRED`, `INVALID_DURATION`, `INVALID_START`, `START_IN_PAST`, `START_TOO_FAR`, `STATION_CLOSED`, `NO_PRICING_PLAN`, `VEHICLE_NOT_AVAILABLE`, `OVERLAPPING_BOOKING`, `TOO_MANY_BOOKINGS`, `BOOKING_NOT_FOUND`, `ALREADY_PAID`, `BOOKING_NOT_PAYABLE`, `PAYMENT_FAILED`, `PAYMENT_IN_PROGRESS`, `HOLD_EXPIRED`, `IDEMPOTENCY_KEY_REUSED`, `INVALID_IDEMPOTENCY_KEY`, `SIMULATION_DISABLED`, `CANNOT_CANCEL`, `VEHICLE_BOOKED`, `PLAN_EXISTS`, `PLAN_NOT_FOUND`, `INVALID_DAY_RATE`.

### Phase 5 - Pickup & return (station desk)
All routes are under `/station/bookings`, for `STATION_EMPLOYEE`, `CITY_MANAGER` and `SUPER_ADMIN`, and are scoped (see `docs/RBAC.md`). The responses are a staff view of the booking (`StaffBookingView`): customer name and phone, scooter with last odometer and battery, `rental` (readings, damage records, who handled it), `refundedAmount`, `pickupOpensAt`, `noShowFrom`, and `actions` = `{ pickup, return, noShow }`, each `{ allowed, reason? }` in plain language so a client never has to re-derive the rules. The **pickup PIN is never in a staff response**.

| Route | What it does |
|---|---|
| `GET /station/bookings?tab&q&stationId&page&limit` | The desk queue. `tab`: `pickups` (paid, waiting, not over; default), `rides` (out now - the whole city sees these, because any station of the city may take the scooter back), `past` (returned or no-show in the last 7 days; also shown at the station that took the scooter back). `q` searches booking code, phone digits or customer name; with `q` and no `tab` it looks everywhere. `stationId` narrows to one station you may use |
| `GET /station/bookings/:id` | One booking. Other stations' bookings are 404 `BOOKING_NOT_FOUND`, not 403 |
| `POST /station/bookings/:id/pickup` | Hand the scooter over. Body `{ pin (6 digits), idChecked: true, startOdometerKm, startBatteryPercent, damages?: [{ description, severity }], replacementVehicleId?, swapReason? }`. Allowed from 15 minutes before the start until the booked time is over. `CONFIRMED -> IN_RIDE`, scooter `IN_RIDE` and out of its station slot, a `Rental` is created. A **replacement** (a faulty booked scooter) must be free, at the same station and the same model, and needs `swapReason`; the booking then points at the new scooter. Five wrong PINs lock pickup for that booking for 15 minutes (`PIN_LOCKED`) |
| `POST /station/bookings/:id/return` | Take the scooter back. Body `{ returnStationId, endOdometerKm, endBatteryPercent, damages?: [{ description, severity, feeAmount? }], sendToMaintenance? }`. The return station must be active, in the **same city** as the booking, have a free slot, and be one you operate. End odometer must not be below the start and at most 2000 km further. `IN_RIDE -> RETURNED`; the scooter moves to the return station and becomes `AVAILABLE`, or `MAINTENANCE` when any damage is MODERATE or MAJOR or `sendToMaintenance` is set; odometer and battery are written to the scooter. The final bill is made in the same step (see Phase 6 below) |
| `POST /station/bookings/:id/no-show` | Allowed once an hour has passed since the start (or the booking has ended, if sooner). `CONFIRMED -> NO_SHOW`; the deposit is refunded through the payment provider (reason `NO_SHOW`), the rental charge is kept, the scooter is bookable again |

Codes added: `PICKUP_NOT_ALLOWED`, `RETURN_NOT_ALLOWED`, `NO_SHOW_NOT_ALLOWED` (all 409, the message says why), `PIN_INVALID`, `PIN_LOCKED`, `SWAP_REASON_REQUIRED`, `REPLACEMENT_NOT_AVAILABLE`, `RETURN_CITY_MISMATCH`, `RETURN_STATION_INACTIVE`, `STATION_FULL`, `ODOMETER_TOO_FAR`, plus the existing `FORBIDDEN_SCOPE` and `BOOKING_NOT_FOUND`.

Customer side: `GET /bookings` and `/bookings/:id` now also carry the ride states (`IN_RIDE`, `RETURNED`, `NO_SHOW`) and a `rental` summary (`startedAt`, `endedAt`, `distanceKm`, `returnStationName`).

### Phase 6 - Settlement
The final bill of a ride, made in the same step that takes the scooter back (`POST /station/bookings/:id/return`). The numbers come from the pure engine `pricing/settlement-charges.ts`, using the rates saved on the booking.

| Route | Who | What it does |
|---|---|---|
| `GET /bookings/:id/settlement` | customer (own) | The bill: `status`, `depositHeld`, `totalCharges`, `refundAmount`, `outstandingAmount`, `lineItems` (`EXTRA_KM`, `LATE_FEE`, `DAMAGE`; each with `description`, `quantity`, `unitAmount`, `amount`), `settledAt`, `clearedAt`, `payable`. 404 `SETTLEMENT_NOT_FOUND` until the ride is returned (and for cancelled or no-show bookings) |
| `POST /bookings/:id/settlement/pay` | customer (own) | Mock payment of the `outstandingAmount`. Optional `Idempotency-Key` header (8-100 chars); body `{ simulate: 'FAIL' }` makes the mock decline (never in production). Success: `CLEARED`. 402 `PAYMENT_FAILED` keeps it owing; 409 `ALREADY_PAID`, `NOTHING_TO_PAY`, `PAYMENT_IN_PROGRESS`, `IDEMPOTENCY_KEY_REUSED` |
| `GET /settlements?status&stationId&page&limit` | staff | Without `status`: the ones that need someone (`OUTSTANDING` and `REFUND_PENDING`). Each item is the bill plus `booking` (code, status, customer, scooter code, station, time zone, return station, return time). Scoped to stations the staff run, or where the scooter came back |
| `GET /settlements/:id` | staff | One bill (404 for other stations) |
| `POST /settlements/:id/collect` | staff | The customer paid what they owed at the desk (mock). Same rules and errors as the customer payment |
| `POST /settlements/:id/retry-refund` | staff | Sends the deposit refund again. 409 `NOTHING_TO_RETRY` unless `REFUND_PENDING`; 502 `REFUND_FAILED` if the gateway says no again |

**Charges** (all from the plan values saved on the booking): extra km = started kilometres beyond `includedKmPerHour x hours` at `extraKmRateAmount`; late fee = every started hour counted from the booked end, nothing at or inside `graceMinutes`, at `lateFeePerHourAmount`; damage = the flat fees staff entered at return (damage that was already there is never charged). The charges are taken from the deposit: `refund = max(deposit - charges, 0)`, `outstanding = max(charges - deposit, 0)`. The rental is prepaid and is not refunded for an early return.

**Settlement status:** `REFUND_PENDING` (refund queued or failed; booking stays `RETURNED`) -> `REFUNDED`; `OUTSTANDING` -> `CLEARED`; `NO_ACTION` (charges used the whole deposit, or nothing to move). Booking becomes `SETTLED` once the refund went through or there was nothing to refund (an amount owed is tracked on the settlement).

**Refund timing:** automatic and per ride, right after the return is saved; no end-of-day batch. A failed refund is stored as a failed `Refund` row and the settlement stays `REFUND_PENDING` for staff to retry.

**Blocking:** while a customer has an `OUTSTANDING` settlement, `POST /bookings` returns 409 `OUTSTANDING_BALANCE` with `details: { bookingId, amount }` (the quote stays public). The booking shows under the customer's *Active* tab as "Payment due".

Customer and staff booking responses (`GET /bookings`, `/bookings/:id`, `/station/bookings/:id`) now carry `settlement` (the bill, or null), and the booking status after a ride is `SETTLED` instead of `RETURNED`. Codes added: `SETTLEMENT_NOT_FOUND`, `OUTSTANDING_BALANCE`, `NOTHING_TO_PAY`, `NOTHING_TO_RETRY`, `REFUND_FAILED`.

### Phase 7 - Dashboards
Read-only numbers for each role's home. Nothing here changes data and there are no new tables. Every staff dashboard takes `?range=1d|7d|30d` (default `7d`): a **rolling** window ending now (the last 24 hours, 7 days or 30 days), so it means the same in every city's time zone. Anything else is a 400.

| Route | Who | What it returns |
|---|---|---|
| `GET /dashboard/admin` | super admin | The whole network (the metrics below) plus `cities[]`: one row per city (`stations`, `fleet`, `utilizationPercent`, `money`, and the "now" numbers for waiting, out, late, owed, refunds pending) |
| `GET /dashboard/city/:id` | manager of that city, super admin | `city`, the metrics for the city, and `stations[]`: one row per station. Other managers get 403, an unknown city 404 `CITY_NOT_FOUND` |
| `GET /dashboard/station/:id` | employee of that station, manager of its city, super admin | `station`, the metrics for the station, and `queue`: `pickups[]` (next 5 paid bookings waiting, soonest first) and `rides[]` (next 5 rides out, earliest due first), each `{ id, code, customerName, vehicleCode, startAt, endAt, overdue }`. Never includes the PIN |
| `GET /dashboard/customer` | customer | `active` (a ride, an unpaid hold, a pickup due, or money owed), `upcoming` (next paid booking not started), `recent` (last 3 finished), `owed` (`{ bookingId, amount }` or null), `stats` (`rides` finished, `distanceKm`). Bookings are the same objects as `GET /bookings` |

**The metrics** (same shape for the network, a city and a station):
- `fleet`: `total`, `available`, `inRide`, `maintenance`, `offline`. A scooter out on a ride has no station, so `inRide` is counted from rides that started in the slice.
- `utilizationPercent`: ride hours inside the window divided by scooter-hours (`fleet.total` x window hours), 0-100 with one decimal, worked out in the database.
- `activity` (inside the window): `newBookings` (paid), `ridesStarted`, `ridesCompleted`, `cancellations`, `noShows`.
- `money` (inside the window, paise): `collected` (successful payments), `refunded` (successful refunds), `net` (collected minus refunded). `net` still includes deposits that are held, so it is **not** earnings.
- `now` (not tied to the window): `waitingPickups`, `ridesOut`, `overdueRides` (out past the booked end), `depositsHeld` (deposits of paid bookings not yet settled), `owed` and `refundsPending` (`{ count, amount }`).
Rides, payments and settlements belong to the station where the ride started.

### Phase 8 - Notifications
A customer's inbox. Every signed-in user has their own (staff get no messages yet, so theirs is empty), and nobody can read or change anyone else's: another person's id is a 404 `NOTIFICATION_NOT_FOUND`.

| Route | Who | What it does |
|---|---|---|
| `GET /notifications?unread=true&page&limit` | signed in | `{ items, total, page, limit }`, newest first. `unread=true` only the unread ones (`unread=maybe` is a 400). Each item: `id`, `type`, `title`, `body`, `bookingId` (or null, so clients can link to the booking), `readAt` (or null), `createdAt` |
| `GET /notifications/unread-count` | signed in | `{ count }` for the bell |
| `POST /notifications/:id/read` | signed in | Marks one message read (idempotent: the first `readAt` is kept) and returns it |
| `POST /notifications/read-all` | signed in | Marks every unread message read, returns `{ updated }` |

**Events** (`type`; one message per booking and event, so a repeat never sends twice): `BOOKING_CONFIRMED` (payment went through; amounts, deposit, booking code - never the PIN), `BOOKING_CANCELLED` (only for a paid booking; says what was refunded, or that the refund is being processed if the gateway said no), `BOOKING_EXPIRED` (the 10-minute hold ran out), `PICKUP_REMINDER` (the hour before the start; skipped when the booking was made less than an hour before it starts), `RIDE_STARTED`, `RETURN_REMINDER` (the half hour before the ride is due back), `RETURN_OVERDUE` (once the grace minutes after the booked end are used up, when the late fee starts), `RIDE_COMPLETED` (the final bill and where the money stands: refunded, being processed, an amount owed, or nothing to move), `REFUND_SENT` (a refund that failed at first went through after a staff retry), `PAYMENT_RECEIVED` (an amount owed was paid, by the customer or at the desk), `NO_SHOW` (deposit refunded, rental kept). Times in a message are on the city's clock. A message that fails to store or deliver never breaks the booking, payment or return that caused it.

**Background job:** every minute (`JOBS_ENABLED`, on by default) the backend marks unpaid holds whose 10 minutes ran out as `EXPIRED`, announces recent expired holds (including ones another request already marked), and sends the pickup, return and overdue messages that came due. A Redis lock keeps several backend instances from running it at the same time; each step is safe to repeat.

Codes added: `NOTIFICATION_NOT_FOUND`.

### Phase 9+
`POST /webhooks/payments` · `POST /webhooks/kyc` · `POST /telemetry` · `GET /fleet/live` · lock/unlock endpoints — designed in their phases.

## Access
Per-endpoint role/scope rules: see `docs/RBAC.md`.
