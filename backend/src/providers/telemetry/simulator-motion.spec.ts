import { SIM, distanceKmBetween, moveBy, stepVehicle, type SimState } from './simulator-motion.js';
import type { FleetVehicle } from './telemetry.provider.js';

const home = { latitude: 12.97, longitude: 77.64 };
const vehicle = (over: Partial<FleetVehicle> = {}): FleetVehicle => ({
  id: 'v1',
  code: 'BLR-001',
  status: 'AVAILABLE',
  batteryPercent: 80,
  odometerKm: 100,
  home,
  ...over,
});
const t0 = new Date('2026-10-12T10:00:00Z');
const after = (seconds: number) => new Date(t0.getTime() + seconds * 1000);
/** A "random" source that always answers the same. 0.5 = no change of speed, no turn. */
const steady = () => 0.5;

describe('geometry', () => {
  it('measures distance and moves by it', () => {
    expect(distanceKmBetween(home, home)).toBe(0);
    // One degree of latitude is about 111 km.
    expect(distanceKmBetween({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(111.19, 1);
    const moved = moveBy(home, 90, 2);
    expect(distanceKmBetween(home, moved)).toBeCloseTo(2, 3);
    expect(moved.latitude).toBeCloseTo(home.latitude, 3); // east is along the latitude
    expect(moved.longitude).toBeGreaterThan(home.longitude);
    expect(moveBy(home, 0, 1).latitude).toBeGreaterThan(home.latitude); // north
  });

  it('wraps longitude across the date line', () => {
    expect(moveBy({ latitude: 0, longitude: 179.99 }, 90, 5).longitude).toBeLessThan(0);
  });
});

describe('stepVehicle', () => {
  it('a parked scooter sits at its station with the ignition off, whatever its history', () => {
    const { reading, state } = stepVehicle(undefined, vehicle(), t0, Math.random);
    expect(reading).toMatchObject({ vehicleId: 'v1', latitude: home.latitude, longitude: home.longitude, speedKmh: 0, ignition: false, batteryPercent: 80, odometerKm: 100 });
    expect(state.moving).toBe(false);
    expect(stepVehicle(state, vehicle({ status: 'MAINTENANCE' }), after(300), Math.random).reading.speedKmh).toBe(0);
  });

  it('a scooter that sets off starts at its station with the ignition on', () => {
    const { reading } = stepVehicle(undefined, vehicle({ status: 'IN_RIDE' }), t0, steady);
    expect(reading).toMatchObject({ latitude: home.latitude, longitude: home.longitude, ignition: true, speedKmh: SIM.MIN_SPEED_KMH });
  });

  it('a riding scooter moves as far as its speed and the time allow, and the odometer and battery follow', () => {
    const riding = vehicle({ status: 'IN_RIDE' });
    let { state } = stepVehicle(undefined, riding, t0, steady);
    const start = { latitude: state.latitude, longitude: state.longitude };
    let last = start;
    for (let i = 1; i <= 30; i++) {
      const next = stepVehicle(state, riding, after(i * 10), steady);
      const step = distanceKmBetween(last, next.reading);
      // 10 seconds at up to 32 km/h is at most about 89 metres.
      expect(step).toBeLessThanOrEqual((SIM.MAX_SPEED_KMH * 10) / 3600 + 1e-6);
      expect(next.reading.speedKmh).toBeGreaterThanOrEqual(SIM.MIN_SPEED_KMH);
      expect(next.reading.speedKmh).toBeLessThanOrEqual(SIM.MAX_SPEED_KMH);
      last = next.reading;
      state = next.state;
    }
    const travelled = distanceKmBetween(start, last);
    expect(travelled).toBeGreaterThan(0.5); // 5 minutes at 10 km/h with no turning is about 0.83 km
    expect(state.odometerKm - 100).toBeCloseTo(travelled, 1);
    expect(state.battery).toBeCloseTo(80 - (state.odometerKm - 100) * SIM.BATTERY_PER_KM, 5);
    expect(state.battery).toBeLessThan(80);
  });

  it('speed and turns stay inside their limits whatever the random numbers are', () => {
    const riding = vehicle({ status: 'IN_RIDE' });
    for (const extreme of [0, 1]) {
      let { state } = stepVehicle(undefined, riding, t0, () => extreme);
      for (let i = 1; i <= 50; i++) {
        const next = stepVehicle(state, riding, after(i * 10), () => extreme);
        expect(next.state.speedKmh).toBeGreaterThanOrEqual(SIM.MIN_SPEED_KMH);
        expect(next.state.speedKmh).toBeLessThanOrEqual(SIM.MAX_SPEED_KMH);
        const turn = Math.abs(((next.state.headingDeg - state.headingDeg + 540) % 360) - 180);
        expect(turn).toBeLessThanOrEqual(SIM.MAX_TURN_DEG + 1e-6);
        state = next.state;
      }
    }
  });

  it('never goes below 0% battery and reports whole percents', () => {
    const riding = vehicle({ status: 'IN_RIDE', batteryPercent: 1 });
    let { state } = stepVehicle(undefined, riding, t0, steady);
    for (let i = 1; i <= 100; i++) state = stepVehicle(state, riding, after(i * 30), steady).state;
    expect(state.battery).toBe(0);
    const reading = stepVehicle(state, riding, after(4000), steady).reading;
    expect(Number.isInteger(reading.batteryPercent)).toBe(true);
    expect(reading.batteryPercent).toBe(0);
  });

  it('does not teleport after a long pause: a gap counts as at most a minute', () => {
    const riding = vehicle({ status: 'IN_RIDE' });
    const { state } = stepVehicle(undefined, riding, t0, steady);
    const next = stepVehicle(state, riding, after(6 * 3600), steady);
    expect(distanceKmBetween(state, next.reading)).toBeLessThanOrEqual((SIM.MAX_SPEED_KMH * SIM.MAX_STEP_SECONDS) / 3600 + 1e-6);
  });

  it('a scooter that comes back is put at its (new) station at once and stops', () => {
    const riding = vehicle({ status: 'IN_RIDE' });
    let state: SimState = stepVehicle(undefined, riding, t0, steady).state;
    state = stepVehicle(state, riding, after(10), steady).state;
    const otherStation = { latitude: 13.01, longitude: 77.7 };
    const parked = stepVehicle(state, vehicle({ status: 'AVAILABLE', home: otherStation }), after(20), steady);
    expect(parked.reading).toMatchObject({ ...otherStation, speedKmh: 0, ignition: false });
    // The distance travelled stays on the odometer.
    expect(parked.reading.odometerKm).toBeGreaterThan(100);
  });

  it('a scooter with no known station and no battery reading still produces a sane reading', () => {
    const { reading } = stepVehicle(undefined, vehicle({ home: null, batteryPercent: null }), t0, steady);
    expect(reading.batteryPercent).toBe(80);
    expect(Math.abs(reading.latitude)).toBeLessThanOrEqual(90);
    expect(Math.abs(reading.longitude)).toBeLessThanOrEqual(180);
  });
});
