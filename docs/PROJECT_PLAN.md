# Project Plan

## 1. Vision
Station-based e-scooter rental, designed to expand to multiple cities and vehicle types later. First goal: a working end-to-end rental lifecycle on mocked integrations.

## 2. MVP scope (Phases 1–6, demo-able after Phase 6; usable by staff after Phase 7)
Auth + RBAC · cities · stations · e-scooters · availability · customer browsing · booking · mock payment · booking confirmation · pickup · return · odometer · basic damage recording · pricing · late fee · excess-km fee · security deposit · settlement · refund/outstanding · booking history.

**Demo script**
Customer browses → books → mock-pays → booking confirmed (code + PIN) → station employee verifies & starts pickup → vehicle IN_RIDE → return at a station → settlement computed → deposit refunded / outstanding generated.

## 3. Out of scope until their phase
Real OTP/KYC/Aadhaar, real payments, GPS/IoT, push/SMS notifications, bikes/cars, multi-currency, promotions/coupons, subscriptions, invoices/GST, maintenance workflows, multi-tenant operators.

## 4. Principles
Simple modular monolith · mocks first · pure pricing engine · one phase at a time · each phase ends in a usable, tested increment · docs updated with decisions.

## 5. Documents
| Doc | Purpose |
|---|---|
| `.ai-context/PROJECT_CONTEXT.md` | Rules + context for every Claude Code session |
| `docs/PHASES.md` | Phase roadmap, scope, completion checklists |
| `docs/ARCHITECTURE.md` | Modules, provider abstraction, state machines, flows |
| `docs/DATABASE.md` | Entities, conventions, enums |
| `docs/API.md` | API conventions + planned endpoints per phase |
| `docs/RBAC.md` | Roles, scopes, permission matrix |

## 6. Default business assumptions (change via Decision Log)
These are the simplest reasonable defaults so Phases 4–6 can proceed; confirm before Phase 4.
- Currency INR; amounts in paise.
- Rental is **prepaid for a booked duration** (hourly granularity; daily plans can be modelled as 24h blocks). Pricing is defined per `PricingPlan` (per vehicle model, optionally per city).
- `PricingPlan` fields: hourly rate, included km per booked hour, extra-km rate, grace period (minutes), late fee per started hour after grace, security deposit amount.
- Settlement = `deposit − (extraKmFee + lateFee + damageFee)`. Result ≥ 0 → refund; < 0 → outstanding amount owed by customer.
- A booking **reserves a specific vehicle** at booking time (prevents overbooking); staff may swap the vehicle at pickup (e.g. fault) with a recorded reason.
- Vehicles can be returned to **any station in the same city** (one-way across cities not allowed). Returning to a different station than pickup is allowed; any inter-station fee is deferred.
- Unpaid bookings expire after 10 minutes. Cancellation before pickup: full refund if > X hours before start, else rental forfeited (policy value is config, default decided in Phase 4).
- Customers must have `phoneVerified` and `kycStatus=VERIFIED` to book. In the MVP both are satisfied by mock providers.
- Damage fee is entered by the station employee / city manager at return (flat amount + notes + optional photo URL); no automated assessment.

## 7. Decision Log
| Date | Decision | Reason |
|---|---|---|
| 2026-10-03 | Repo root = `D:\Source Codes\vibe-coding` (no `e-scooter-rental/` wrapper) | Directory was empty |
| 2026-10-03 | Modular monolith; separate `package.json` per app, no monorepo tooling yet | Simplicity |
| 2026-10-03 | Money stored as integer paise | Avoid float errors |
| 2026-10-03 | Provider interfaces + Nest injection tokens for OTP/KYC/Payment/Notification/Telemetry | Swap mocks for real later |
| 2026-10-03 | Web-first MVP; Flutter customer app after Phase 6 | Faster feedback; Flutter project is only scaffolded in Phase 1 |

| 2026-10-03 | Working brand name **Rove** (temporary) via `APP_NAME` constant | Placeholder |
| 2026-10-03 | Docker host ports Postgres 5442 / Redis 6389 | 5432/6379 used by other local stacks |
| 2026-10-03 | Backend follows Nest 12 defaults (ESM, Vitest, oxlint) and Prisma 7 (`@prisma/adapter-pg`) | Use scaffold defaults |
| 2026-10-03 | Env validated with zod; single `.env` at repo root shared by backend and Prisma | Fail fast |
| 2026-10-03 | shadcn/ui deferred until a screen needs it | No dependency before it's needed |
| 2026-10-03 | Flutter Phase 1 uses `dart:io` HttpClient (no `http` package yet) | Avoid unneeded dependency |
| 2026-10-03 | Dev emulators: `Rove_Pixel` (Pixel 8) and `Rove_Pixel_10`, Android 15 Google APIs image, one at a time | Stability on WHPX; see `docs/DEV_SETUP.md` |

| 2026-10-03 | Phase 2 auth: opaque rotating refresh tokens (hashed in DB) + short-lived JWT access tokens; no Passport; argon2id via `@node-rs/argon2` | Fewer dependencies, reuse detection |
| 2026-10-03 | Login = email + password for all roles; phone verified by mock OTP (open decision #1 resolved with default) | Simplest MVP. **Superseded by the next three rows** |
| 2026-10-03 | Customers sign in with **phone number + one-time code** (default and only customer method). Public registration removed; a new number creates the account after a name step, using a single-use signup ticket | Phone is the identity customers have; no passwords to forget or leak |
| 2026-10-03 | Staff, city managers and admins keep **email + password**, on a separate `/login/staff` page (website only) | Staff accounts are created by admins and need a credential that works without a phone |
| 2026-10-03 | Customer accounts need no email and no password; an optional email is deferred to Phase 8 (notifications). Customers get no password option for now | Fewer fields at sign-up; revisit if users ask for it |
| 2026-10-03 | Sign-in code limits: 30 s resend cooldown, 5 sends per number per hour, 5 wrong attempts per code, daily cap on all sends (`OTP_DAILY_SEND_CAP`); the same response for known, unknown and staff numbers | Guards against SMS-pumping cost and account enumeration; rules live in `OtpService`, so a real provider (Phase 9) changes nothing here |
| 2026-10-03 | Phase 2: only SUPER_ADMIN creates/manages staff; manager-creates-employee deferred to Phase 3 | Needs stations to resolve city ownership |
| 2026-10-03 | `StaffAssignment` city/station ids have no FK until Phase 3 | Tables don't exist yet |
| 2026-10-03 | Vitest uses a small TypeScript-compiler plugin for decorator metadata instead of SWC | SWC native binary blocked by Windows folder ACLs |

| 2026-10-03 | Website is a responsive desktop-first website for all roles (supersedes the earlier "phone-style column" direction); Flutter is a separate customer app sharing API, tokens and screen specs | Staff/admin need a real website; app is a different product |

| 2026-10-03 | **Mobile app is customer-only.** Station employees, city managers and admins use the website (responsive, works on phone/tablet). A separate staff app is planned later (not now; revisit in Phase 12 for QR scanning, offline and smart locks) and would share the Flutter codebase, API client and tokens | Keeps staff/admin code out of the public app; each app fits its users |

| 2026-10-03 | Phase 3: vehicle models are a global catalogue managed by super admins only (managers read); pricing plans (Phase 4) are per city and managed by managers | Models are shared across cities |
| 2026-10-03 | Stations and cities are never deleted (inactive/hidden instead); vehicles are retired (soft delete) | Keep history for bookings |
| 2026-10-03 | Employees may only flag MAINTENANCE; managers/admins set AVAILABLE/OFFLINE; RESERVED/IN_RIDE are system-controlled | Matches the RBAC matrix and protects bookings |
| 2026-10-03 | Public station listing shows availability by current status; time-window availability arrives with bookings in Phase 4 | Needs booking data |
| 2026-10-03 | Demo data uses a fictional vehicle brand (Voltra) | No claims about real products |
| 2026-10-04 | Git: `main` = stable, `dev` = integration (level on 2026-10-04, then `dev` runs ahead); all changes are made on `feature/*` branches cut from `dev` and merged into `dev` (`--no-ff`) when done; `dev` is merged into `main` once several features are stable and the full re-test passes. Customer sign-in field is India-only (+91 prefix, 10 digits) for now | Simple model; other country codes can be added later |
| 2026-10-04 | Admin console redesigned: full-width lists, "Add ..." opens a modal form, forms show only fields for the chosen role, tables become cards on phones, sidebar only from 1280px; one-time codes entered in separate boxes (web + Flutter). City managers keep adding station employees for stations in their cities (backend rule unchanged) | Side-by-side table + form squeezed both; the long staff form showed fields that did not apply |
| 2026-10-04 | Profile: details are read-only with pencil buttons; a phone number change is saved only after a code sent to the NEW number is confirmed (`POST /auth/phone/change` then `/auth/phone/change/verify`). `PATCH /me` no longer accepts `phone`. A saved but unverified number keeps the older `/auth/otp/send` + `/verify` path | The old flow saved an unconfirmed number first, so a typo could lock someone out of sign-in or take over a number; verifying first is safer and matches the requested UX |
| 2026-10-07 | Phase 4 booking rules: rent 1-24 whole hours, starting now or up to 7 days ahead; price = hourly rate × hours, capped by an optional day rate, plus a separate refundable deposit; a booking reserves a specific scooter and holds it for 10 minutes while the customer pays; at most 5 open bookings per customer and none overlapping each other | Simple defaults from the open decisions; one pricing engine on the backend |
| 2026-10-07 | Availability comes from bookings, not from `Vehicle.status`: a scooter stays `AVAILABLE` while it has bookings and can be booked for several non-overlapping windows. A scooter with a live booking cannot be moved, retired or set to maintenance/offline (409) | Lets future bookings coexist; `RESERVED`/`IN_RIDE` are set at pickup (Phase 5) |
| 2026-10-07 | Double-booking is prevented three ways: row lock on the vehicle, expired holds cleared first, and a Postgres exclusion constraint | Money is involved; the database is the last line of defence |
| 2026-10-07 | Cancellation: unpaid = nothing moves; paid = full refund when 2+ hours before the start **or within 10 minutes of paying** (so a "ride now" booking can be undone), otherwise the deposit only; not possible after the booked window ends. The 10-minute grace is an addition to the 2-hour default | A booking that starts now would otherwise be non-refundable the moment it is paid |
| 2026-10-07 | The pickup PIN is derived (HMAC of the booking id with the server secret), not stored: customers can see it again, staff verify it by deriving it, and a database leak reveals no PIN. The booking code is `RV-` + 6 letters/digits without lookalikes | Replaces the planned "PIN hash", which would hide the PIN from the customer |
| 2026-10-07 | Payment is a mock behind `PaymentProvider` (`PAYMENT_PROVIDER=mock`): each `pay` call needs an `Idempotency-Key` to be replay-safe, a row lock stops double taps, a failed payment keeps the hold, and a payment that succeeds after the hold ended is refunded. A demo "make this payment fail" option exists outside production only. KYC is a mock behind `KycProvider` that verifies at once; booking requires it | Exercise the real flow (failure, retry, expiry) before Phase 10 |
| 2026-10-07 | Pricing plans: one default per model, a city plan replaces it in that city; only super admins edit (managers read); a booking stores a snapshot of the rates so later edits never change it. A scooter without a plan is listed as "Not open for booking yet" | Pricing is a company decision; customers must get what they agreed to |
| 2026-10-07 | Cities are never shown side by side: the customer picks from a popup list (sheet on the app, dialog on the website, with search from 8 cities); with one city it is a plain label and is chosen automatically | Scales to many cities |
| 2026-10-07 | Times are shown in the city's time zone on both clients (the website via `Intl`, the app exactly for India's fixed offset and from the device clock for any other zone until a second zone exists). A start time typed by the customer is read on the station's clock. Stations report `openNow`; a closed station can still be booked for a time when it is open | A pickup happens at a station; no extra Flutter dependency |
| 2026-10-08 | Station desk rules: pickup opens 15 minutes before the start and closes when the booked time ends; a no-show can be marked one hour after the start (or at the end if sooner); five wrong PINs lock pickup for a booking for 15 minutes; a ride longer than 2000 km on the odometer is rejected as a typo | Simple, explainable thresholds in one file (`rental-rules.ts`) that later phases can tune; open decision #8 stays "same city, any station" |
| 2026-10-08 | No-show: the deposit is refunded at once through the payment provider (reason `NO_SHOW`) and the rental charge is kept; the scooter is bookable again | The customer reserved the scooter and the station held it; mirrors the late-cancellation policy |
| 2026-10-08 | Staff responses carry `actions` with `allowed` and a plain-language `reason`, computed on the server | The web desk and any future staff app never re-implement the rules; they only show what the server says |
| 2026-10-08 | A faulty scooter can be swapped at handover for a free scooter of the same model at the same station (reason required, original kept on the `Rental`); the booking then points at the new one | Staff need a way out without cancelling a paid booking; same model keeps the price valid |
| 2026-10-08 | Moderate or major damage, or a staff request, sends the returned scooter to `MAINTENANCE`; minor damage keeps it `AVAILABLE`. Damage fees are flat amounts entered by staff and only recorded in Phase 5 (charged in Phase 6) | Open decision #9 (flat entry) |
| 2026-10-08 | A booking that is out on a ride is visible to staff of every station in its city, because any of them may take it back; everything else is limited to the booking's own stations (and the station that took it back, for history). Other stations get 404 | Open decision #8 and the RBAC note that "own station" for a return means the return station |
| 2026-10-08 | The station desk is website-only; the customer app only shows ride states. The staff mobile app decision stays with Phase 12 | Keeps the customer app customer-only |
| 2026-10-08 | Extra km are charged per started kilometre beyond the allowance (`includedKmPerHour x booked hours`); the late fee is per started hour counted from the booked end, free at or inside the grace period (open decision #6: per started hour, 15 minutes grace); damage is the flat fee staff entered at return, and only damage found at return is billed | One rule for each charge, explainable to a customer, and the engine is a pure function with table-driven tests |
| 2026-10-08 | Charges come out of the deposit; what is left is refunded, what is more is owed. The prepaid rental is never refunded for an early return | Matches the plan's settlement formula |
| 2026-10-08 | The deposit refund is automatic and per ride, sent right after the return is saved, to the original payment method. No end-of-day batch and no manual step by default; a failed refund stays `REFUND_PENDING` and station staff, managers or admins retry it from Settlements | Gateways (Razorpay, Cashfree) refund one payment at a time and take days to settle, so batching only delays the customer; retry covers failures |
| 2026-10-08 | The bill is created inside the return transaction (so a ride is never returned without one); the gateway call happens after it commits. The booking becomes `SETTLED` once the refund went through or there was nothing to refund; an amount owed is tracked on the settlement | Money movement must not hold a database transaction open, and a crash leaves a visible `REFUND_PENDING` to retry |
| 2026-10-08 | A customer who owes money cannot create a new booking (`OUTSTANDING_BALANCE`); the quote stays public. They pay on the website or app (mock) or at the desk with a staff member (mock). Open decision #10 | Simple block that is easy to understand; no collections process yet |
| 2026-10-08 | One successful deposit refund per payment is enforced by a partial unique index, and retries use a new per-attempt gateway key | A retry or a parallel call can never send the deposit twice |
| 2026-10-08 | Cancelled and no-show bookings have no settlement (their refunds are in the booking rules) | Nothing was ridden |
| 2026-10-08 | Not built in Phase 6: waiving or adjusting a charge, holding a refund for manager review, a refund audit log (Phase 9), gateway webhooks for refund status (Phase 10), customer notifications (Phase 8) | Kept out to stay in scope; the settlement statuses leave room for each |
| 2026-10-09 | Dashboards are four read-only endpoints (admin, city, station, customer) with no new tables; the staff ones take a rolling window (last 24 hours, 7 days or 30 days, default 7 days) instead of calendar days | One definition that works across cities in different time zones; no data model change |
| 2026-10-09 | Money on the dashboards is plain: collected (successful payments), refunded (successful refunds) and net for the window, plus deposits held, amounts owed and refunds not sent right now. Net is labelled as not being earnings because it includes held deposits | Honest numbers anyone can reconcile to the payment list; real revenue accounting (deposits as liabilities, tax) belongs with Phase 10 |
| 2026-10-09 | Utilization = ride hours in the window divided by scooter-hours (fleet size x window hours), computed in SQL and capped at 100 | Needs no new data and compares cities and stations fairly |
| 2026-10-09 | Rides, payments and settlements count for the station where the ride started; a scooter that is out has no station, so the fleet total adds the rides out to the scooters at stations | Matches how the data is stored; documented in the API |
| 2026-10-09 | A manager's overview is always one of their cities (city tabs if several); an admin sees the network and can open any city. A city in the URL that is not a manager's own is ignored, not an error | No way to peek at another city by editing the address |
| 2026-10-09 | The customer dashboard reuses the booking objects of `GET /bookings` (active, upcoming, last 3 finished, what is owed, ride totals) so the website and the app show the same home from one call | Keeps the two clients in step and avoids repeating booking logic |
| 2026-10-11 | Phase 8 notifications are an in-app inbox (a `Notification` table, shown by a bell on web and app) plus a `NotificationProvider` for delivery outside the app, whose mock only logs. **Email is not included now:** customers have no email address (sign-in is by phone) and adding an optional email field would touch sign-up, profile and both clients for little gain; SMS (Phase 9, after India DLT registration) is the real second channel. The provider interface takes a user, phone, title and body, so an email or SMS sender slots in without changing business code | Keeps Phase 8 small and useful today; the vendor-dependent channels wait for Phase 9 |
| 2026-10-11 | Core modules call `NotificationEventsService` directly after saving their own work, instead of publishing events on a bus. Every call is safe to repeat and never throws | One process and one database; tests and the next screen can rely on the message being stored; no listener ordering to reason about |
| 2026-10-11 | One message per booking and event, enforced by a unique `dedupeKey` (`<EVENT>:<bookingId>`); a duplicate insert is simply ignored | A reminder, a retry or a double-click can never send twice |
| 2026-10-11 | Messages never contain the pickup PIN; the booking code and station are enough to find the booking, and the PIN is shown inside the app | A message may later travel by SMS or sit on a lock screen |
| 2026-10-11 | Background jobs are a one-minute timer inside the backend (no new dependency), guarded by a Redis lock so several instances do not double up, and every step is idempotent. `JOBS_ENABLED=false` turns it off (the e2e tests do). A queue such as BullMQ is not needed at this size | The work is tiny and repeatable; revisit if jobs ever need retries with backoff, or heavy volume |
| 2026-10-11 | Reminder rules: pickup reminder in the hour before the start (skipped for a booking made less than an hour ahead); return reminder in the half hour before the ride is due; overdue notice when the grace minutes after the booked end are used up. Expired holds are announced for 24 hours after they ran out | Useful without nagging; constants in `jobs/reminder-rules.ts` |
| 2026-10-11 | Cancelling an unpaid hold sends nothing; cancelling a paid booking says what was refunded, or that the refund is being processed if the gateway refused it. Only customers get messages; staff alerts (failed refunds, overdue rides) are left for later | Nothing worth saying about an unpaid hold; staff already have the Settlements and desk lists |
| 2026-10-11 | **Phase 9 is split.** Built now, because they need no decision from the owner: an audit trail, and the asynchronous identity-check lifecycle (pending, signed webhook, retries, rejection). **Waiting for the owner:** choosing the SMS vendor (and starting India DLT sender/template registration, which takes days to weeks), choosing the identity vendor, and the legal review of Aadhaar use. A vendor is then one class behind `OtpProvider` / `KycProvider` plus its webhook parser | We cannot pick vendors, sign contracts or take a legal position on the owner's behalf; the business code no longer has to change when they do |
| 2026-10-11 | The audit trail is written by a global interceptor on every successful write of a staff, manager or admin account, not by calls inside each service. It keeps the route, ids and an allow-list of numbers and enums, never a body | A new endpoint is audited by default; nothing sensitive can leak in by accident |
| 2026-10-11 | Identity checks: 3 tries in total; a pending check may be restarted after 15 minutes; a late or repeated webhook never changes a final state; a verified customer is never un-verified by a webhook; a super admin can reset the tries (support lever, no screen yet) | Stops endless retries without locking out a customer for good; webhooks are retried by providers, so they must be idempotent |
| 2026-10-11 | Webhooks are verified with a constant-time HMAC-SHA256 over the exact bytes received (`common/webhook-signature.ts`, reusable for payments in Phase 10); the app keeps the raw body (`rawBody: true`) | A forged webhook cannot verify anyone |
| 2026-10-11 | The redirect link to a vendor's hosted check is **not** in the API yet (no vendor, and opening it needs a launcher package in the app). It is added with the vendor adapter | Avoids a dead field and an unused dependency |

## 8. Open questions
See the end of the planning summary / `docs/PHASES.md` §Open decisions. Resolve before the phase noted.
