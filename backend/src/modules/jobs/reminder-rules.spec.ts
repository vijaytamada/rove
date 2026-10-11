import type { BookingStatus } from '../../generated/prisma/client.js';
import { pickupReminderDue, returnOverdueDue, returnReminderDue } from './reminder-rules.js';

const MIN = 60_000;
const now = new Date('2026-10-12T10:00:00Z');
const at = (minutes: number) => new Date(now.getTime() + minutes * MIN);

describe('pickupReminderDue', () => {
  const booking = (startIn: number, confirmedAgo: number | null, status: BookingStatus = 'CONFIRMED') => ({
    status,
    startAt: at(startIn),
    confirmedAt: confirmedAgo === null ? null : at(-confirmedAgo),
  });

  it('is due in the hour before the start for a booking made well ahead', () => {
    expect(pickupReminderDue(booking(60, 600), now)).toBe(true);
    expect(pickupReminderDue(booking(1, 600), now)).toBe(true);
  });

  it('is not due earlier than an hour before, or at or after the start', () => {
    expect(pickupReminderDue(booking(61, 600), now)).toBe(false);
    expect(pickupReminderDue(booking(0, 600), now)).toBe(false);
    expect(pickupReminderDue(booking(-5, 600), now)).toBe(false);
  });

  it('is skipped for a booking made less than an hour before its start', () => {
    expect(pickupReminderDue(booking(30, 20), now)).toBe(false); // booked 50 minutes ahead of the start
    expect(pickupReminderDue(booking(30, 30), now)).toBe(true); // booked exactly 60 minutes ahead
    expect(pickupReminderDue(booking(10, 0), now)).toBe(false);
  });

  it('only applies to confirmed bookings', () => {
    expect(pickupReminderDue(booking(30, 600, 'CANCELLED'), now)).toBe(false);
    expect(pickupReminderDue(booking(30, null), now)).toBe(false);
  });
});

describe('returnReminderDue', () => {
  it('is due in the half hour before the ride is due back', () => {
    expect(returnReminderDue({ status: 'IN_RIDE', endAt: at(30) }, now)).toBe(true);
    expect(returnReminderDue({ status: 'IN_RIDE', endAt: at(1) }, now)).toBe(true);
    expect(returnReminderDue({ status: 'IN_RIDE', endAt: at(31) }, now)).toBe(false);
    expect(returnReminderDue({ status: 'IN_RIDE', endAt: at(0) }, now)).toBe(false);
  });

  it('only applies to rides that are out', () => {
    expect(returnReminderDue({ status: 'RETURNED', endAt: at(10) }, now)).toBe(false);
  });
});

describe('returnOverdueDue', () => {
  it('starts when the grace minutes after the booked end are used up', () => {
    expect(returnOverdueDue({ status: 'IN_RIDE', endAt: at(-15), graceMinutes: 15 }, now)).toBe(true);
    expect(returnOverdueDue({ status: 'IN_RIDE', endAt: at(-14), graceMinutes: 15 }, now)).toBe(false);
    expect(returnOverdueDue({ status: 'IN_RIDE', endAt: at(5), graceMinutes: 15 }, now)).toBe(false);
  });

  it('only applies to rides that are out', () => {
    expect(returnOverdueDue({ status: 'SETTLED', endAt: at(-60), graceMinutes: 15 }, now)).toBe(false);
  });
});
