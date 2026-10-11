// When reminders are due. Pure functions: no database, no framework.
import type { BookingStatus } from '../../generated/prisma/client.js';

const MINUTE = 60_000;

export const REMINDER_RULES = {
  /** The pickup reminder goes out this long before the booked start. */
  PICKUP_LEAD_MINUTES: 60,
  /** A booking made less than this long before its start gets no pickup reminder: the customer just booked it. */
  MIN_BOOKED_AHEAD_MINUTES: 60,
  /** The return reminder goes out this long before the ride is due back. */
  RETURN_LEAD_MINUTES: 30,
  /** Holds that ran out longer ago than this are not announced (a long-forgotten booking is not news). */
  HOLD_NOTICE_MAX_AGE_HOURS: 24,
} as const;

export function pickupReminderDue(
  b: { status: BookingStatus; startAt: Date; confirmedAt: Date | null },
  now: Date,
): boolean {
  if (b.status !== 'CONFIRMED' || !b.confirmedAt) return false;
  const untilStart = b.startAt.getTime() - now.getTime();
  if (untilStart <= 0 || untilStart > REMINDER_RULES.PICKUP_LEAD_MINUTES * MINUTE) return false;
  return b.startAt.getTime() - b.confirmedAt.getTime() >= REMINDER_RULES.MIN_BOOKED_AHEAD_MINUTES * MINUTE;
}

export function returnReminderDue(b: { status: BookingStatus; endAt: Date }, now: Date): boolean {
  if (b.status !== 'IN_RIDE') return false;
  const untilEnd = b.endAt.getTime() - now.getTime();
  return untilEnd > 0 && untilEnd <= REMINDER_RULES.RETURN_LEAD_MINUTES * MINUTE;
}

/** Overdue once the grace minutes after the booked end are used up: that is when the late fee starts. */
export function returnOverdueDue(b: { status: BookingStatus; endAt: Date; graceMinutes: number }, now: Date): boolean {
  if (b.status !== 'IN_RIDE') return false;
  return now.getTime() >= b.endAt.getTime() + b.graceMinutes * MINUTE;
}
