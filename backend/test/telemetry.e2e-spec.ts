import { ConfigService } from '@nestjs/config';
import { SimulatorTelemetryProvider } from '../src/providers/telemetry/simulator-telemetry.provider.js';
import type { TelemetryHost } from '../src/providers/telemetry/telemetry.provider.js';
import { TelemetryService } from '../src/modules/telemetry/telemetry.service.js';
import { createTestApp, type TestApp } from './helpers.js';

const MIN = 60_000;

describe('Telemetry: ingest, live fleet, history (e2e)', () => {
  let t: TestApp;
  let deviceKey: string;
  let telemetry: TelemetryService;

  beforeAll(async () => {
    t = await createTestApp();
    deviceKey = t.app.get(ConfigService).get<string>('TELEMETRY_INGEST_KEY')!;
    telemetry = t.app.get(TelemetryService);
  });
  afterAll(() => t.cleanup());

  const api = (path: string) => `/api/v1${path}`;
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  /** City 1 has stations A and B; city 2 has station C. Two scooters at A, one at B, one at C. Staff for each. */
  async function setup() {
    const city = await t.makeCity();
    const other = await t.makeCity();
    const a = await t.makeStation(city.id);
    const b = await t.makeStation(city.id);
    const c = await t.makeStation(other.id);
    for (const [st, lat, lng] of [[a, 12.97, 77.64], [b, 12.93, 77.62], [c, 17.4, 78.4]] as const) {
      await t.prisma.station.update({ where: { id: st.id }, data: { latitude: lat, longitude: lng } });
    }
    const model = await t.makeModel();
    await t.makePlan(model.id);
    const a1 = await t.makeVehicle(a.id, model.id);
    const a2 = await t.makeVehicle(a.id, model.id);
    const b1 = await t.makeVehicle(b.id, model.id);
    const c1 = await t.makeVehicle(c.id, model.id);
    const empA = await t.asRole('STATION_EMPLOYEE', { stationIds: [a.id] });
    const empB = await t.asRole('STATION_EMPLOYEE', { stationIds: [b.id] });
    const empC = await t.asRole('STATION_EMPLOYEE', { stationIds: [c.id] });
    const manager = await t.asRole('CITY_MANAGER', { cityIds: [city.id] });
    const admin = await t.asRole('SUPER_ADMIN');
    return { city, other, a, b, c, a1, a2, b1, c1, empA, empB, empC, manager, admin };
  }
  type Setup = Awaited<ReturnType<typeof setup>>;

  const reading = (vehicleId: string, over: Record<string, unknown> = {}) => ({
    vehicleId,
    recordedAt: new Date().toISOString(),
    latitude: 12.98,
    longitude: 77.65,
    speedKmh: 22.5,
    batteryPercent: 71,
    odometerKm: 120.4,
    ignition: true,
    ...over,
  });
  const post = (readings: unknown[], key: string | null = deviceKey) => {
    const req = t.http().post(api('/telemetry'));
    if (key !== null) req.set('x-device-key', key);
    return req.send({ readings });
  };
  const live = async (who: { auth: { Authorization: string } }) =>
    (await t.http().get(api('/fleet/live')).set(who.auth).expect(200)).body as {
      stations: { id: string }[];
      vehicles: { vehicleId: string; code: string; status: string; booking: { id: string; code: string } | null; station: { id: string } | null; position: null | { latitude: number; longitude: number; source: string; stale: boolean; ignition: boolean; speedKmh: number }; batteryPercent: number | null }[];
    };
  const count = (vehicleId: string) => t.prisma.telemetryPoint.count({ where: { vehicleId } });

  /** The customer books and takes a scooter out on a ride from the given station's employee. */
  async function startRide(s: Setup, vehicleId: string, emp: { auth: { Authorization: string } }) {
    const customer = await t.verifiedCustomer();
    const created = await t.http().post(api('/bookings')).set(customer.auth).send({ vehicleId, hours: 2 }).expect(201);
    const paid = (await t.http().post(api(`/bookings/${created.body.id}/pay`)).set(customer.auth).send({}).expect(200)).body;
    await t.http().post(api(`/station/bookings/${paid.id}/pickup`)).set(emp.auth).send({ pin: paid.pin, idChecked: true, startOdometerKm: 100, startBatteryPercent: 90 }).expect(200);
    return { customer, booking: paid };
  }

  describe('ingest', () => {
    it('stores readings, answers how many, and keeps the newest for the live view', async () => {
      const s = await setup();
      const res = await post([reading(s.a1.id, { recordedAt: ago(20_000) }), reading(s.a1.id, { recordedAt: ago(10_000), latitude: 12.99 })]).expect(200);
      expect(res.body).toEqual({ accepted: 2, rejected: [] });
      expect(await count(s.a1.id)).toBe(2);
      const latest = JSON.parse((await t.redis.client.get(`telemetry:latest:${s.a1.id}`))!);
      expect(latest).toMatchObject({ latitude: 12.99, speedKmh: 22.5, batteryPercent: 71, ignition: true });
    });

    it('needs the device key, and no login', async () => {
      const s = await setup();
      for (const key of [null, '', 'wrong-key-wrong-key-1', deviceKey.slice(0, -1), `${deviceKey}x`]) {
        const res = await post([reading(s.a1.id)], key).expect(401);
        expect(res.body.code).toBe('INVALID_DEVICE_KEY');
      }
      // A login token is not a device key.
      await t.http().post(api('/telemetry')).set(s.admin.auth).send({ readings: [reading(s.a1.id)] }).expect(401);
      expect(await count(s.a1.id)).toBe(0);
    });

    it('refuses a bad batch whole, with a 400', async () => {
      const s = await setup();
      const bad = [
        [],
        Array.from({ length: 101 }, (_, i) => reading(s.a1.id, { recordedAt: ago(i * 1000 + 1000) })),
        [reading(s.a1.id, { latitude: 91 })],
        [reading(s.a1.id, { longitude: -181 })],
        [reading(s.a1.id, { speedKmh: -1 })],
        [reading(s.a1.id, { speedKmh: 201 })],
        [reading(s.a1.id, { batteryPercent: 101 })],
        [reading(s.a1.id, { batteryPercent: 50.5 })],
        [reading(s.a1.id, { odometerKm: -5 })],
        [reading(s.a1.id, { ignition: 'yes' })],
        [reading('not-a-uuid')],
        [reading(s.a1.id, { recordedAt: 'yesterday-ish' })],
        [{ ...reading(s.a1.id), extra: 1 }],
      ];
      for (const readings of bad) await post(readings).expect(400);
      await t.http().post(api('/telemetry')).set('x-device-key', deviceKey).send({}).expect(400);
      expect(await count(s.a1.id)).toBe(0);
    });

    it('accepts the good readings of a batch and says why it refused the others', async () => {
      const s = await setup();
      const res = await post([
        reading(s.a1.id, { recordedAt: ago(5000) }),
        reading('00000000-0000-4000-8000-000000000000'),
        reading(s.a1.id, { recordedAt: new Date(Date.now() + 10 * MIN).toISOString() }),
        reading(s.a1.id, { recordedAt: new Date(Date.now() - 2 * 24 * 60 * MIN).toISOString() }),
      ]).expect(200);
      expect(res.body.accepted).toBe(1);
      expect(res.body.rejected).toEqual([
        { index: 1, reason: 'Unknown scooter.' },
        { index: 2, reason: 'The time is in the future.' },
        { index: 3, reason: 'The reading is too old.' },
      ]);
      expect(await count(s.a1.id)).toBe(1);
    });

    it('a repeated reading is stored once, so a tracker may safely retry', async () => {
      const s = await setup();
      const r = reading(s.a1.id, { recordedAt: ago(5000) });
      expect((await post([r]).expect(200)).body.accepted).toBe(1);
      expect((await post([r]).expect(200)).body.accepted).toBe(0);
      expect(await count(s.a1.id)).toBe(1);
    });

    it('an older reading arriving late never replaces a newer live position', async () => {
      const s = await setup();
      await post([reading(s.a1.id, { recordedAt: ago(1000), latitude: 12.99 })]).expect(200);
      await post([reading(s.a1.id, { recordedAt: ago(60_000), latitude: 12.5 })]).expect(200);
      const latest = JSON.parse((await t.redis.client.get(`telemetry:latest:${s.a1.id}`))!);
      expect(latest.latitude).toBe(12.99);
      expect(await count(s.a1.id)).toBe(2); // but the history keeps both
    });

    it('the database itself refuses an impossible reading', async () => {
      const s = await setup();
      await expect(
        t.prisma.telemetryPoint.create({ data: { vehicleId: s.a1.id, recordedAt: new Date(), latitude: 100, longitude: 0, speedKmh: 0, batteryPercent: 50, odometerKm: 0, ignition: false } }),
      ).rejects.toThrow();
      await expect(
        t.prisma.telemetryPoint.create({ data: { vehicleId: s.a1.id, recordedAt: new Date(), latitude: 0, longitude: 0, speedKmh: 0, batteryPercent: 150, odometerKm: 0, ignition: false } }),
      ).rejects.toThrow();
    });
  });

  describe('the live fleet', () => {
    it('is for staff only', async () => {
      const s = await setup();
      const customer = await t.verifiedCustomer();
      await t.http().get(api('/fleet/live')).expect(401);
      await t.http().get(api('/fleet/live')).set(customer.auth).expect(403);
      await t.http().get(api(`/vehicles/${s.a1.id}/telemetry`)).set(customer.auth).expect(403);
      await t.http().get(api(`/vehicles/${s.a1.id}/telemetry`)).expect(401);
    });

    it('each role sees only its own scooters and stations', async () => {
      const s = await setup();
      const codes = async (who: { auth: { Authorization: string } }) => (await live(who)).vehicles.map((v) => v.vehicleId);
      const mine = (ids: string[]) => ids.filter((id) => [s.a1.id, s.a2.id, s.b1.id, s.c1.id].includes(id)).sort();

      expect(mine(await codes(s.empA))).toEqual([s.a1.id, s.a2.id].sort());
      expect(mine(await codes(s.empB))).toEqual([s.b1.id]);
      expect(mine(await codes(s.manager))).toEqual([s.a1.id, s.a2.id, s.b1.id].sort());
      expect(mine(await codes(s.admin))).toEqual([s.a1.id, s.a2.id, s.b1.id, s.c1.id].sort());

      expect((await live(s.empA)).stations.map((x) => x.id)).toEqual([s.a.id]);
      expect((await live(s.manager)).stations.map((x) => x.id).sort()).toEqual([s.a.id, s.b.id].sort());
    });

    it('a parked scooter with no reading shows at its station; with its own reading, there', async () => {
      const s = await setup();
      let a1 = (await live(s.empA)).vehicles.find((v) => v.vehicleId === s.a1.id)!;
      expect(a1).toMatchObject({ status: 'AVAILABLE', booking: null, station: { id: s.a.id }, position: { latitude: 12.97, longitude: 77.64, source: 'STATION', ignition: false, speedKmh: 0 } });
      await post([reading(s.a1.id, { ignition: false, speedKmh: 0, latitude: 12.9701, longitude: 77.6401, recordedAt: ago(30_000), batteryPercent: 64 })]).expect(200);
      a1 = (await live(s.empA)).vehicles.find((v) => v.vehicleId === s.a1.id)!;
      expect(a1.position).toMatchObject({ latitude: 12.9701, source: 'TRACKER', stale: false });
      expect(a1.batteryPercent).toBe(64);
    });

    it('a scooter on a ride appears for the whole city, with its ride but never the rider, and follows its tracker', async () => {
      const s = await setup();
      const { customer, booking } = await startRide(s, s.a1.id, s.empA);

      // Out on a ride, no reading yet: no position.
      let v = (await live(s.empB)).vehicles.find((x) => x.vehicleId === s.a1.id)!;
      expect(v).toMatchObject({ status: 'IN_RIDE', station: null, booking: { id: booking.id, code: booking.code }, position: null });
      // Another city's staff cannot see it; city staff can.
      expect((await live(s.empC)).vehicles.map((x) => x.vehicleId)).not.toContain(s.a1.id);
      expect((await live(s.manager)).vehicles.map((x) => x.vehicleId)).toContain(s.a1.id);

      // A reading from before the ride started belongs to the parked scooter: ignored.
      await post([reading(s.a1.id, { recordedAt: ago(3 * 3600_000), ignition: false, speedKmh: 0 })]).expect(200);
      v = (await live(s.empB)).vehicles.find((x) => x.vehicleId === s.a1.id)!;
      expect(v.position).toBeNull();

      await post([reading(s.a1.id, { recordedAt: ago(0), latitude: 12.95, longitude: 77.61, speedKmh: 18.2 })]).expect(200);
      v = (await live(s.empA)).vehicles.find((x) => x.vehicleId === s.a1.id)!;
      expect(v.position).toMatchObject({ latitude: 12.95, longitude: 77.61, speedKmh: 18.2, ignition: true, source: 'TRACKER', stale: false });

      // Never the rider.
      const everything = JSON.stringify(await live(s.admin));
      expect(everything).not.toContain(customer.id);
      expect(everything).not.toMatch(/phone|fullName|pin/i);

      // A tracker that has gone quiet for over two minutes is flagged.
      await t.prisma.rental.update({ where: { bookingId: booking.id }, data: { startedAt: new Date(Date.now() - 3600_000) } }); // the ride has been going an hour
      await t.redis.client.set(`telemetry:latest:${s.a1.id}`, JSON.stringify({ recordedAt: ago(5 * MIN), latitude: 12.95, longitude: 77.61, speedKmh: 18, batteryPercent: 60, odometerKm: 1, ignition: true }), 'EX', 600);
      v = (await live(s.empA)).vehicles.find((x) => x.vehicleId === s.a1.id)!;
      expect(v.position?.stale).toBe(true);
    });

    it('a scooter brought back shows at its station at once, though its last reading was on the road', async () => {
      const s = await setup();
      const { booking } = await startRide(s, s.a1.id, s.empA);
      await post([reading(s.a1.id, { recordedAt: ago(3000), latitude: 12.9, longitude: 77.5 })]).expect(200);
      await t.http().post(api(`/station/bookings/${booking.id}/return`)).set(s.empB.auth).send({ returnStationId: s.b.id, endOdometerKm: 105, endBatteryPercent: 50 }).expect(200);

      const v = (await live(s.empB)).vehicles.find((x) => x.vehicleId === s.a1.id)!;
      expect(v).toMatchObject({ status: 'AVAILABLE', booking: null, station: { id: s.b.id }, position: { latitude: 12.93, longitude: 77.62, source: 'STATION' } });
    });

    it('a retired scooter is not shown', async () => {
      const s = await setup();
      await t.prisma.vehicle.update({ where: { id: s.a2.id }, data: { retiredAt: new Date() } });
      expect((await live(s.empA)).vehicles.map((x) => x.vehicleId)).not.toContain(s.a2.id);
    });
  });

  describe('history', () => {
    it('returns the recent path oldest first, and honours from, to and limit', async () => {
      const s = await setup();
      await post([
        reading(s.a1.id, { recordedAt: ago(50 * MIN), latitude: 12.1 }),
        reading(s.a1.id, { recordedAt: ago(20 * MIN), latitude: 12.2 }),
        reading(s.a1.id, { recordedAt: ago(10 * MIN), latitude: 12.3 }),
        reading(s.a1.id, { recordedAt: ago(1 * MIN), latitude: 12.4 }),
      ]).expect(200);
      const get = (query = '') => t.http().get(api(`/vehicles/${s.a1.id}/telemetry${query}`)).set(s.empA.auth);

      // Default: the last 30 minutes.
      expect((await get().expect(200)).body.points.map((p: { latitude: number }) => p.latitude)).toEqual([12.2, 12.3, 12.4]);
      const all = await get(`?from=${encodeURIComponent(ago(2 * 3600_000))}`).expect(200);
      expect(all.body.points.map((p: { latitude: number }) => p.latitude)).toEqual([12.1, 12.2, 12.3, 12.4]);
      const window = await get(`?from=${encodeURIComponent(ago(30 * MIN))}&to=${encodeURIComponent(ago(5 * MIN))}`).expect(200);
      expect(window.body.points.map((p: { latitude: number }) => p.latitude)).toEqual([12.2, 12.3]);
      // A limit keeps the newest points, still oldest first.
      const limited = await get(`?from=${encodeURIComponent(ago(2 * 3600_000))}&limit=2`).expect(200);
      expect(limited.body.points.map((p: { latitude: number }) => p.latitude)).toEqual([12.3, 12.4]);
      expect(all.body.points[0]).toMatchObject({ speedKmh: 22.5, batteryPercent: 71, ignition: true });
      expect(all.body.points[0]).not.toHaveProperty('id');
    });

    it('is limited to the user\'s scope, and a bad query is a 400', async () => {
      const s = await setup();
      await t.http().get(api(`/vehicles/${s.a1.id}/telemetry`)).set(s.empB.auth).expect(404); // another station
      await t.http().get(api(`/vehicles/${s.a1.id}/telemetry`)).set(s.manager.auth).expect(200);
      await t.http().get(api(`/vehicles/${s.c1.id}/telemetry`)).set(s.manager.auth).expect(404); // another city
      await t.http().get(api(`/vehicles/${s.c1.id}/telemetry`)).set(s.admin.auth).expect(200);
      await t.http().get(api('/vehicles/00000000-0000-4000-8000-000000000000/telemetry')).set(s.admin.auth).expect(404);
      await t.http().get(api('/vehicles/not-a-uuid/telemetry')).set(s.admin.auth).expect(400);
      await t.http().get(api(`/vehicles/${s.a1.id}/telemetry?limit=5000`)).set(s.admin.auth).expect(400);
      await t.http().get(api(`/vehicles/${s.a1.id}/telemetry?from=nonsense`)).set(s.admin.auth).expect(400);
    });

    it('a ride in progress can be followed by the staff of its city', async () => {
      const s = await setup();
      await startRide(s, s.a1.id, s.empA);
      await t.http().get(api(`/vehicles/${s.a1.id}/telemetry`)).set(s.empB.auth).expect(200);
      await t.http().get(api(`/vehicles/${s.a1.id}/telemetry`)).set(s.empC.auth).expect(404);
    });
  });

  describe('retention and the simulator', () => {
    it('old readings are deleted, recent ones kept', async () => {
      const s = await setup();
      await t.prisma.telemetryPoint.createMany({
        data: [30, 8, 1].map((days) => ({
          vehicleId: s.a1.id,
          recordedAt: new Date(Date.now() - days * 86_400_000),
          latitude: 12,
          longitude: 77,
          speedKmh: 0,
          batteryPercent: 50,
          odometerKm: 0,
          ignition: false,
        })),
      });
      expect(await telemetry.prune()).toBeGreaterThanOrEqual(2);
      expect(await count(s.a1.id)).toBe(1);
    });

    it('the simulator feeds the backend: a scooter on a ride moves, a parked one stays at its station', async () => {
      const s = await setup();
      await startRide(s, s.a1.id, s.empA);
      const mine = new Set([s.a1.id, s.a2.id]);
      const host: TelemetryHost = {
        listVehicles: async () => (await telemetry.listVehicles()).filter((v) => mine.has(v.id)),
        ingest: (readings) => telemetry.ingest(readings),
      };
      const sim = new SimulatorTelemetryProvider();
      const t0 = Date.now();
      for (let i = 0; i < 4; i++) await sim.tick(host, new Date(t0 + i * 10_000));

      const view = await live(s.empA);
      const riding = view.vehicles.find((v) => v.vehicleId === s.a1.id)!;
      const parked = view.vehicles.find((v) => v.vehicleId === s.a2.id)!;
      expect(riding.position).toMatchObject({ source: 'TRACKER', ignition: true });
      expect(riding.position!.speedKmh).toBeGreaterThanOrEqual(10);
      expect(parked.position).toMatchObject({ latitude: 12.97, longitude: 77.64, ignition: false });
      expect(await count(s.a1.id)).toBe(4);
      expect(await count(s.a2.id)).toBe(1); // only the first heartbeat
      const path = (await t.http().get(api(`/vehicles/${s.a1.id}/telemetry?to=${encodeURIComponent(ago(-5 * MIN))}`)).set(s.empA.auth).expect(200)).body.points;
      expect(path).toHaveLength(4);
      expect(new Set(path.map((p: { latitude: number }) => p.latitude)).size).toBeGreaterThan(1); // it really moved
    });

    it('the job removes old readings as one of its steps', async () => {
      const s = await setup();
      await t.prisma.telemetryPoint.create({
        data: { vehicleId: s.a1.id, recordedAt: new Date(Date.now() - 20 * 86_400_000), latitude: 12, longitude: 77, speedKmh: 0, batteryPercent: 50, odometerKm: 0, ignition: false },
      });
      const { JobsService } = await import('../src/modules/jobs/jobs.service.js');
      const result = await t.app.get(JobsService).runOnce();
      expect(result.telemetryPruned).toBeGreaterThanOrEqual(1);
      expect(await count(s.a1.id)).toBe(0);
    });
  });
});
