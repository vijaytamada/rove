// Pure pricing code: no database, no framework. Money is integer paise.
import type { PlanRates } from './rental-quote.js';

const MINUTE = 60_000;

export type ChargeType = 'EXTRA_KM' | 'LATE_FEE' | 'DAMAGE';

/** What happened on the ride, as recorded by staff. */
export interface RideFacts {
  /** Booked whole hours (the included kilometres scale with it). */
  hours: number;
  bookedEndAt: Date;
  returnedAt: Date;
  /** End odometer minus start odometer. */
  distanceKm: number;
  /** Damage found at return, with the flat fee staff entered. Damage that was already there is never passed in. */
  damages: { description: string; feeAmount: number }[];
}

export interface ChargeLine {
  type: ChargeType;
  description: string;
  /** Started kilometres or started hours; 1 for damage. */
  quantity: number;
  unitAmount: number;
  amount: number;
}

export type SettlementOutcome = 'REFUND' | 'OUTSTANDING' | 'NO_ACTION';

export interface FinalCharges {
  lines: ChargeLine[];
  totalCharges: number;
  depositHeld: number;
  /** What goes back to the customer: the deposit minus the charges, never below zero. */
  refundAmount: number;
  /** What the customer still owes when the charges are more than the deposit. */
  outstandingAmount: number;
  outcome: SettlementOutcome;
}

/** Whole kilometres over the included allowance, counting a started kilometre as a whole one. */
export function extraKmStarted(distanceKm: number, includedKm: number): number {
  // Readings have one decimal place; rounding first keeps 12.0000001 from counting as a started kilometre.
  const over = Math.round((distanceKm - includedKm) * 10) / 10;
  return over > 0 ? Math.ceil(over) : 0;
}

/**
 * Hours charged as late: nothing up to and including the grace period, then every started hour counted from the
 * booked end (so 16 minutes late is one hour, 61 minutes late is two).
 */
export function lateHoursStarted(bookedEndAt: Date, returnedAt: Date, graceMinutes: number): number {
  const lateMs = returnedAt.getTime() - bookedEndAt.getTime();
  if (lateMs <= graceMinutes * MINUTE) return 0;
  return Math.ceil(lateMs / (60 * MINUTE));
}

/**
 * The final bill of a ride, settled against the deposit: extra kilometres, late fee and damage fees are taken from the
 * deposit; what is left goes back, and anything beyond the deposit is owed. The rental itself was prepaid and is never
 * refunded for an early return. The rates come from the plan values saved on the booking, never from the live plan.
 */
export function calculateFinalCharges(plan: PlanRates, ride: RideFacts): FinalCharges {
  if (!Number.isInteger(ride.hours) || ride.hours < 1) throw new RangeError('hours must be a whole number of at least 1');
  if (ride.distanceKm < 0) throw new RangeError('distanceKm cannot be negative');
  if (ride.damages.some((d) => !Number.isInteger(d.feeAmount) || d.feeAmount < 0)) {
    throw new RangeError('damage fees must be whole paise, zero or more');
  }

  const lines: ChargeLine[] = [];

  const includedKm = plan.includedKmPerHour * ride.hours;
  const extraKm = extraKmStarted(ride.distanceKm, includedKm);
  if (extraKm > 0 && plan.extraKmRateAmount > 0) {
    lines.push({
      type: 'EXTRA_KM',
      description: `${extraKm} extra km (${includedKm} km included)`,
      quantity: extraKm,
      unitAmount: plan.extraKmRateAmount,
      amount: extraKm * plan.extraKmRateAmount,
    });
  }

  const lateHours = lateHoursStarted(ride.bookedEndAt, ride.returnedAt, plan.graceMinutes);
  if (lateHours > 0 && plan.lateFeePerHourAmount > 0) {
    lines.push({
      type: 'LATE_FEE',
      description: `${lateHours} ${lateHours === 1 ? 'hour' : 'hours'} late`,
      quantity: lateHours,
      unitAmount: plan.lateFeePerHourAmount,
      amount: lateHours * plan.lateFeePerHourAmount,
    });
  }

  for (const d of ride.damages) {
    if (d.feeAmount > 0) {
      lines.push({ type: 'DAMAGE', description: d.description, quantity: 1, unitAmount: d.feeAmount, amount: d.feeAmount });
    }
  }

  const totalCharges = lines.reduce((sum, l) => sum + l.amount, 0);
  const depositHeld = plan.depositAmount;
  const refundAmount = Math.max(depositHeld - totalCharges, 0);
  const outstandingAmount = Math.max(totalCharges - depositHeld, 0);
  const outcome: SettlementOutcome = outstandingAmount > 0 ? 'OUTSTANDING' : refundAmount > 0 ? 'REFUND' : 'NO_ACTION';

  return { lines, totalCharges, depositHeld, refundAmount, outstandingAmount, outcome };
}
