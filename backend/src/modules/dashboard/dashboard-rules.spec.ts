import { describe, expect, it } from 'vitest';
import { resolveWindow, utilizationPercent } from './dashboard-rules.js';

const NOW = new Date('2026-10-09T12:00:00.000Z');

describe('resolveWindow', () => {
  it.each([
    ['1d', 24],
    ['7d', 168],
    ['30d', 720],
  ] as const)('%s is the last %s hours ending now', (key, hours) => {
    const w = resolveWindow(key, NOW);
    expect(w).toMatchObject({ key, hours, to: NOW });
    expect(w.to.getTime() - w.from.getTime()).toBe(hours * 3_600_000);
  });
});

describe('utilizationPercent', () => {
  it.each([
    [0, 10, 24, 0],
    [24, 10, 24, 10], // 24 ride-hours of 240 scooter-hours
    [120, 10, 24, 50],
    [240, 10, 24, 100],
    [1, 3, 24, 1.4], // 1.388... rounds to one decimal
    [500, 10, 24, 100], // never above 100
  ])('%s ride hours, %s scooters, %s hour window -> %s%%', (ride, fleet, window, pct) => {
    expect(utilizationPercent(ride, fleet, window)).toBe(pct);
  });

  it('an empty fleet or window is 0, not NaN', () => {
    expect(utilizationPercent(5, 0, 24)).toBe(0);
    expect(utilizationPercent(5, 10, 0)).toBe(0);
    expect(utilizationPercent(-1, 10, 24)).toBe(0);
  });
});
