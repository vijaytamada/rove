import { choosePosition } from './telemetry.service.js';

const now = new Date('2026-10-12T10:00:00Z');
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);
const station = { latitude: 12.97, longitude: 77.64 };
const latest = (over: Partial<{ ageSeconds: number; ignition: boolean }> = {}) => ({
  recordedAt: ago(over.ageSeconds ?? 5).toISOString(),
  latitude: 12.98,
  longitude: 77.65,
  speedKmh: 21.5,
  batteryPercent: 70,
  odometerKm: 120,
  ignition: over.ignition ?? true,
});

describe('choosePosition', () => {
  it('a scooter on a ride shows where its tracker last said it was', () => {
    expect(choosePosition('IN_RIDE', latest(), station, ago(600), now)).toMatchObject({
      latitude: 12.98,
      longitude: 77.65,
      speedKmh: 21.5,
      ignition: true,
      stale: false,
      source: 'TRACKER',
    });
  });

  it('a ride with no reading yet has no position', () => {
    expect(choosePosition('IN_RIDE', null, station, ago(60), now)).toBeNull();
  });

  it('ignores a reading from before the ride started (it belongs to the scooter parked at the station)', () => {
    expect(choosePosition('IN_RIDE', latest({ ageSeconds: 3600, ignition: false }), station, ago(60), now)).toBeNull();
  });

  it('a tracker that went quiet during a ride is marked stale', () => {
    expect(choosePosition('IN_RIDE', latest({ ageSeconds: 200 }), station, ago(3600), now)?.stale).toBe(true);
    expect(choosePosition('IN_RIDE', latest({ ageSeconds: 100 }), station, ago(3600), now)?.stale).toBe(false);
  });

  it('a parked scooter with no reading shows at its station', () => {
    expect(choosePosition('AVAILABLE', null, station, null, now)).toMatchObject({ ...station, speedKmh: 0, ignition: false, source: 'STATION', stale: false });
  });

  it('a scooter that was just brought back (last reading still moving) shows at its station, not where the ride ended', () => {
    expect(choosePosition('AVAILABLE', latest({ ignition: true }), station, null, now)).toMatchObject({ ...station, source: 'STATION' });
  });

  it('a parked scooter\'s own heartbeat is used, and goes stale much later than a ride', () => {
    const parked = choosePosition('AVAILABLE', latest({ ageSeconds: 600, ignition: false }), station, null, now);
    expect(parked).toMatchObject({ latitude: 12.98, source: 'TRACKER', stale: false });
    expect(choosePosition('MAINTENANCE', latest({ ageSeconds: 1000, ignition: false }), station, null, now)?.stale).toBe(true);
  });

  it('a scooter with no station and no reading has no position', () => {
    expect(choosePosition('AVAILABLE', null, null, null, now)).toBeNull();
    expect(choosePosition('OFFLINE', latest({ ignition: false }), null, null, now)).toBeNull();
  });
});
