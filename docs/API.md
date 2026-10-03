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

### Phase 2 — Auth & users
`POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout`
`POST /auth/otp/send` · `POST /auth/otp/verify` (mock)
`GET /me` · `PATCH /me`
`POST /users` (admin creates staff) · `GET /users` · `PATCH /users/:id` · `PUT /users/:id/assignments`

### Phase 3 — Network & fleet
Public: `GET /cities` · `GET /cities/:id/stations` · `GET /stations/:id` · `GET /stations/:id/vehicles?from&to` (available only)
Admin/manager: `POST|PATCH /cities` · `POST|PATCH /stations` · `POST|PATCH /vehicle-models` · `POST|PATCH /vehicles` · `PATCH /vehicles/:id/status`

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
