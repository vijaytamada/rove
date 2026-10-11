# RBAC

## Roles & scope
| Role | Scope | Source of scope |
|---|---|---|
| `SUPER_ADMIN` | Global | — |
| `CITY_MANAGER` | One or more cities (and all stations/vehicles/bookings in them) | `StaffAssignment.cityId` |
| `STATION_EMPLOYEE` | One or more stations | `StaffAssignment.stationId` |
| `CUSTOMER` | Own profile, bookings, payments, settlements | `userId` from JWT |

A user has exactly one role. Role is in the JWT; **scope is loaded from DB (cached short-term)**, not trusted from the token, so reassignment takes effect quickly.

## Enforcement
1. `JwtAuthGuard` (global) — everything protected unless `@Public()`.
2. `RolesGuard` + `@Roles(...)` — coarse role check.
3. Scope check in the **service layer** (`ScopeService.assertCityAccess(user, cityId)` / `assertStationAccess(user, stationId)`) — resource-level; list queries are filtered by scope.
4. Customers: always filter by `booking.customerId === user.id`; return 404 (not 403) for others' resources.
5. Staff can never create/escalate roles above their own: manager creates employees only within their cities; only super admin creates managers/admins.

## Implementation (Phase 2)
- `JwtAuthGuard` and `RolesGuard` are global (`APP_GUARD`). Mark open routes `@Public()`; restrict with `@Roles('SUPER_ADMIN', ...)`; read the caller with `@CurrentUser()`.
- `ScopeService.getScope(user)` reads `StaffAssignment` from the DB on every check. `assertCityAccess(user, cityId)` and `assertStationAccess(user, { stationId, cityId })` throw `FORBIDDEN_SCOPE`. Phase 3 services call these with the station's city resolved from the DB.
- Access tokens carry only `sub` and `role` (role changes take effect when the access token expires, ≤ 15 min). Disabling a user revokes refresh tokens immediately; an already-issued access token stays valid until it expires.
- `StaffAssignment.cityId/stationId` are plain UUID columns until Phase 3 adds the City/Station tables and foreign keys. A DB CHECK enforces exactly one of the two per row. CITY_MANAGER rows must be cities, STATION_EMPLOYEE rows must be stations.
- Phase 3: city managers create and manage station employees. A manager can manage an employee only if every station the employee is assigned to is in the manager's cities, and can only assign stations in their own cities. Managers cannot create or edit managers or admins.
- `ScopeService.assertStationIdAccess(user, stationId)` loads the station (404) and checks scope; `stationFilter(user)` gives the Prisma filter for list endpoints.

## Permission matrix (✓ = allowed within scope)
| Capability | Super Admin | City Manager | Station Employee | Customer |
|---|:-:|:-:|:-:|:-:|
| Browse cities/stations/available vehicles | ✓ | ✓ | ✓ | ✓ (public) |
| Manage cities | ✓ | — | — | — |
| Manage stations | ✓ | ✓ (own cities) | — | — |
| Manage vehicle models (global catalogue) | ✓ | read only | read only | — |
| Manage pricing plans (Phase 4) | ✓ | read only | read only | — |
| Manage vehicles (create/status) | ✓ | ✓ (own cities) | status→MAINTENANCE only (own station) | — |
| Create managers | ✓ | — | — | — |
| Create station employees | ✓ | ✓ (stations in own cities) | — | — |
| Sign up (by phone) / edit own profile | — | — | — | ✓ |
| Edit own profile | ✓ | ✓ | ✓ | ✓ |
| Create booking / pay / cancel own | — | — | — | ✓ |
| View bookings | all | own cities | own stations | own |
| Pickup / return / record damage | ✓ (override) | ✓ | ✓ (own station) | — |
| Override damage fee / waive charges | ✓ | ✓ | — | — |
| View settlements | all | own cities | own stations | own |
| Collect/clear outstanding | ✓ | ✓ | ✓ (own station) | pays own |
| Dashboards | global | city | station | own |
| View audit log | ✓ | own cities (read) | — | — |

## Station desk scope (Phase 5)
- `STATION_EMPLOYEE` acts on bookings of the stations they are assigned to; `CITY_MANAGER` on every station in their cities; `SUPER_ADMIN` everywhere. Pickup and no-show need the booking's pickup station to be one you operate (`FORBIDDEN_SCOPE` otherwise).
- A scooter that is out on a ride can be taken back by staff of **any station in the booking's city** (they see it under "On a ride"), but only to a station they operate. Staff of other cities get 404 for it.
- Reading another station's booking is 404, not 403, so its existence is not revealed. Staff responses never include the pickup PIN.
- All desk routes need `STATION_EMPLOYEE`, `CITY_MANAGER` or `SUPER_ADMIN`; customers get 403. The e2e suite covers each role and scope, and the QA sweep checks every desk route rejects anonymous and wrong-role callers.

## Settlements (Phase 6)
- Customers read and pay only their own bill (`/bookings/:id/settlement`, 404 for anyone else's); staff get 403 on those routes.
- Staff routes (`/settlements`) are scoped like the desk: a bill is visible to staff who run the booking's pickup station or the station the scooter was returned to (managers: their cities; admins: all). Other stations get 404, customers 403.
- Staff can take the payment of an amount owed and retry a failed refund. **Waiving or changing a charge is not built yet** (the matrix row below is the plan: managers and admins).

## Dashboards (Phase 7)
- `GET /dashboard/admin`: super admin only. `GET /dashboard/city/:id`: a manager of that city or a super admin (another city's manager gets 403). `GET /dashboard/station/:id`: the station's employee, a manager of its city, or a super admin. `GET /dashboard/customer`: customers only (staff get 403).
- The website's `/admin` overview picks the right one for the role: admins see the network and can open any city; managers always see one of their cities (a city in the URL that is not theirs is ignored). The station desk shows the station dashboard for an employee's own station or the station chosen in the filter.

## Notes
- Employee "own station" for a return means the **return station** (the vehicle may have been picked up elsewhere).
- Customers cannot book without a verified identity check (`KYC_REQUIRED`); a customer who owes money for an earlier ride cannot book again (`OUTSTANDING_BALANCE`) until it is paid. Phase 4: booking, payment, cancel and the identity check are `CUSTOMER`-only routes (staff get 403, even admins); pricing plans are readable by all staff and writable by super admins only; a customer sees only their own bookings (404 for others).
- Customers sign in with phone + one-time code; staff roles sign in with email + password. A customer can never use the password endpoint and a staff number is never sent a sign-in code. There is no public registration: staff accounts are created by a super admin (or a manager for employees).
- Deactivated users (`status=DISABLED`) are rejected at login and refresh.
- Every staff mutation that touches money, vehicle status, or roles writes an `AuditLog` row.
