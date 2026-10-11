import { AppException } from '../../common/app-exception.js';
import { cancellationOutcome, isOpenAt, resolveWindow, type CancellableBooking } from './booking-rules.js';

const now = new Date('2026-10-10T08:00:00.000Z');
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

describe('resolveWindow', () => {
  it('starts now when no start is given and ends after the hours', () => {
    const w = resolveWindow(undefined, 3, now);
    expect(w.startAt).toEqual(now);
    expect(w.endAt).toEqual(at(180));
  });

  it('keeps a start in the future', () => {
    expect(resolveWindow(at(90), 2, now).startAt).toEqual(at(90));
  });

  it('treats a start a minute ago as now', () => {
    expect(resolveWindow(at(-1), 1, now).startAt).toEqual(now);
  });

  it('rejects a start in the past, too far ahead, and bad durations', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as AppException).code;
      }
    };
    expect(code(() => resolveWindow(at(-10), 1, now))).toBe('START_IN_PAST');
    expect(code(() => resolveWindow(at(8 * 24 * 60), 1, now))).toBe('START_TOO_FAR');
    expect(code(() => resolveWindow(undefined, 0, now))).toBe('INVALID_DURATION');
    expect(code(() => resolveWindow(undefined, 25, now))).toBe('INVALID_DURATION');
    expect(code(() => resolveWindow(undefined, 1.5, now))).toBe('INVALID_DURATION');
    expect(code(() => resolveWindow(new Date('nope'), 1, now))).toBe('INVALID_START');
  });

  it('accepts exactly 7 days ahead and 24 hours', () => {
    expect(resolveWindow(at(7 * 24 * 60), 24, now).endAt).toEqual(at(7 * 24 * 60 + 24 * 60));
  });
});

describe('isOpenAt', () => {
  // 08:00 UTC is 13:30 in India.
  const ist = 'Asia/Kolkata';

  it('is always open without hours', () => {
    expect(isOpenAt(now, null, null, ist)).toBe(true);
  });

  it('opens at the opening minute and closes at the closing minute', () => {
    expect(isOpenAt(now, '06:00', '22:00', ist)).toBe(true);
    expect(isOpenAt(now, '13:30', '22:00', ist)).toBe(true);
    expect(isOpenAt(now, '06:00', '13:30', ist)).toBe(false);
    expect(isOpenAt(now, '14:00', '22:00', ist)).toBe(false);
  });

  it('uses the city time zone, not UTC', () => {
    expect(isOpenAt(now, '06:00', '10:00', 'UTC')).toBe(true);
    expect(isOpenAt(now, '06:00', '10:00', ist)).toBe(false);
  });

  it('handles hours that run past midnight', () => {
    expect(isOpenAt(now, '22:00', '14:00', ist)).toBe(true);
    expect(isOpenAt(now, '22:00', '06:00', ist)).toBe(false);
  });
});

describe('cancellationOutcome', () => {
  const confirmed = (over: Partial<CancellableBooking> = {}): CancellableBooking => ({
    status: 'CONFIRMED',
    startAt: at(180),
    endAt: at(240),
    confirmedAt: at(-60),
    rentalAmount: 5000,
    depositAmount: 100000,
    totalAmount: 105000,
    ...over,
  });

  it('refunds nothing for a booking that was never paid', () => {
    expect(cancellationOutcome(confirmed({ status: 'PENDING_PAYMENT', confirmedAt: null }), now)).toEqual({
      allowed: true,
      refundAmount: 0,
      retainedAmount: 0,
    });
  });

  it('refunds everything at least two hours before the start', () => {
    expect(cancellationOutcome(confirmed({ startAt: at(120) }), now)).toEqual({
      allowed: true,
      refundAmount: 105000,
      retainedAmount: 0,
    });
  });

  it('keeps the rental when cancelling inside two hours', () => {
    expect(cancellationOutcome(confirmed({ startAt: at(119) }), now)).toEqual({
      allowed: true,
      refundAmount: 100000,
      retainedAmount: 5000,
    });
  });

  it('refunds everything within ten minutes of paying, even for a ride starting now', () => {
    const ride = confirmed({ startAt: now, endAt: at(60), confirmedAt: at(-10) });
    expect(cancellationOutcome(ride, now).refundAmount).toBe(105000);
    expect(cancellationOutcome({ ...ride, confirmedAt: at(-11) }, now).refundAmount).toBe(100000);
  });

  it('is not possible once the window has ended or the ride has started', () => {
    expect(cancellationOutcome(confirmed({ startAt: at(-120), endAt: at(0) }), now).allowed).toBe(false);
    expect(cancellationOutcome(confirmed({ status: 'IN_RIDE' }), now).allowed).toBe(false);
    expect(cancellationOutcome(confirmed({ status: 'CANCELLED' }), now).allowed).toBe(false);
    expect(cancellationOutcome(confirmed({ status: 'EXPIRED' }), now).allowed).toBe(false);
  });
});
