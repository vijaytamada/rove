import { emptyRaw, toMetrics, type RawNumbers } from './dashboard.service.js';
import { resolveWindow } from './dashboard-rules.js';

const window = resolveWindow('1d', new Date('2026-10-12T10:00:00Z'));
const station = (over: Partial<RawNumbers>): RawNumbers => ({ ...emptyRaw(), ...over });

describe('toMetrics', () => {
  it('an empty slice is all zeros', () => {
    const m = toMetrics([], window);
    expect(m.fleet).toEqual({ total: 0, available: 0, inRide: 0, maintenance: 0, offline: 0 });
    expect(m.utilizationPercent).toBe(0);
    expect(m.money).toEqual({ collected: 0, refunded: 0, net: 0 });
    expect(m.now.owed).toEqual({ count: 0, amount: 0 });
  });

  it('adds the stations of a slice together', () => {
    const a = station({ atStation: { AVAILABLE: 4, MAINTENANCE: 1 }, inRide: 2, waiting: 3, collected: 10_000, refunded: 2_500, held: 50_000, owedCount: 1, owedAmount: 700, ridesStarted: 5 });
    const b = station({ atStation: { AVAILABLE: 2, OFFLINE: 1 }, inRide: 1, overdue: 1, collected: 4_000, pendingCount: 2, pendingAmount: 900, ridesStarted: 2, cancellations: 3 });
    const m = toMetrics([a, b], window);
    // Scooters out on a ride count in the fleet, on top of the ones parked at stations.
    expect(m.fleet).toEqual({ total: 11, available: 6, inRide: 3, maintenance: 1, offline: 1 });
    expect(m.money).toEqual({ collected: 14_000, refunded: 2_500, net: 11_500 });
    expect(m.now).toMatchObject({ waitingPickups: 3, ridesOut: 3, overdueRides: 1, depositsHeld: 50_000, owed: { count: 1, amount: 700 }, refundsPending: { count: 2, amount: 900 } });
    expect(m.activity).toMatchObject({ ridesStarted: 7, cancellations: 3 });
  });

  it('a city is the sum of its stations: summing stations first or last gives the same answer', () => {
    const stations = [station({ atStation: { AVAILABLE: 3 }, inRide: 1, rideHours: 6, collected: 100 }), station({ atStation: { AVAILABLE: 5 }, rideHours: 12, collected: 250 }), emptyRaw()];
    const all = toMetrics(stations, window);
    const merged = toMetrics([stations.reduce((acc, s) => ({ ...acc, inRide: acc.inRide + s.inRide, rideHours: acc.rideHours + s.rideHours, collected: acc.collected + s.collected, atStation: { AVAILABLE: (acc.atStation.AVAILABLE ?? 0) + (s.atStation.AVAILABLE ?? 0) } }), emptyRaw())], window);
    expect(merged).toEqual(all);
  });

  it('utilization is ride hours over scooter-hours of the whole slice', () => {
    // 4 scooters over 24 hours = 96 scooter-hours; 24 ride hours = 25%.
    const m = toMetrics([station({ atStation: { AVAILABLE: 3 }, inRide: 1, rideHours: 24 })], window);
    expect(m.utilizationPercent).toBe(25);
    // Never above 100.
    expect(toMetrics([station({ atStation: { AVAILABLE: 1 }, rideHours: 500 })], window).utilizationPercent).toBe(100);
  });

  it('carries the window through', () => {
    expect(toMetrics([], window).window).toEqual({ key: '1d', from: window.from, to: window.to, hours: 24 });
  });
});
