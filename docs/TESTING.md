# Testing

## How to run everything
Prerequisites: Docker infra running (`docs/DEV_SETUP.md`), backend and website running for the QA scripts.

| What | Command | Needs |
|---|---|---|
| Backend unit tests | `cd backend && npm test` | nothing |
| Backend end-to-end tests | `cd backend && npm run test:e2e` | Postgres + Redis (`docker compose up -d`) |
| Backend lint / build | `npm run lint` · `npm run build` | |
| Website lint / build | `cd frontend && npm run lint && npm run build` | |
| Flutter | `cd flutter && flutter analyze && flutter test` | |
| API security sweep | `node tools/qa/sweep.mjs` | backend running + seeded |
| Concurrency probes | `node tools/qa/race.mjs` | backend running + seeded (cleans up after itself) |
| Website page-by-role matrix | `node tools/qa/pages.mjs` | backend + website running + seeded |

Notes
- e2e tests create data prefixed `e2e-`/`E2E-` and delete it afterwards; seed data is never touched. Don't name manual test data with those prefixes (the cleanup would delete it).
- `sweep.mjs` deliberately fails many logins, which locks a staff account for 15 minutes. Clear it with `docker exec rove-redis sh -c "redis-cli --scan --pattern 'login:fail:*' | xargs -r redis-cli del"`.
- The QA scripts read seed credentials from the root `.env`.

## What is covered (state after Phase 4, 2026-10-08)
| Area | Tests |
|---|---|
| Backend | 54 unit (incl. quote maths, booking windows, opening hours across midnight and time zones, cancellation refund rules, codes and PIN), 121 end-to-end (phone sign-in and sign-up, OTP limits, staff login, tokens, RBAC and scope, cities/stations/models/vehicles, staff management, security headers, hostile input, login throttle, capacity races; **Phase 4: 37 booking tests** - identity check, pricing plans and city overrides, quote, creating bookings, no double booking (6 parallel attempts, one wins; the database constraint on its own), payment holds that expire, idempotent and parallel payments, failed payment then retry, tabs, cancellation refunds (early, late, within 10 minutes, twice at once), availability in a window, station open/closed, staff cannot change booked scooters) |
| Website | lint + production build; `pages.mjs`: 33 routes × 5 roles (anonymous, customer, employee, manager, admin) = 165 checks (now including booking, verify, pay and pricing pages) plus 16 content/scoping checks; interactive flows in a browser (see below) |
| Flutter | 74 unit and widget tests (booking: city label vs selector sheet, prices from the backend, identity check then payment then code and PIN, failed payment and retry, expired hold, closed slot message, picking a time, My bookings tabs, cancel with refund preview, closed station; money and city-time formatting; API client token refresh, auth controller incl. offline, phone sign-in: code, wrong code, new-number name step, expired ticket, resend countdown, change number; code boxes, profile read-only view, inline name edit, two-step phone change (right code, wrong code, number taken), verify-now, station browsing) |
| API sweep | 102 checks (now also: booking, KYC and payment routes reject anonymous callers and every staff role): every route in the OpenAPI spec rejects anonymous (401) and wrong-role (403) calls; hostile/malformed input gives clean 4xx with no leaks; headers; CORS; JWT tampering; refresh-token misuse; login throttling |
| Concurrency | 6 probes: station capacity (create and move), duplicate vehicle code, duplicate city, parallel sign-ups for one new phone number (two tickets), parallel status/update, parallel refresh |
| Database | Fresh database built from all migrations + seed run twice (idempotent); CHECK constraints; no leftover test rows |
| On device | 2026-10-08, Android emulator: station list with the city selector sheet, closed-now chips, booking screen (rates, Pick a time with the date and time pickers, live price), checkout, confirmation with code and PIN, My bookings, cancel with refund. Earlier: Android emulator (Pixel 8, Android 15): sign in, session survives app restart, stations and scooters, backend outage and recovery; 2026-10-04: sign-in code boxes (typing, wrong code), read-only profile, inline name edit, two-step phone change (wrong code keeps the old number, right code saves it), keyboard does not cover the sheet |

Manually driven in the browser (Chromium), 2026-10-08: city popup; closed-hours message; Pick a time; identity check and return to the booking page with choices kept; countdown payment page; simulated failure then payment; code and PIN; cancel with refund; My bookings; phone-width booking page with the bottom bar; admin pricing list and edit. Earlier: create/hide/show city; create/edit/close/reopen station (validation, duplicates, hours); create model; add scooters until the station is full; status change; edit and move; retire; create/disable staff; city manager scoping including a tampered form; phone-width layout of every console page.

## Findings from the full test pass (all fixed)
| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | High | Station capacity could be exceeded: 15 parallel "add scooter" requests into a 3-slot station all succeeded | Capacity check and insert now run in one transaction holding a row lock on the station (create and move); regression tests |
| 2 | Medium | Login had no brute-force protection | Redis counter per email: 10 failures in 15 minutes locks sign-in (429 `TOO_MANY_ATTEMPTS`), even for the right password; counted for unknown emails too; success resets it |
| 3 | Medium | Super admins could create a station employee with no station (or a manager with no city) | Required on creation for every actor |
| 4 | Medium | Oversized request body returned 500 | 413 `PAYLOAD_TOO_LARGE` |
| 5 | Low | `X-Powered-By: Express` exposed; no basic security headers | Header removed; `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Resource-Policy` (and HSTS in production) |
| 6 | Low | Invalid JSON error echoed raw parser text | Fixed message |
| 7 | Medium | Admin pages returned 500 for hand-edited query values (`?station=abc`) | Ids are validated before use |
| 8 | Low | `?error=` banner on admin pages displayed any text from the URL (spoofable message) | Banner now maps API error codes to a fixed message list |
| 9 | Medium | Admin tables made the whole page ~660px wide on phones | `min-w-0` on grid cells holding tables |
| 10 | Low | Validation errors read badly ("Name must be longer than or equal to 1 characters", "RangeKm …") | Plain-language messages and field labels |
| 11 | Medium | App launched while the server was down showed the sign-in screen (as if signed out) | New "Can't reach Rove" screen with Try again; the session is kept. Only an explicit 401 on refresh ends a session (not a network failure or a 5xx) |
| 12 | Low | Missing friendly error and not-found pages | Added `error.tsx` and `not-found.tsx` |
| 13 | Low | Registration-number conflict showed as a form-level message | Shown under the field |

## Findings from the Phase 4 test pass (all fixed)
| # | Severity | Finding | Fix |
|---|---|---|---|
| 14 | Medium | Stations still said "3 available" while closed (after hours), then booking "now" failed | Stations report `openNow`; both clients show "Closed now" and explain that a later time can still be booked; backend and Flutter tests |
| 15 | Low | Admin pricing page crashed for super admins (the models endpoint returns a plain list, not a page) | Page reads it as a list |
| 16 | Low | A test of the closed-hours rule depended on the minute it ran (failed at some times of day) | Window widened so it holds at any time |
| 17 | Low | QA scripts did not know the new routes (sweep reported 11 false failures; pages check looked for a demo user's name) | Updated `sweep.mjs` and `pages.mjs` |

## Known limitations and accepted risks
- Payment and identity checks are mocks (Phases 9-10). The public quote endpoint has no rate limit yet (Phase 12 hardening).
- The app shows city time exactly only for India (fixed offset); for another time zone it falls back to the device clock until a second zone exists.
- Hold expiry is applied when a booking or list is read or a new booking is made (there is no background job until Phase 8), so an expired hold lingers as "waiting for payment" in the database until then; it never blocks anyone.
- `npm audit` reports 4 high advisories in the **`prisma` command-line tool** (dev dependency; its bundled MySQL driver and a config helper). They are not part of the running API and we use PostgreSQL. Fixing them requires downgrading Prisma; revisit when a patched Prisma 7 is released.
- Login throttling is per email only. A per-IP limit needs the reverse-proxy setup (the website calls the API from its own server, so all users share one IP). Planned with production hardening (Phase 12).
- A locked email can be locked by anyone who keeps guessing (a standard trade-off); the lock lasts 15 minutes.
- Swagger UI (`/api/docs`) is enabled in every environment; restrict or disable it for production (Phase 12).
- The website sets no Content-Security-Policy yet (Phase 12 hardening).
- Not tested: iOS, physical Android devices, browsers other than Chromium, screen readers (basic labels/contrast follow the design rules), load/performance at scale, real SMS/payment/KYC providers (mocks until Phases 9-10).
- Only the browser pane was used for UI checks, with phone emulation for layout; real-phone testing is still advisable before launch.
