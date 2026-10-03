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
| Manage pricing plans (Phase 4) | ✓ | ✓ (own cities) | — | — |
| Manage vehicles (create/status) | ✓ | ✓ (own cities) | status→MAINTENANCE only (own station) | — |
| Create managers | ✓ | — | — | — |
| Create station employees | ✓ | ✓ (stations in own cities) | — | — |
| Register / edit own profile | ✓ | ✓ | ✓ | ✓ |
| Create booking / pay / cancel own | — | — | — | ✓ |
| View bookings | all | own cities | own stations | own |
| Pickup / return / record damage | ✓ (override) | ✓ | ✓ (own station) | — |
| Override damage fee / waive charges | ✓ | ✓ | — | — |
| View settlements | all | own cities | own stations | own |
| Collect/clear outstanding | ✓ | ✓ | ✓ (own station) | pays own |
| Dashboards | global | city | station | own |
| View audit log | ✓ | own cities (read) | — | — |

## Notes
- Employee "own station" for a return means the **return station** (the vehicle may have been picked up elsewhere).
- Customers cannot book if `phoneVerified=false`, `kycStatus!=VERIFIED`, or they have an outstanding settlement.
- Deactivated users (`status=DISABLED`) are rejected at login and refresh.
- Every staff mutation that touches money, vehicle status, or roles writes an `AuditLog` row.
