// Turns "a staff member did POST /station/bookings/:id/pickup" into an audit entry. Pure: no database, no framework.

export interface AuditEntryDraft {
  action: string;
  entityType: string | null;
  /** Taken from the route's `:id`, or from the response when the call created something. */
  entityFromResponse: boolean;
  /** Request body fields that are safe to keep (numbers and enums, never text typed by a person). */
  safeBodyFields: string[];
}

const PLAN_FIELDS = [
  'hourlyRateAmount',
  'dailyRateAmount',
  'depositAmount',
  'extraKmRateAmount',
  'lateFeePerHourAmount',
  'includedKmPerHour',
  'graceMinutes',
  'isActive',
];

/** The routes worth a readable code. Anything else is still recorded, as "METHOD /route". */
const KNOWN: Record<string, { action: string; entityType: string; fromResponse?: boolean; body?: string[] }> = {
  'POST /station/bookings/:id/pickup': { action: 'BOOKING_PICKUP', entityType: 'booking' },
  'POST /station/bookings/:id/return': { action: 'BOOKING_RETURN', entityType: 'booking' },
  'POST /station/bookings/:id/no-show': { action: 'BOOKING_NO_SHOW', entityType: 'booking' },
  'POST /settlements/:id/collect': { action: 'SETTLEMENT_COLLECT', entityType: 'settlement' },
  'POST /settlements/:id/retry-refund': { action: 'SETTLEMENT_RETRY_REFUND', entityType: 'settlement' },
  'POST /kyc/:id/reset': { action: 'KYC_RESET', entityType: 'user' },
  'POST /users': { action: 'STAFF_CREATE', entityType: 'user', fromResponse: true },
  'PATCH /users/:id': { action: 'STAFF_UPDATE', entityType: 'user', body: ['status', 'role'] },
  'PUT /users/:id/assignments': { action: 'STAFF_ASSIGN', entityType: 'user' },
  'POST /pricing-plans': { action: 'PRICING_PLAN_CREATE', entityType: 'pricing-plan', fromResponse: true, body: PLAN_FIELDS },
  'PATCH /pricing-plans/:id': { action: 'PRICING_PLAN_UPDATE', entityType: 'pricing-plan', body: PLAN_FIELDS },
  'POST /vehicles': { action: 'VEHICLE_CREATE', entityType: 'vehicle', fromResponse: true },
  'PATCH /vehicles/:id': { action: 'VEHICLE_UPDATE', entityType: 'vehicle' },
  'PATCH /vehicles/:id/status': { action: 'VEHICLE_STATUS', entityType: 'vehicle', body: ['status'] },
  'DELETE /vehicles/:id': { action: 'VEHICLE_RETIRE', entityType: 'vehicle' },
  'POST /vehicle-models': { action: 'VEHICLE_MODEL_CREATE', entityType: 'vehicle-model', fromResponse: true },
  'PATCH /vehicle-models/:id': { action: 'VEHICLE_MODEL_UPDATE', entityType: 'vehicle-model' },
  'POST /cities': { action: 'CITY_CREATE', entityType: 'city', fromResponse: true },
  'PATCH /cities/:id': { action: 'CITY_UPDATE', entityType: 'city' },
  'POST /stations': { action: 'STATION_CREATE', entityType: 'station', fromResponse: true },
  'PATCH /stations/:id': { action: 'STATION_UPDATE', entityType: 'station' },
};

/** Calls that are not staff changes worth a trail: signing in and out, a person editing their own name, the inbox. */
const SKIPPED_BASES = ['/auth', '/me', '/notifications', '/webhooks', '/dev'];

const API_PREFIX = '/api/v1';

/** Strips the API prefix from an express route pattern, e.g. "/api/v1/users/:id" -> "/users/:id". */
export function routeWithoutPrefix(route: string): string {
  return route.startsWith(API_PREFIX) ? route.slice(API_PREFIX.length) || '/' : route;
}

/** Null when this call should not be audited (reads, and the skipped routes above). */
export function describeRequest(method: string, route: string): AuditEntryDraft | null {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return null;
  const path = routeWithoutPrefix(route);
  // Whole path segments only: "/me" is skipped, "/members" is not.
  if (SKIPPED_BASES.some((base) => path === base || path.startsWith(`${base}/`))) return null;

  const known = KNOWN[`${m} ${path}`];
  if (known) {
    return { action: known.action, entityType: known.entityType, entityFromResponse: known.fromResponse ?? false, safeBodyFields: known.body ?? [] };
  }
  const first = path.split('/').filter(Boolean)[0] ?? null;
  return { action: `${m} ${path}`, entityType: first, entityFromResponse: !path.includes(':'), safeBodyFields: [] };
}

/** Keeps only the allowed fields of a request body, and only plain numbers, booleans and short strings. */
export function pickSafeFields(body: unknown, allowed: string[]): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || allowed.length === 0) return null;
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    const v = (body as Record<string, unknown>)[key];
    if (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 32)) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}
