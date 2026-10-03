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

## What is covered (state after Phase 3)
| Area | Tests |
|---|---|
| Backend | 31 unit, 81 end-to-end (phone sign-in and sign-up, OTP limits, staff login, tokens, RBAC and scope, cities/stations/models/vehicles, staff management, security headers, hostile input, login throttle, capacity races) |
| Website | lint + production build; `pages.mjs`: 23 routes × 5 roles (anonymous, customer, employee, manager, admin) = 120 checks (including `/login/staff` and the `/register` redirect) plus 11 content/scoping checks; interactive form flows in a browser (see below) |
| Flutter | 42 unit and widget tests (API client token refresh, auth controller incl. offline, phone sign-in: code, wrong code, new-number name step, expired ticket, resend countdown, change number; profile/OTP screens, station browsing) |
| API sweep | 70 checks: every route in the OpenAPI spec rejects anonymous (401) and wrong-role (403) calls; hostile/malformed input gives clean 4xx with no leaks; headers; CORS; JWT tampering; refresh-token misuse; login throttling |
| Concurrency | 6 probes: station capacity (create and move), duplicate vehicle code, duplicate city, parallel sign-ups for one new phone number (two tickets), parallel status/update, parallel refresh |
| Database | Fresh database built from all migrations + seed run twice (idempotent); CHECK constraints; no leftover test rows |
| On device | Android emulator (Pixel 8, Android 15): sign in, session survives app restart, stations and scooters, backend outage and recovery |

Manually driven in the browser (Chromium): create/hide/show city; create/edit/close/reopen station (validation, duplicates, hours); create model; add scooters until the station is full; status change; edit and move; retire; create/disable staff; city manager scoping including a tampered form; phone-width layout of every console page.

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

## Known limitations and accepted risks
- `npm audit` reports 4 high advisories in the **`prisma` command-line tool** (dev dependency; its bundled MySQL driver and a config helper). They are not part of the running API and we use PostgreSQL. Fixing them requires downgrading Prisma; revisit when a patched Prisma 7 is released.
- Login throttling is per email only. A per-IP limit needs the reverse-proxy setup (the website calls the API from its own server, so all users share one IP). Planned with production hardening (Phase 12).
- A locked email can be locked by anyone who keeps guessing (a standard trade-off); the lock lasts 15 minutes.
- Swagger UI (`/api/docs`) is enabled in every environment; restrict or disable it for production (Phase 12).
- The website sets no Content-Security-Policy yet (Phase 12 hardening).
- Not tested: iOS, physical Android devices, browsers other than Chromium, screen readers (basic labels/contrast follow the design rules), load/performance at scale, real SMS/payment/KYC providers (mocks until Phases 9-10).
- Only the browser pane was used for UI checks, with phone emulation for layout; real-phone testing is still advisable before launch.
