import {
  canMarkNoShow,
  canPickUp,
  canReturn,
  distanceKm,
  noShowFrom,
  pickupOpensAt,
  vehicleStatusAfterReturn,
  type Window,
} from './rental-rules.js';

const now = new Date('2026-10-10T08:00:00.000Z');
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
const booking = (over: Partial<Window> = {}): Window => ({ status: 'CONFIRMED', startAt: at(0), endAt: at(120), ...over });

describe('canPickUp', () => {
  it('opens fifteen minutes before the start and closes at the end of the booking', () => {
    expect(pickupOpensAt(booking({ startAt: at(60) }))).toEqual(at(45));
    expect(canPickUp(booking({ startAt: at(15) }), now).allowed).toBe(true);
    expect(canPickUp(booking({ startAt: at(16), endAt: at(100) }), now)).toMatchObject({ allowed: false });
    expect(canPickUp(booking({ startAt: at(-90), endAt: at(1) }), now).allowed).toBe(true);
    expect(canPickUp(booking({ startAt: at(-120), endAt: at(0) }), now)).toMatchObject({ allowed: false });
  });

  it('needs a paid booking that has not started', () => {
    for (const status of ['PENDING_PAYMENT', 'IN_RIDE', 'RETURNED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'] as const) {
      const r = canPickUp(booking({ status }), now);
      expect(r.allowed).toBe(false);
      expect(r.reason).toBeTruthy();
    }
  });
});

describe('canMarkNoShow', () => {
  it('waits an hour after the start, or until the end if the booking is shorter', () => {
    expect(noShowFrom(booking({ startAt: at(0), endAt: at(180) }))).toEqual(at(60));
    expect(noShowFrom(booking({ startAt: at(0), endAt: at(30) }))).toEqual(at(30));
    expect(canMarkNoShow(booking({ startAt: at(-59), endAt: at(120) }), now).allowed).toBe(false);
    expect(canMarkNoShow(booking({ startAt: at(-60), endAt: at(120) }), now).allowed).toBe(true);
    expect(canMarkNoShow(booking({ startAt: at(-30), endAt: at(0) }), now).allowed).toBe(true);
  });

  it('only applies to a paid booking nobody collected', () => {
    expect(canMarkNoShow(booking({ status: 'IN_RIDE', startAt: at(-200) }), now).allowed).toBe(false);
    expect(canMarkNoShow(booking({ status: 'NO_SHOW', startAt: at(-200) }), now).allowed).toBe(false);
  });
});

describe('canReturn', () => {
  it('is only for a scooter that is out', () => {
    expect(canReturn({ status: 'IN_RIDE' }).allowed).toBe(true);
    expect(canReturn({ status: 'CONFIRMED' }).allowed).toBe(false);
    expect(canReturn({ status: 'RETURNED' }).reason).toContain('already been returned');
  });
});

describe('vehicleStatusAfterReturn', () => {
  it('goes back into service unless damaged badly or flagged', () => {
    expect(vehicleStatusAfterReturn([], false)).toBe('AVAILABLE');
    expect(vehicleStatusAfterReturn([{ severity: 'MINOR' }], false)).toBe('AVAILABLE');
    expect(vehicleStatusAfterReturn([{ severity: 'MINOR' }, { severity: 'MODERATE' }], false)).toBe('MAINTENANCE');
    expect(vehicleStatusAfterReturn([{ severity: 'MAJOR' }], false)).toBe('MAINTENANCE');
    expect(vehicleStatusAfterReturn([], true)).toBe('MAINTENANCE');
  });
});

describe('distanceKm', () => {
  it('rounds to one decimal', () => {
    expect(distanceKm(100, 112.34)).toBe(12.3);
    expect(distanceKm(100, 100)).toBe(0);
  });
});
