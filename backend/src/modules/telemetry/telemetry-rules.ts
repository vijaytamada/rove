// What makes a reading acceptable and when a position is out of date. Pure: no database, no framework.
import type { VehicleStatus } from '../../generated/prisma/client.js';

export const TELEMETRY_RULES = {
  /** Readings per request. */
  MAX_BATCH: 100,
  /** A tracker's clock may run this far ahead of ours. */
  MAX_FUTURE_SECONDS: 60,
  /** Older readings are refused (a tracker that was offline for days should not rewrite history). */
  MAX_AGE_HOURS: 24,
  /** A scooter on a ride should report every few seconds; this long without one and the position is "stale". */
  STALE_RIDE_SECONDS: 120,
  /** A parked scooter only sends a heartbeat now and then. */
  STALE_PARKED_SECONDS: 15 * 60,
  /** The newest reading is kept this long for the live map. */
  LATEST_TTL_SECONDS: 24 * 60 * 60,
  HISTORY_DEFAULT: 300,
  HISTORY_MAX: 1000,
} as const;

/** Null when the reading's time is acceptable, else why not. */
export function checkReadingTime(recordedAt: Date, now: Date): string | null {
  const t = recordedAt.getTime();
  if (Number.isNaN(t)) return 'The time is not valid.';
  if (t > now.getTime() + TELEMETRY_RULES.MAX_FUTURE_SECONDS * 1000) return 'The time is in the future.';
  if (t < now.getTime() - TELEMETRY_RULES.MAX_AGE_HOURS * 3_600_000) return 'The reading is too old.';
  return null;
}

export function isStale(status: VehicleStatus, recordedAt: Date, now: Date): boolean {
  const limit = status === 'IN_RIDE' ? TELEMETRY_RULES.STALE_RIDE_SECONDS : TELEMETRY_RULES.STALE_PARKED_SECONDS;
  return now.getTime() - recordedAt.getTime() > limit * 1000;
}
