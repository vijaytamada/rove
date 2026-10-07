import { quoteRental, type PlanRates } from './rental-quote.js';

const plan: PlanRates = {
  hourlyRateAmount: 4900,
  dailyRateAmount: 29900,
  includedKmPerHour: 12,
  extraKmRateAmount: 600,
  graceMinutes: 15,
  lateFeePerHourAmount: 9900,
  depositAmount: 100000,
};

describe('quoteRental', () => {
  it('charges the hourly rate times the hours, plus a separate deposit', () => {
    expect(quoteRental(plan, 1)).toEqual({
      hours: 1,
      rentalAmount: 4900,
      depositAmount: 100000,
      totalAmount: 104900,
      includedKm: 12,
    });
    expect(quoteRental(plan, 3).rentalAmount).toBe(14700);
  });

  it('never charges more than the day rate', () => {
    expect(quoteRental(plan, 6).rentalAmount).toBe(29400);
    expect(quoteRental(plan, 7).rentalAmount).toBe(29900);
    expect(quoteRental(plan, 24).rentalAmount).toBe(29900);
  });

  it('works without a day rate', () => {
    expect(quoteRental({ ...plan, dailyRateAmount: null }, 24).rentalAmount).toBe(117600);
  });

  it('adds up total = rental + deposit and scales included km', () => {
    const q = quoteRental(plan, 5);
    expect(q.totalAmount).toBe(q.rentalAmount + q.depositAmount);
    expect(q.includedKm).toBe(60);
  });

  it('allows a free deposit', () => {
    expect(quoteRental({ ...plan, depositAmount: 0 }, 2).totalAmount).toBe(9800);
  });

  it('rejects durations that are not whole hours of at least one', () => {
    expect(() => quoteRental(plan, 0)).toThrow(RangeError);
    expect(() => quoteRental(plan, 1.5)).toThrow(RangeError);
    expect(() => quoteRental(plan, -2)).toThrow(RangeError);
  });
});
