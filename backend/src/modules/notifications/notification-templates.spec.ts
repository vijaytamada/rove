import {
  bookingCancelled,
  bookingConfirmed,
  bookingExpired,
  kycRejected,
  kycVerified,
  formatClock,
  formatWhen,
  noShow,
  paymentReceived,
  pickupReminder,
  refundSent,
  returnOverdue,
  returnReminder,
  rideCompleted,
  rideStarted,
  type BookingFacts,
  type RideBill,
} from './notification-templates.js';

const facts: BookingFacts = {
  code: 'ABC123',
  vehicleCode: 'BLR-001',
  stationName: 'Indiranagar',
  stationAddress: '100 Feet Road',
  cityName: 'Bengaluru',
  timezone: 'Asia/Kolkata',
  // 10:00 UTC = 3:30 pm in India.
  startAt: new Date('2026-10-12T10:00:00Z'),
  endAt: new Date('2026-10-12T12:00:00Z'),
  graceMinutes: 15,
};

describe('notification times', () => {
  it('are written on the city clock', () => {
    expect(formatClock(facts.startAt, 'Asia/Kolkata')).toBe('3:30 pm');
    expect(formatClock(facts.startAt, 'UTC')).toBe('10:00 am');
    expect(formatWhen(facts.startAt, 'Asia/Kolkata')).toBe('12 Oct, 3:30 pm');
  });

  it('roll over to the next day on the city clock', () => {
    expect(formatWhen(new Date('2026-10-12T20:00:00Z'), 'Asia/Kolkata')).toBe('13 Oct, 1:30 am');
  });
});

describe('notification messages', () => {
  it('confirmation says what was paid and that the deposit comes back, without the PIN', () => {
    const m = bookingConfirmed(facts, { total: 150_000, deposit: 100_000 });
    expect(m.title).toBe('Booking confirmed');
    expect(m.body).toContain('BLR-001');
    expect(m.body).toContain('Indiranagar');
    expect(m.body).toContain('12 Oct, 3:30 pm');
    expect(m.body).toContain('₹1,500');
    expect(m.body).toContain('₹1,000 is a deposit you get back');
    expect(m.body).toContain('ABC123');
    expect(m.body).not.toMatch(/pin/i);
  });

  it('cancellation covers refund sent, refund pending and nothing charged', () => {
    expect(bookingCancelled(facts, { amount: 150_000, sent: true }).body).toContain('₹1,500 has been refunded');
    expect(bookingCancelled(facts, { amount: 100_000, sent: false }).body).toContain('refund of ₹1,000 is being processed');
    expect(bookingCancelled(facts, { amount: 0, sent: true }).body).toContain('Nothing had been charged');
  });

  it('reminders carry the right clock time and the grace period', () => {
    expect(pickupReminder(facts).body).toContain('3:30 pm');
    expect(pickupReminder(facts).body).toContain('100 Feet Road');
    expect(rideStarted(facts).body).toContain('5:30 pm');
    expect(returnReminder(facts).body).toContain('5:30 pm');
    expect(returnReminder(facts).body).toContain('after 15 minutes');
    expect(returnOverdue(facts).body).toContain('late fee');
  });

  it('an expired hold says it ran out', () => {
    expect(bookingExpired(facts).title).toBe('Your hold ran out');
  });

  describe('the final bill', () => {
    const bill = (over: Partial<RideBill>): RideBill => ({
      status: 'REFUNDED',
      depositHeld: 100_000,
      totalCharges: 0,
      refundAmount: 100_000,
      outstandingAmount: 0,
      ...over,
    });

    it('a clean ride has no extra charges and a full refund', () => {
      const m = rideCompleted(facts, bill({}));
      expect(m.body).toContain('no extra charges');
      expect(m.body).toContain('₹1,000 of your deposit has been refunded');
    });

    it('charges come out of the deposit', () => {
      expect(rideCompleted(facts, bill({ totalCharges: 4_200, refundAmount: 95_800 })).body).toContain('Charges came to ₹42.');
    });

    it('a refund that has not gone through yet says it is being processed', () => {
      expect(rideCompleted(facts, bill({ status: 'REFUND_PENDING' })).body).toContain('is being processed');
    });

    it('an amount owed is in the title and says to pay before booking again', () => {
      const m = rideCompleted(facts, bill({ status: 'OUTSTANDING', totalCharges: 150_000, refundAmount: 0, outstandingAmount: 50_000 }));
      expect(m.title).toBe('You owe ₹500');
      expect(m.body).toContain('Pay it to book again');
    });

    it('charges that used the whole deposit leave nothing to move', () => {
      const m = rideCompleted(facts, bill({ status: 'NO_ACTION', totalCharges: 100_000, refundAmount: 0 }));
      expect(m.body).toContain('nothing is owed');
    });
  });

  it('identity check results say what happened and what to do next', () => {
    expect(kycVerified().body).toContain('book a scooter');
    expect(kycRejected('We could not match your details.', 2).body).toBe(
      'We could not verify your identity: We could not match your details. You can try again (2 tries left).',
    );
    expect(kycRejected(null, 1).body).toContain('(1 try left)');
    expect(kycRejected('Blurry photo', 0).body).toContain('Please contact support.');
    expect(kycRejected('Blurry photo', 0).body).not.toContain('try again');
  });

  it('refund, payment and no-show messages show the amounts', () => {
    expect(refundSent(facts, 95_800).body).toContain('₹958');
    expect(paymentReceived(facts, 50_000).body).toContain('₹500');
    expect(noShow(facts, { amount: 100_000, sent: true }).body).toContain('deposit has been refunded');
    expect(noShow(facts, { amount: 100_000, sent: false }).body).toContain('is being refunded');
    expect(noShow(facts, { amount: 0, sent: true }).body).not.toContain('deposit');
  });
});
