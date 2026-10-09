// Pure helpers for the dashboards. No database, no framework.

export const RANGE_HOURS = { '1d': 24, '7d': 24 * 7, '30d': 24 * 30 } as const;
export type RangeKey = keyof typeof RANGE_HOURS;
export const RANGE_KEYS = Object.keys(RANGE_HOURS) as RangeKey[];
export const DEFAULT_RANGE: RangeKey = '7d';

const HOUR = 3_600_000;

export interface DashboardWindow {
  key: RangeKey;
  from: Date;
  to: Date;
  hours: number;
}

/** A rolling window ending now ("the last 24 hours"), so it means the same in every city's time zone. */
export function resolveWindow(key: RangeKey, now: Date): DashboardWindow {
  const hours = RANGE_HOURS[key];
  return { key, from: new Date(now.getTime() - hours * HOUR), to: now, hours };
}

/**
 * How busy the fleet was: scooter-hours spent on rides divided by scooter-hours available in the window,
 * as a percentage with one decimal. An empty fleet (or window) is 0, and the result never goes above 100
 * (a scooter swapped mid-window can be counted at two stations).
 */
export function utilizationPercent(rideHours: number, fleetSize: number, windowHours: number): number {
  if (fleetSize <= 0 || windowHours <= 0 || rideHours <= 0) return 0;
  const pct = (rideHours / (fleetSize * windowHours)) * 100;
  return Math.min(100, Math.round(pct * 10) / 10);
}
