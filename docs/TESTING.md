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

## What is covered (state after Phase 7, 2026-10-09)
| Area | Tests |
|---|---|
| Backend | 104 unit (dashboard windows and utilization maths; settlement engine: 33 table-driven cases - started km, the grace boundary, late hours, damage, charges equal to / one paisa over the deposit, no deposit, zero rates, bad input; rental rules: pickup window, no-show time, damage to maintenance, distance; incl. quote maths, booking windows, opening hours across midnight and time zones, cancellation refund rules, codes and PIN), 179 end-to-end (phone sign-in and sign-up, OTP limits, staff login, tokens, RBAC and scope, cities/stations/models/vehicles, staff management, security headers, hostile input, login throttle, capacity races; **Phase 4: 37 booking tests** - identity check, pricing plans and city overrides, quote, creating bookings, no double booking (6 parallel attempts, one wins; the database constraint on its own), payment holds that expire, idempotent and parallel payments, failed payment then retry, tabs, cancellation refunds (early, late, within 10 minutes, twice at once), availability in a window, station open/closed, staff cannot change booked scooters; **Phase 5: 20 station desk tests** - desk lists and search per role, other stations get 404, wrong and locked PIN, pickup window, ID check required, handover records the readings and damage, replacement scooter, return to another station in the same city only, odometer and battery checks, damage sends the scooter to maintenance, parallel pickups and returns, no-show with deposit refund, customers cannot use the desk; **Phase 6: 22 settlement tests** - clean return refunds the whole deposit and settles the booking, extra km, late fee inside and past the grace period, all charges together, the database refuses a bill that does not add up, no bill for cancelled bookings, customers read only their own bill, charges equal to the deposit, an outstanding amount (recorded, nothing refunded, under Active), new bookings blocked until it is paid, declined payment then retry, repeated key and 6 parallel taps pay once, bad key / stranger / nothing to pay, the desk lists only its own stations, other stations 404 and customers 403, collecting at the desk, a failed refund stays pending then is retried, a failed retry, parallel retries refund once, one successful deposit refund per payment; **Phase 7: 16 dashboard tests** on one isolated test city - station numbers (fleet, window activity, collected / refunded / net, deposits held, owed, utilization about 5%), the queue with a late ride flagged and no PIN, a quiet station shows zeros, scope for every role, city and network rows add up, the 24 hour / 7 day / 30 day windows only count what happened inside them, and the customer dashboard (ride in progress, upcoming, recent with totals, money owed up front then cleared by paying, empty home, customers only)) |
| Website | lint + production build; `pages.mjs`: 42 routes × 5 roles (anonymous, customer, employee, manager, admin) = 210 checks (now also the dashboard range values) plus 24 content/scoping checks (dashboard content per role, a manager cannot open another city through the URL, the station strip, the 24 hour labels); interactive flows in a browser (see below) |
| Flutter | 84 unit and widget tests (booking: city label vs selector sheet, prices from the backend, identity check then payment then code and PIN, failed payment and retry, expired hold, closed slot message, picking a time, My bookings tabs, cancel with refund preview, closed station; money and city-time formatting; API client token refresh, auth controller incl. offline, phone sign-in: code, wrong code, new-number name step, expired ticket, resend countdown, change number; code boxes, profile read-only view, inline name edit, two-step phone change (right code, wrong code, number taken), verify-now, station browsing) |
| API sweep | 146 checks (now also: the four dashboard routes reject anonymous callers and the wrong roles, a manager cannot read another city's dashboard, a bad range is a clean 400): every route in the OpenAPI spec rejects anonymous (401) and wrong-role (403) calls; hostile/malformed input gives clean 4xx with no leaks; headers; CORS; JWT tampering; refresh-token misuse; login throttling |
| Concurrency | 6 probes: station capacity (create and move), duplicate vehicle code, duplicate city, parallel sign-ups for one new phone number (two tickets), parallel status/update, parallel refresh |
| Database | Fresh database built from all 8 migrations + seed run twice (idempotent), re-checked after Phase 6 (new tables, CHECK constraints and the one-refund index present); CHECK constraints; no leftover test rows |
| On device | 2026-10-08, Android emulator: station list with the city selector sheet, closed-now chips, booking screen (rates, Pick a time with the date and time pickers, live price), checkout, confirmation with code and PIN, My bookings, cancel with refund. Earlier: Android emulator (Pixel 8, Android 15): sign in, session survives app restart, stations and scooters, backend outage and recovery; 2026-10-04: sign-in code boxes (typing, wrong code), read-only profile, inline name edit, two-step phone change (wrong code keeps the old number, right code saves it), keyboard does not cover the sheet |

**Role-by-role pass, 2026-10-09 (website in the browser pane at desktop and phone width, app on the Android emulator, real clicks, test customers "QA One".."QA Seven" and the demo customer):**
- *Station employee (Indiranagar):* desk shows only its own pickups; hand-over with a wrong PIN (field error, ID box stays ticked) then the right PIN with an existing-damage note; return with extra km and a damage charge (bill and refund correct); return with a lower odometer (rejected with a message); a late return (3 started hours) with major damage (scooter goes to maintenance); a Koramangala booking is "not found" and its settlement is not listed; phone-width desk, forms and bill.
- *Station employee (Koramangala):* Settlements -> Owed -> **Payment received** (becomes Paid, customer can book); Refunds waiting -> **Send the refund again** failed once with a visible alert (both failures kept as history), then went through after the gateway reference was restored and settled the booking.
- *City manager (Hyderabad):* overview, cities, stations, fleet and pricing show Hyderabad only (pricing read-only); desk shows only Hyderabad with a station filter; a cross-station return to Banjara Hills; a hand-over by the manager; a Bengaluru booking is "not found".
- *Super admin:* overview for both cities, desk across all five stations, Paid settlements from both cities.
- *Customer on the website (phone width):* Payment due in My bookings, the owing booking and bill, the pay page, a decline then payment, back on the booking with the confirmation; trying to book while owing redirects to pay first (desktop).
- *Customer in the app:* Home and Bookings show *Payment due · Owe ₹250*, the refunded bill (10 extra km + 2 late hours), the stuck-refund wording, booking while owing -> Pay what you owe -> back on the booking screen with a note -> Continue -> checkout.
- Not covered: iOS and a second emulator; real SMS, payment or KYC providers; browsers other than the built-in one.

Manually driven in the browser, 2026-10-08, settlement: staff Settlements list (Owed), desk booking page with the Final bill panel and *Payment received*; as the customer: *Payment due* in My bookings, the owing booking (banner, bill), a refunded ride's bill (3 extra km, 2 late hours, ₹1,221 back), trying to book while owing -> redirected to Pay what you owe, a simulated decline then the real payment -> back on the booking page with the choices kept. On the Android emulator the same day: Home card *Payment due · Owe ₹300*, the bill, Pay what you owe, a simulated decline, the payment, then *You paid* and the timeline entry.

Manually driven in the browser, 2026-10-08, station desk: signed in as the Indiranagar employee, opened a paid booking whose start was three hours ago, **Mark as no-show** (confirmation names the refund and what is kept, then a green banner, status No show, "Refunded" row). On the Android emulator the same day: Home card and booking detail for an **in-ride** booking (return-by banner), **returned** ("Returned to Indiranagar after 12.5 km") and **no-show** (refund line, "Refunded to you"), made with the real desk API.

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

## Findings from the Phase 5 test pass (all fixed)
| # | Severity | Finding | Fix |
|---|---|---|---|
| 18 | Low | The desk booking page kept saying "Deposit held" after a no-show refunded it, and never showed the refund (the staff view had no refund total) | Staff view now carries `refundedAmount`; the page says "Deposit" and adds a "Refunded" row; e2e test asserts it |
| 19 | Low | The page check did not know the new desk routes | `pages.mjs` covers `/staff/fleet` and the desk booking pages (anonymous, customers, other roles, bad ids) |

## Findings from the Phase 6 test pass (all fixed)
| # | Severity | Finding | Fix |
|---|---|---|---|
| 20 | Medium | The API client in the app lost the error code for errors that carry data instead of a list (`OUTSTANDING_BALANCE` came through as a generic error, so the pay-first step never opened) | The client keeps object details as `info`; widget test for the whole block-pay-continue flow |
| 21 | Low | The website's staff booking page said "This ride is complete" while the customer still owed money or a refund was stuck | The message names the real state |
| 22 | Low | The app's pay-what-you-owe bar said "Total" where the website says "You owe" | Caption is a parameter of the shared bar |
| 23 | Low | `sweep.mjs` did not know the new customer-only routes (2 false failures) | Added |

## Findings from the role-by-role pass (2026-10-09, fixed on `fix/qa-findings`)
| # | Severity | Finding | Fix |
|---|---|---|---|
| 24 | **High** | On phones the **Pay what you owe** bar was hidden behind the bottom tab bar, so a customer could not pay on a phone (the tab bar hid itself only on the booking and pay pages) | The tab bar also hides on `/bookings/[id]/settle` |
| 25 | Low | The staff return form defaulted to the first station alphabetically, not the station the ride started from | Defaults to the pickup station when staff run it |
| 26 | Low | The admin overview still said bookings and rentals arrive in later phases | Reworded |
| 27 | Low | The desk search placeholder was cut off on phones | Shorter text |
| 28 | Low | The app showed "after 6.0 km" where the website says "6 km" | `formatKm` + test |
| 29 | Note | A wrong-PIN error stays under the field while the PIN is being retyped, until the next submit | Not changed |

## Notes from the Phase 7 build
- The dashboard numbers were checked against the database by hand (deposits held, refunds pending, 7-day collected and refunded, fleet counts, and the per-city rows adding up to the network total) and the admin overview was viewed on desktop and phone.
- A phone-width pass found the stat tiles stacked one per row (a very long scroll); they are now two per row. The admin city view no longer shows a Staff tile, because that count covered the whole network.
- Looked at in a browser or on the emulator: the admin overview (desktop, phone, a city drill-down), the Koramangala employee's desk strip on a phone, the customer home on the website (text) and on the emulator. Planned for the next full pass: the manager's view with several cities, and the manager and customer screens on phones.

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
- On a no-show the customer's price card still says "Returned after you bring the scooter back" under the deposit (cosmetic; the refund line below it is correct).
- `pages.mjs` expects the seeded scooter `BLR-001` to be at its station: finish or return any ride you started by hand before running it.
- Dashboards: utilization shows 0% in the dev data because test rides last seconds; it is meaningful with real rides. Money figures include held deposits (labelled), so they are not earnings. A scooter out on a ride is counted from the ride, not from a station. Large networks would want these queries cached or pre-aggregated (Phase 12).
- Settlement: charges and refunds are mock-money (Phases 9-10). A charge cannot yet be waived or changed after staff enter it, so a wrong damage fee is only fixable by collecting more. Gateway refund confirmations (Razorpay `refund.processed`, Cashfree refund webhooks) arrive in Phase 10; until then "refund sent" means the provider call returned success. Nothing notifies the customer (Phase 8) and there is no audit log of who took payment or retried a refund (Phase 9).
- `pages.mjs` also expects the seeded scooter `BLR-001` at its station and available: a ride that sent it to maintenance (moderate or major damage) makes the station-page check fail until an admin puts it back in service.
- Station desk: the handover and return forms are covered by the e2e tests and the page checks, but only the no-show button was clicked through in a browser. There is no photo of damage yet (Phase 12) and no money charged for damage, extra km or lateness until Phase 6.
- Only the browser pane was used for UI checks, with phone emulation for layout; real-phone testing is still advisable before launch.
