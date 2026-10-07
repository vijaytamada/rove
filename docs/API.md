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

### Phase 5 — Pickup & return (staff)
`GET /station/bookings?code|phone|date` · `POST /bookings/:id/pickup` · `POST /bookings/:id/return` · `POST /bookings/:id/no-show`

### Phase 6 — Settlement
`GET /bookings/:id/settlement` · `POST /settlements/:id/collect` (mock) · `GET /settlements?status=OUTSTANDING` (staff/manager)

### Phase 7 — Dashboards
`GET /dashboard/admin` · `/dashboard/city/:id` · `/dashboard/station/:id` · `/dashboard/customer`

### Phase 8+ 
`GET /notifications` · `POST /webhooks/payments` · `POST /webhooks/kyc` · `POST /telemetry` · `GET /fleet/live` · lock/unlock endpoints — designed in their phases.

## Access
Per-endpoint role/scope rules: see `docs/RBAC.md`.
