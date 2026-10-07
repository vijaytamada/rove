// Pure pricing code: no database, no framework. Money is integer paise.

/** The plan values a booking depends on. Copied onto the booking so later plan edits never change it. */
export interface PlanRates {
  hourlyRateAmount: number;
  dailyRateAmount: number | null;
  includedKmPerHour: number;
  extraKmRateAmount: number;
  graceMinutes: number;
  lateFeePerHourAmount: number;
  depositAmount: number;
}

export interface RentalQuote {
  hours: number;
  rentalAmount: number;
  depositAmount: number;
  totalAmount: number;
  includedKm: number;
}

/**
 * Upfront price for renting `hours` whole hours: the hourly rate times hours, never more than the day rate when
 * the plan has one. The deposit is separate and refundable. Excess-km, late and damage charges are settled at
 * return (Phase 6), not quoted here.
 */
export function quoteRental(plan: PlanRates, hours: number): RentalQuote {
  if (!Number.isInteger(hours) || hours < 1) throw new RangeError('hours must be a whole number of at least 1');
  const byHour = plan.hourlyRateAmount * hours;
  const rentalAmount = plan.dailyRateAmount === null ? byHour : Math.min(byHour, plan.dailyRateAmount);
  return {
    hours,
    rentalAmount,
    depositAmount: plan.depositAmount,
    totalAmount: rentalAmount + plan.depositAmount,
    includedKm: plan.includedKmPerHour * hours,
  };
}
