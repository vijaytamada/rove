import { TELEMETRY_RULES, checkReadingTime, isStale } from './telemetry-rules.js';

const now = new Date('2026-10-12T10:00:00Z');
const secondsFromNow = (s: number) => new Date(now.getTime() + s * 1000);

describe('checkReadingTime', () => {
  it('accepts now, a little in the past, and a clock that runs slightly fast', () => {
    expect(checkReadingTime(now, now)).toBeNull();
    expect(checkReadingTime(secondsFromNow(-3600), now)).toBeNull();
    expect(checkReadingTime(secondsFromNow(TELEMETRY_RULES.MAX_FUTURE_SECONDS), now)).toBeNull();
  });

  it('refuses the future beyond the allowance, and anything older than a day', () => {
    expect(checkReadingTime(secondsFromNow(TELEMETRY_RULES.MAX_FUTURE_SECONDS + 1), now)).toBe('The time is in the future.');
    expect(checkReadingTime(secondsFromNow(-TELEMETRY_RULES.MAX_AGE_HOURS * 3600), now)).toBeNull();
    expect(checkReadingTime(secondsFromNow(-TELEMETRY_RULES.MAX_AGE_HOURS * 3600 - 1), now)).toBe('The reading is too old.');
  });

  it('refuses a time that is not a date', () => {
    expect(checkReadingTime(new Date('nonsense'), now)).toBe('The time is not valid.');
  });
});

describe('isStale', () => {
  it('a scooter on a ride goes stale after two minutes', () => {
    expect(isStale('IN_RIDE', secondsFromNow(-120), now)).toBe(false);
    expect(isStale('IN_RIDE', secondsFromNow(-121), now)).toBe(true);
  });

  it('a parked scooter is allowed a much longer silence', () => {
    expect(isStale('AVAILABLE', secondsFromNow(-300), now)).toBe(false);
    expect(isStale('AVAILABLE', secondsFromNow(-15 * 60), now)).toBe(false);
    expect(isStale('MAINTENANCE', secondsFromNow(-15 * 60 - 1), now)).toBe(true);
  });
});
