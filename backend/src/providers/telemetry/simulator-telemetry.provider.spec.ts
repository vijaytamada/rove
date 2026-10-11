import { PARKED_INTERVAL_MS, RIDE_INTERVAL_MS, SimulatorTelemetryProvider } from './simulator-telemetry.provider.js';
import type { FleetVehicle, TelemetryHost, TelemetryReading } from './telemetry.provider.js';

const home = { latitude: 12.97, longitude: 77.64 };
const vehicle = (id: string, status: FleetVehicle['status']): FleetVehicle => ({ id, code: id, status, batteryPercent: 80, odometerKm: 0, home });
const t0 = new Date('2026-10-12T10:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

function host(fleet: () => FleetVehicle[]) {
  const sent: TelemetryReading[][] = [];
  const h: TelemetryHost = {
    listVehicles: async () => fleet(),
    ingest: async (r) => {
      sent.push(r);
    },
  };
  return { h, sent };
}

describe('SimulatorTelemetryProvider', () => {
  it('reports every scooter at first, then only the ones on a ride until the next heartbeat', async () => {
    const sim = new SimulatorTelemetryProvider();
    const { h, sent } = host(() => [vehicle('riding', 'IN_RIDE'), vehicle('parked', 'AVAILABLE')]);

    expect(await sim.tick(h, at(0))).toBe(2);
    expect(await sim.tick(h, at(RIDE_INTERVAL_MS))).toBe(1);
    expect(sent[1].map((r) => r.vehicleId)).toEqual(['riding']);
    expect(await sim.tick(h, at(PARKED_INTERVAL_MS))).toBe(2); // the heartbeat is due again
  });

  it('a scooter that just came back reports once more so it jumps to its station, then falls back to heartbeats', async () => {
    const sim = new SimulatorTelemetryProvider();
    let status: FleetVehicle['status'] = 'IN_RIDE';
    const { h, sent } = host(() => [vehicle('v', status)]);
    await sim.tick(h, at(0));
    await sim.tick(h, at(10_000));
    status = 'AVAILABLE';
    expect(await sim.tick(h, at(20_000))).toBe(1);
    expect(sent.at(-1)![0]).toMatchObject({ speedKmh: 0, ignition: false, ...home });
    expect(await sim.tick(h, at(30_000))).toBe(0);
  });

  it('does not run two rounds at once', async () => {
    const sim = new SimulatorTelemetryProvider();
    let release: () => void = () => {};
    const slow: TelemetryHost = {
      listVehicles: () => new Promise((resolve) => (release = () => resolve([vehicle('v', 'IN_RIDE')]))),
      ingest: async () => {},
    };
    const first = sim.tick(slow, at(0));
    expect(await sim.tick(slow, at(1))).toBe(0);
    release();
    expect(await first).toBe(1);
  });

  it('survives a failing round', async () => {
    const sim = new SimulatorTelemetryProvider();
    const broken: TelemetryHost = {
      listVehicles: async () => {
        throw new Error('database down');
      },
      ingest: async () => {},
    };
    expect(await sim.tick(broken, at(0))).toBe(0);
    const { h } = host(() => [vehicle('v', 'IN_RIDE')]);
    expect(await sim.tick(h, at(1000))).toBe(1); // and the next round works
  });

  it('refuses to be created in production', () => {
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => new SimulatorTelemetryProvider()).toThrow(/production/);
    } finally {
      process.env.NODE_ENV = before;
    }
  });
});
