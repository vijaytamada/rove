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

## Permission matrix (✓ = allowed within scope)
| Capability | Super Admin | City Manager | Station Employee | Customer |
|---|:-:|:-:|:-:|:-:|
| Browse cities/stations/available vehicles | ✓ | ✓ | ✓ | ✓ (public) |
| Manage cities | ✓ | — | — | — |
| Manage stations | ✓ | ✓ (own cities) | — | — |
| Manage vehicle models / pricing plans | ✓ | ✓ (own cities, plans) | — | — |
| Manage vehicles (create/status) | ✓ | ✓ (own cities) | status→MAINTENANCE only (own station) | — |
| Create managers | ✓ | — | — | — |
| Create station employees | ✓ | ✓ (own cities) | — | — |
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
