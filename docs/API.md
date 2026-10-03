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
| `POST /auth/register` | public | Always creates a `CUSTOMER`. Returns `{ user, accessToken, refreshToken, expiresIn }`. Phone optional, E.164 (`+919876543210`) |
| `POST /auth/login` | public | Same error for unknown email and wrong password (`INVALID_CREDENTIALS`); disabled accounts get `ACCOUNT_DISABLED` |
| `POST /auth/refresh` | public | Body `{ refreshToken }`. Rotates: old token is revoked, new pair returned. Reusing a revoked token revokes all sessions (`INVALID_REFRESH_TOKEN`) |
| `POST /auth/logout` | public | Body `{ refreshToken }`; 204 |
| `POST /auth/otp/send` | signed in | Sends a phone-verification code (mock: always `123456`, dev only). 30 s resend cooldown, 5 min expiry |
| `POST /auth/otp/verify` | signed in | Body `{ code }`; 204. 5 wrong attempts lock the challenge |
| `GET /me` · `PATCH /me` | signed in | Profile incl. `phoneVerified` and `scope { cityIds, stationIds }`. `PATCH` accepts `fullName`, `phone` (changing phone resets verification) |
| `POST /users` | SUPER_ADMIN | Create `CITY_MANAGER` / `STATION_EMPLOYEE` / `SUPER_ADMIN` with optional `assignments` |
| `GET /users?role&page&limit` · `GET /users/:id` | SUPER_ADMIN | |
| `PATCH /users/:id` | SUPER_ADMIN | `fullName`, `status`. Disabling revokes the user's sessions; can't disable yourself |
| `PUT /users/:id/assignments` | SUPER_ADMIN | Replaces the user's city/station assignments |

Tokens: access token = JWT (15 min, `Authorization: Bearer`); refresh token = opaque random string (30 days), stored hashed.
Error codes added: `UNAUTHENTICATED`, `INVALID_TOKEN`, `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `INVALID_REFRESH_TOKEN`, `EMAIL_TAKEN`, `PHONE_TAKEN`, `PHONE_REQUIRED`, `PHONE_ALREADY_VERIFIED`, `OTP_INVALID`, `OTP_EXPIRED`, `OTP_RESEND_TOO_SOON`, `OTP_TOO_MANY_ATTEMPTS`, `FORBIDDEN_ROLE`, `FORBIDDEN_SCOPE`, `INVALID_ASSIGNMENT`, `INVALID_ROLE`, `CANNOT_DISABLE_SELF`, `USER_NOT_FOUND`, `VALIDATION_ERROR`.

### Phase 3 — Network & fleet (implemented)
Public (no sign-in):
| Endpoint | Notes |
|---|---|
| `GET /cities` | Active cities |
| `GET /cities/:cityId/stations` | Active stations of an active city, each with `availableVehicles` |
| `GET /stations/:id` | One active station |
| `GET /stations/:id/vehicles` | Available scooters only (no registration number or odometer). Time-window availability arrives in Phase 4 |

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

### Phase 4 — Booking
`POST /bookings/quote` · `POST /bookings` · `POST /bookings/:id/pay` (mock) · `GET /bookings` (mine) · `GET /bookings/:id` · `POST /bookings/:id/cancel`
`POST /kyc/start` · `GET /kyc/status` (mock)

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
