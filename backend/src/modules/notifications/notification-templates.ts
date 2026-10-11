// What each notification says. Pure functions: no database, no framework. Money arrives in paise and times as dates;
// words and the city's wall clock are produced here. Never put the pickup PIN in a message (it may travel by SMS).
import { formatRupees } from '../../common/money.js';
import type { SettlementStatus } from '../../generated/prisma/client.js';

export interface Message {
  title: string;
  body: string;
}

/** The parts of a booking that messages talk about. */
export interface BookingFacts {
  code: string;
  vehicleCode: string;
  stationName: string;
  stationAddress: string;
  cityName: string;
  /** IANA time zone of the city: times are written on its wall clock. */
  timezone: string;
  startAt: Date;
  endAt: Date;
  graceMinutes: number;
}

/** "12 Oct, 3:30 pm" on the city's clock. */
export function formatWhen(at: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(at);
  return `${day}, ${formatClock(at, timeZone)}`;
}

/** "3:30 pm" on the city's clock. */
export function formatClock(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`;
}

export function bookingConfirmed(f: BookingFacts, paid: { total: number; deposit: number }): Message {
  return {
    title: 'Booking confirmed',
    body:
      `You are booked on ${f.vehicleCode} at ${f.stationName} from ${formatWhen(f.startAt, f.timezone)}. ` +
      `We received ${formatRupees(paid.total)}, of which ${formatRupees(paid.deposit)} is a deposit you get back. ` +
      `Booking code ${f.code}.`,
  };
}

export function bookingCancelled(f: BookingFacts, refund: { amount: number; sent: boolean }): Message {
  const head = `Booking ${f.code} on ${f.vehicleCode} is cancelled.`;
  if (refund.amount <= 0) return { title: 'Booking cancelled', body: `${head} Nothing had been charged.` };
  return {
    title: 'Booking cancelled',
    body: refund.sent
      ? `${head} ${formatRupees(refund.amount)} has been refunded to your payment method.`
      : `${head} Your refund of ${formatRupees(refund.amount)} is being processed.`,
  };
}

export function bookingExpired(f: BookingFacts): Message {
  return {
    title: 'Your hold ran out',
    body: `${f.vehicleCode} at ${f.stationName} was held for you but the payment did not come through in time. Book again if you still want it.`,
  };
}

export function pickupReminder(f: BookingFacts): Message {
  return {
    title: 'Pick-up soon',
    body:
      `Your ride starts at ${formatClock(f.startAt, f.timezone)}. Collect ${f.vehicleCode} at ${f.stationName}, ${f.stationAddress}. ` +
      `Show booking code ${f.code} and your PIN to the station staff.`,
  };
}

export function rideStarted(f: BookingFacts): Message {
  return {
    title: 'Your ride has started',
    body: `Enjoy ${f.vehicleCode}. Bring it back by ${formatClock(f.endAt, f.timezone)} to any station in ${f.cityName}.`,
  };
}

export function returnReminder(f: BookingFacts): Message {
  return {
    title: 'Time to head back',
    body:
      `Your ride ends at ${formatClock(f.endAt, f.timezone)}. Return ${f.vehicleCode} to any station in ${f.cityName} by then; ` +
      `a late fee applies after ${f.graceMinutes} minutes.`,
  };
}

export function returnOverdue(f: BookingFacts): Message {
  return {
    title: 'Your ride is overdue',
    body: `${f.vehicleCode} was due back at ${formatClock(f.endAt, f.timezone)}. A late fee is now adding up. Return it to any station in ${f.cityName}.`,
  };
}

/** The final bill, as it stands when the scooter is taken back. */
export interface RideBill {
  status: SettlementStatus;
  depositHeld: number;
  totalCharges: number;
  refundAmount: number;
  outstandingAmount: number;
}

export function rideCompleted(f: BookingFacts, bill: RideBill): Message {
  const charges =
    bill.totalCharges > 0
      ? `Charges came to ${formatRupees(bill.totalCharges)}.`
      : 'There were no extra charges.';
  switch (bill.status) {
    case 'REFUNDED':
      return {
        title: 'Ride complete',
        body: `${charges} ${formatRupees(bill.refundAmount)} of your deposit has been refunded.`,
      };
    case 'REFUND_PENDING':
      return {
        title: 'Ride complete',
        body: `${charges} Your refund of ${formatRupees(bill.refundAmount)} is being processed. We will tell you when it goes through.`,
      };
    case 'OUTSTANDING':
      return {
        title: `You owe ${formatRupees(bill.outstandingAmount)}`,
        body: `${charges} That is ${formatRupees(bill.outstandingAmount)} more than your deposit. Pay it to book again.`,
      };
    default:
      return {
        title: 'Ride complete',
        body: `${charges} Nothing is left of the deposit to refund and nothing is owed.`,
      };
  }
}

export function refundSent(f: BookingFacts, amount: number): Message {
  return {
    title: 'Refund sent',
    body: `Your refund of ${formatRupees(amount)} for booking ${f.code} has gone through.`,
  };
}

export function paymentReceived(f: BookingFacts, amount: number): Message {
  return {
    title: 'Payment received',
    body: `We received ${formatRupees(amount)} for booking ${f.code}. You can book again.`,
  };
}

export function kycVerified(): Message {
  return { title: 'Identity verified', body: 'You are verified. You can book a scooter now.' };
}

export function kycRejected(reason: string | null, attemptsLeft: number): Message {
  const why = reason ? `: ${reason.replace(/\.$/, '')}` : '';
  const next =
    attemptsLeft > 0
      ? `You can try again (${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left).`
      : 'Please contact support.';
  return { title: 'Verification did not go through', body: `We could not verify your identity${why}. ${next}` };
}

export function noShow(f: BookingFacts, deposit: { amount: number; sent: boolean }): Message {
  const head = `You did not collect ${f.vehicleCode}, so booking ${f.code} was closed as a no-show.`;
  if (deposit.amount <= 0) return { title: 'Pick-up missed', body: `${head} The rental charge is kept.` };
  return {
    title: 'Pick-up missed',
    body: deposit.sent
      ? `${head} Your ${formatRupees(deposit.amount)} deposit has been refunded; the rental charge is kept.`
      : `${head} Your ${formatRupees(deposit.amount)} deposit is being refunded; the rental charge is kept.`,
  };
}
