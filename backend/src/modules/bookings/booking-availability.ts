import type { Prisma } from '../../generated/prisma/client.js';

/** Bookings that occupy a vehicle right now: confirmed or active ones, and payment holds that have not run out. */
export function liveBookingWhere(now: Date): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: ['CONFIRMED', 'IN_RIDE'] } },
      { status: 'PENDING_PAYMENT', holdExpiresAt: { gt: now } },
    ],
  };
}

/**
 * Live bookings that overlap [from, to). Back-to-back bookings do not overlap.
 * Use as `{ bookings: { none: liveBookingOverlap(...) } }` on a vehicle for "free during that time".
 */
export function liveBookingOverlap(from: Date, to: Date, now: Date): Prisma.BookingWhereInput {
  return { startAt: { lt: to }, endAt: { gt: from }, ...liveBookingWhere(now) };
}
