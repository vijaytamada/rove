import { describe, expect, it } from 'vitest';
import { calculateFinalCharges, extraKmStarted, lateHoursStarted, type RideFacts } from './settlement-charges.js';
import type { PlanRates } from './rental-quote.js';

// Rs 69/hour, 12 km per hour, Rs 7 per extra km, 15 minutes grace, Rs 129 per late hour, Rs 1500 deposit.
const plan: PlanRates = {
  hourlyRateAmount: 6900,
  dailyRateAmount: null,
  includedKmPerHour: 12,
  extraKmRateAmount: 700,
  graceMinutes: 15,
  lateFeePerHourAmount: 12900,
  depositAmount: 150000,
};

const END = new Date('2026-10-08T12:00:00.000Z');
const at = (minutesAfterEnd: number) => new Date(END.getTime() + minutesAfterEnd * 60_000);
const ride = (over: Partial<RideFacts> = {}): RideFacts => ({
  hours: 2,
  bookedEndAt: END,
  returnedAt: at(0),
  distanceKm: 10,
  damages: [],
  ...over,
});

describe('extraKmStarted', () => {
  it.each([
    [0, 24, 0],
    [24, 24, 0], // exactly the allowance
    [24.1, 24, 1], // a started kilometre counts as a whole one
    [25, 24, 1],
    [25.1, 24, 2],
    [30.4, 24, 7],
    [23.9, 24, 0],
  ])('%s km ridden with %s included -> %s extra', (ridden, included, extra) => {
    expect(extraKmStarted(ridden, included)).toBe(extra);
  });

  it('is not fooled by floating point noise', () => {
    expect(extraKmStarted(0.1 + 0.2 + 23.7, 24)).toBe(0);
  });
});

describe('lateHoursStarted', () => {
  it.each([
    [-30, 0], // early
    [0, 0], // on time
    [14, 0],
    [15, 0], // exactly on the grace boundary is still free
    [15.01, 1], // a moment past it costs a started hour, counted from the booked end
    [16, 1],
    [60, 1],
    [61, 2],
    [125, 3],
  ])('%s minutes after the end -> %s hours', (minutes, hours) => {
    expect(lateHoursStarted(END, at(minutes), 15)).toBe(hours);
  });

  it('with no grace, any lateness counts', () => {
    expect(lateHoursStarted(END, at(1), 0)).toBe(1);
    expect(lateHoursStarted(END, at(0), 0)).toBe(0);
  });
});

describe('calculateFinalCharges', () => {
  it('a clean, on-time ride returns the whole deposit', () => {
    expect(calculateFinalCharges(plan, ride())).toEqual({
      lines: [],
      totalCharges: 0,
      depositHeld: 150000,
      refundAmount: 150000,
      outstandingAmount: 0,
      outcome: 'REFUND',
    });
  });

  it('zero kilometres ridden is fine', () => {
    expect(calculateFinalCharges(plan, ride({ distanceKm: 0 })).totalCharges).toBe(0);
  });

  it('charges started extra kilometres at the saved rate', () => {
    const r = calculateFinalCharges(plan, ride({ distanceKm: 30.4 }));
    expect(r.lines).toEqual([
      { type: 'EXTRA_KM', description: '7 extra km (24 km included)', quantity: 7, unitAmount: 700, amount: 4900 },
    ]);
    expect(r).toMatchObject({ totalCharges: 4900, refundAmount: 145100, outstandingAmount: 0, outcome: 'REFUND' });
  });

  it('the allowance grows with the booked hours', () => {
    expect(calculateFinalCharges(plan, ride({ hours: 4, distanceKm: 48 })).totalCharges).toBe(0);
    expect(calculateFinalCharges(plan, ride({ hours: 4, distanceKm: 49 })).totalCharges).toBe(700);
  });

  it('charges a late fee per started hour after the grace period', () => {
    expect(calculateFinalCharges(plan, ride({ returnedAt: at(15) })).totalCharges).toBe(0);
    const r = calculateFinalCharges(plan, ride({ returnedAt: at(70) }));
    expect(r.lines).toEqual([{ type: 'LATE_FEE', description: '2 hours late', quantity: 2, unitAmount: 12900, amount: 25800 }]);
    expect(r.refundAmount).toBe(150000 - 25800);
  });

  it('one late hour reads as singular', () => {
    expect(calculateFinalCharges(plan, ride({ returnedAt: at(20) })).lines[0]!.description).toBe('1 hour late');
  });

  it('adds up extra km, late fee and damage, and refunds the rest', () => {
    const r = calculateFinalCharges(
      plan,
      ride({ distanceKm: 26, returnedAt: at(30), damages: [{ description: 'Cracked mirror', feeAmount: 50000 }] }),
    );
    expect(r.lines.map((l) => [l.type, l.amount])).toEqual([
      ['EXTRA_KM', 1400],
      ['LATE_FEE', 12900],
      ['DAMAGE', 50000],
    ]);
    expect(r).toMatchObject({ totalCharges: 64300, refundAmount: 85700, outstandingAmount: 0, outcome: 'REFUND' });
  });

  it('damage with no fee is recorded elsewhere but never billed', () => {
    const r = calculateFinalCharges(plan, ride({ damages: [{ description: 'Scratch', feeAmount: 0 }] }));
    expect(r.lines).toEqual([]);
    expect(r.refundAmount).toBe(150000);
  });

  it('charges exactly equal to the deposit leave nothing to refund or collect', () => {
    const r = calculateFinalCharges(plan, ride({ damages: [{ description: 'Broken light', feeAmount: 150000 }] }));
    expect(r).toMatchObject({ totalCharges: 150000, refundAmount: 0, outstandingAmount: 0, outcome: 'NO_ACTION' });
  });

  it('charges one paisa over the deposit leave one paisa outstanding', () => {
    const r = calculateFinalCharges(plan, ride({ damages: [{ description: 'Frame bent', feeAmount: 150001 }] }));
    expect(r).toMatchObject({ refundAmount: 0, outstandingAmount: 1, outcome: 'OUTSTANDING' });
  });

  it('charges bigger than the deposit are owed by the customer', () => {
    const r = calculateFinalCharges(
      plan,
      ride({ distanceKm: 100, returnedAt: at(300), damages: [{ description: 'Stolen battery', feeAmount: 90000 }] }),
    );
    // 76 extra km = 53200, 5 late hours = 64500, damage 90000.
    expect(r.totalCharges).toBe(53200 + 64500 + 90000);
    expect(r).toMatchObject({ depositHeld: 150000, refundAmount: 0, outstandingAmount: 57700, outcome: 'OUTSTANDING' });
  });

  it('a plan without a deposit can only ever owe money', () => {
    const free = { ...plan, depositAmount: 0 };
    expect(calculateFinalCharges(free, ride())).toMatchObject({ outcome: 'NO_ACTION', refundAmount: 0, outstandingAmount: 0 });
    expect(calculateFinalCharges(free, ride({ distanceKm: 25 }))).toMatchObject({ outcome: 'OUTSTANDING', outstandingAmount: 700 });
  });

  it('a plan with no extra-km or late fee never bills them', () => {
    const lenient = { ...plan, extraKmRateAmount: 0, lateFeePerHourAmount: 0 };
    expect(calculateFinalCharges(lenient, ride({ distanceKm: 99, returnedAt: at(500) })).totalCharges).toBe(0);
  });

  it('rejects impossible inputs', () => {
    expect(() => calculateFinalCharges(plan, ride({ hours: 0 }))).toThrow(RangeError);
    expect(() => calculateFinalCharges(plan, ride({ distanceKm: -1 }))).toThrow(RangeError);
    expect(() => calculateFinalCharges(plan, ride({ damages: [{ description: 'x', feeAmount: -5 }] }))).toThrow(RangeError);
    expect(() => calculateFinalCharges(plan, ride({ damages: [{ description: 'x', feeAmount: 1.5 }] }))).toThrow(RangeError);
  });

  it('is deterministic and leaves its input alone', () => {
    const input = ride({ distanceKm: 30, damages: [{ description: 'Mirror', feeAmount: 100 }] });
    const copy = structuredClone(input);
    expect(calculateFinalCharges(plan, input)).toEqual(calculateFinalCharges(plan, input));
    expect(input).toEqual(copy);
  });
});
