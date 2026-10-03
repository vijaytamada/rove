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
| 2026-10-03 | Login = email + password for all roles; phone verified by mock OTP (open decision #1 resolved with default) | Simplest MVP |
| 2026-10-03 | Phase 2: only SUPER_ADMIN creates/manages staff; manager-creates-employee deferred to Phase 3 | Needs stations to resolve city ownership |
| 2026-10-03 | `StaffAssignment` city/station ids have no FK until Phase 3 | Tables don't exist yet |
| 2026-10-03 | Vitest uses a small TypeScript-compiler plugin for decorator metadata instead of SWC | SWC native binary blocked by Windows folder ACLs |

## 8. Open questions
See the end of the planning summary / `docs/PHASES.md` §Open decisions. Resolve before the phase noted.
