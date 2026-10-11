// Booking rules that need no database: time windows, opening hours and the cancellation refund.
import { AppException } from '../../common/app-exception.js';
import type { BookingStatus } from '../../generated/prisma/client.js';

export const BOOKING_RULES = {
  /** How long a vehicle is held while the customer pays. */
  HOLD_MINUTES: 10,
  MIN_HOURS: 1,
  MAX_HOURS: 24,
  MAX_ADVANCE_DAYS: 7,
  /** A start time this far in the past still counts as "now" (the customer took a moment to tap). */
  START_TOLERANCE_MINUTES: 2,
  /** Cancelling at least this long before the start refunds everything. */
  FREE_CANCEL_HOURS: 2,
  /** ...and so does cancelling within this long of paying. */
  CANCEL_GRACE_MINUTES: 10,
  /** Pending, upcoming and active bookings one customer can have at once. */
  MAX_LIVE_BOOKINGS: 5,
} as const;

/** Statuses that occupy a vehicle. A PENDING_PAYMENT booking stops occupying it when its hold runs out. */
export const LIVE_STATUSES: BookingStatus[] = ['PENDING_PAYMENT', 'CONFIRMED', 'IN_RIDE'];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Start is "now" unless the customer picked a time. Returns the booked window. */
export function resolveWindow(startAt: Date | undefined, hours: number, now: Date): { startAt: Date; endAt: Date } {
  if (!Number.isInteger(hours) || hours < BOOKING_RULES.MIN_HOURS || hours > BOOKING_RULES.MAX_HOURS) {
    throw new AppException(
      400,
      'INVALID_DURATION',
      `Rent for ${BOOKING_RULES.MIN_HOURS} to ${BOOKING_RULES.MAX_HOURS} whole hours.`,
    );
  }
  let start = startAt ?? now;
  if (Number.isNaN(start.getTime())) throw new AppException(400, 'INVALID_START', 'Choose a valid start time.');
  if (start.getTime() < now.getTime() - BOOKING_RULES.START_TOLERANCE_MINUTES * MINUTE) {
    throw new AppException(400, 'START_IN_PAST', 'The start time has already passed. Choose a later time.');
  }
  if (start.getTime() > now.getTime() + BOOKING_RULES.MAX_ADVANCE_DAYS * 24 * HOUR) {
    throw new AppException(
      400,
      'START_TOO_FAR',
      `You can book up to ${BOOKING_RULES.MAX_ADVANCE_DAYS} days ahead.`,
    );
  }
  if (start.getTime() < now.getTime()) start = now;
  return { startAt: start, endAt: new Date(start.getTime() + hours * HOUR) };
}

/** Minutes since midnight of `instant` on the wall clock of `timeZone`. */
export function localMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Whether a station is open at `instant`. No hours set = always open. Hours may run past midnight. */
export function isOpenAt(instant: Date, opensAt: string | null, closesAt: string | null, timeZone: string): boolean {
  if (!opensAt || !closesAt) return true;
  const now = localMinutes(instant, timeZone);
  const open = toMinutes(opensAt);
  const close = toMinutes(closesAt);
  if (open === close) return true;
  return open < close ? now >= open && now < close : now >= open || now < close;
}

export interface CancellableBooking {
  status: BookingStatus;
  startAt: Date;
  endAt: Date;
  confirmedAt: Date | null;
  rentalAmount: number;
  depositAmount: number;
  totalAmount: number;
}

export interface CancellationOutcome {
  allowed: boolean;
  /** Paid money returned to the customer. */
  refundAmount: number;
  /** Paid money the company keeps (the rental, when cancelling late). */
  retainedAmount: number;
}

/**
 * What cancelling a booking right now would do.
 * - Waiting for payment: nothing was paid, so nothing moves.
 * - Confirmed: everything comes back when cancelling 2+ hours before the start or within 10 minutes of paying;
 *   otherwise only the deposit comes back and the rental is kept. Not possible once the window has ended.
 */
export function cancellationOutcome(b: CancellableBooking, now: Date): CancellationOutcome {
  if (b.status === 'PENDING_PAYMENT') return { allowed: true, refundAmount: 0, retainedAmount: 0 };
  if (b.status !== 'CONFIRMED' || now.getTime() >= b.endAt.getTime()) {
    return { allowed: false, refundAmount: 0, retainedAmount: 0 };
  }
  const early = b.startAt.getTime() - now.getTime() >= BOOKING_RULES.FREE_CANCEL_HOURS * HOUR;
  const justPaid =
    b.confirmedAt !== null && now.getTime() - b.confirmedAt.getTime() <= BOOKING_RULES.CANCEL_GRACE_MINUTES * MINUTE;
  if (early || justPaid) return { allowed: true, refundAmount: b.totalAmount, retainedAmount: 0 };
  return { allowed: true, refundAmount: b.depositAmount, retainedAmount: b.rentalAmount };
}
