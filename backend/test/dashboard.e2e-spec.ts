import { createTestApp, type Auth, type TestApp } from './helpers.js';

const HOUR = 3_600_000;
const MIN = 60_000;
const DEPOSIT = 100_000;

describe('Dashboards (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.cleanup());

  const api = (path: string) => `/api/v1${path}`;

  /**
   * One test city with station A (5 scooters) and station B (1 scooter), and this history at A:
   *   c1 paid, starts in 5 hours (waiting)        c2 out on a ride, 30 minutes overdue
   *   c3 returned, 14 km over, refunded           c4 returned, owes money
   *   c5 booked and cancelled (full refund)
   */
  async function world() {
    const city = await t.makeCity();
    const a = await t.makeStation(city.id, { capacity: 10 });
    const b = await t.makeStation(city.id, { capacity: 10 });
    const model = await t.makeModel();
    await t.makePlan(model.id);
    const vA = [];
    for (let i = 0; i < 5; i++) vA.push((await t.makeVehicle(a.id, model.id)).id);
    await t.makeVehicle(b.id, model.id);
    const empA = await t.asRole('STATION_EMPLOYEE', { stationIds: [a.id] });
    const empB = await t.asRole('STATION_EMPLOYEE', { stationIds: [b.id] });
    const manager = await t.asRole('CITY_MANAGER', { cityIds: [city.id] });
    const otherManager = await t.asRole('CITY_MANAGER', { cityIds: [(await t.makeCity()).id] });
    const admin = await t.asRole('SUPER_ADMIN');

    const book = async (vehicleId: string, startOffsetMs = 0) => {
      const customer = await t.verifiedCustomer();
      const body: Record<string, unknown> = { vehicleId, hours: 2 };
      if (startOffsetMs) body.startAt = new Date(Date.now() + startOffsetMs).toISOString();
      const created = await t.http().post(api('/bookings')).set(customer.auth).send(body).expect(201);
      const paid = await t.http().post(api(`/bookings/${created.body.id}/pay`)).set(customer.auth).send({}).expect(200);
      return { customer, id: paid.body.id as string, pin: paid.body.pin as string, total: paid.body.totalAmount as number };
    };
    const pickup = (x: { id: string; pin: string }) =>
      t.http().post(api(`/station/bookings/${x.id}/pickup`)).set(empA.auth).send({ pin: x.pin, idChecked: true, startOdometerKm: 100, startBatteryPercent: 90 }).expect(200);
    const giveBack = (x: { id: string }, body: Record<string, unknown>) =>
      t.http().post(api(`/station/bookings/${x.id}/return`)).set(empA.auth).send({ returnStationId: a.id, endBatteryPercent: 60, ...body }).expect(200);

    const c1 = await book(vA[0]!, 5 * HOUR);
    const c2 = await book(vA[1]!);
    await pickup(c2);
    await t.prisma.rental.update({ where: { bookingId: c2.id }, data: { startedAt: new Date(Date.now() - 6 * HOUR) } });
    await t.prisma.booking.update({ where: { id: c2.id }, data: { startAt: new Date(Date.now() - 150 * MIN), endAt: new Date(Date.now() - 30 * MIN) } });
    const c3 = await book(vA[2]!);
    await pickup(c3);
    const r3 = await giveBack(c3, { endOdometerKm: 126 }); // 26 km, 12 included per hour x 2 = 24 -> 2 extra km
    const c4 = await book(vA[3]!);
    await pickup(c4);
    const r4 = await giveBack(c4, { endOdometerKm: 105, damages: [{ description: 'Cracked panel', severity: 'MINOR', feeAmount: DEPOSIT + 25_000 }] });
    const c5 = await book(vA[4]!);
    const cancelled = await t.http().post(api(`/bookings/${c5.id}/cancel`)).set(c5.customer.auth).expect(200);

    return { city, a, b, empA, empB, manager, otherManager, admin, c1, c2, c3, c4, c5, r3: r3.body, r4: r4.body, cancelled: cancelled.body };
  }
  type World = Awaited<ReturnType<typeof world>>;
  let w: World;
  beforeAll(async () => {
    w = await world();
  });

  const get = (path: string, auth?: Auth) => {
    const req = t.http().get(api(path));
    return auth ? req.set(auth) : req;
  };

  describe('station dashboard', () => {
    it('counts the queue, the fleet, the window and the money of one station', async () => {
      const res = await get(`/dashboard/station/${w.a.id}?range=1d`, w.empA.auth).expect(200);
      const d = res.body;
      expect(d.station).toMatchObject({ id: w.a.id, cityId: w.city.id });
      expect(d.window).toMatchObject({ key: '1d', hours: 24 });

      // 5 scooters: c2's is out, the other four are at the station.
      expect(d.fleet).toEqual({ total: 5, available: 4, inRide: 1, maintenance: 0, offline: 0 });
      expect(d.activity).toEqual({ newBookings: 5, ridesStarted: 3, ridesCompleted: 2, cancellations: 1, noShows: 0 });

      const refundedByReturn = w.r3.settlement.refundAmount as number;
      const refundedByCancel = w.c5.total;
      expect(d.money).toEqual({
        collected: w.c1.total + w.c2.total + w.c3.total + w.c4.total + w.c5.total,
        refunded: refundedByReturn + refundedByCancel,
        net: w.c1.total + w.c2.total + w.c3.total + w.c4.total + w.c5.total - refundedByReturn - refundedByCancel,
      });

      // Right now: c1 waits, c2 is out and overdue; c1 and c2's deposits are still held; c4 owes.
      expect(d.now).toMatchObject({
        waitingPickups: 1,
        ridesOut: 1,
        overdueRides: 1,
        depositsHeld: 2 * DEPOSIT,
        owed: { count: 1, amount: 25_000 },
        refundsPending: { count: 0, amount: 0 },
      });
      // c2 was out for about 6 of the 24 hours, c3 and c4 for moments: 6 / (5 x 24) = 5%.
      expect(d.utilizationPercent).toBeCloseTo(5, 0);
    });

    it('lists who is waiting and who is out, with the overdue ride flagged', async () => {
      const d = (await get(`/dashboard/station/${w.a.id}`, w.empA.auth).expect(200)).body;
      expect(d.queue.pickups).toHaveLength(1);
      expect(d.queue.pickups[0]).toMatchObject({ id: w.c1.id, overdue: false });
      expect(d.queue.pickups[0].customerName).toBeTruthy();
      expect(d.queue.pickups[0].vehicleCode).toBeTruthy();
      expect(d.queue.rides).toHaveLength(1);
      expect(d.queue.rides[0]).toMatchObject({ id: w.c2.id, overdue: true });
      expect(JSON.stringify(d)).not.toContain(w.c1.pin);
    });

    it('a quiet station shows zeros, not errors', async () => {
      const d = (await get(`/dashboard/station/${w.b.id}`, w.empB.auth).expect(200)).body;
      expect(d.fleet).toEqual({ total: 1, available: 1, inRide: 0, maintenance: 0, offline: 0 });
      expect(d.activity).toEqual({ newBookings: 0, ridesStarted: 0, ridesCompleted: 0, cancellations: 0, noShows: 0 });
      expect(d.money).toEqual({ collected: 0, refunded: 0, net: 0 });
      expect(d.utilizationPercent).toBe(0);
      expect(d.queue).toEqual({ pickups: [], rides: [] });
    });

    it('is scoped: your own station, your city as a manager, anything as an admin', async () => {
      await get(`/dashboard/station/${w.a.id}`, w.empB.auth).expect(403);
      await get(`/dashboard/station/${w.b.id}`, w.empA.auth).expect(403);
      await get(`/dashboard/station/${w.a.id}`, w.manager.auth).expect(200);
      await get(`/dashboard/station/${w.a.id}`, w.otherManager.auth).expect(403);
      await get(`/dashboard/station/${w.a.id}`, w.admin.auth).expect(200);
      await get('/dashboard/station/00000000-0000-4000-8000-000000000000', w.admin.auth).expect(404);
      await get('/dashboard/station/not-a-uuid', w.admin.auth).expect(400);
    });
  });

  describe('city dashboard', () => {
    it('adds up its stations and lists each one', async () => {
      const d = (await get(`/dashboard/city/${w.city.id}?range=1d`, w.manager.auth).expect(200)).body;
      expect(d.city).toMatchObject({ id: w.city.id });
      expect(d.fleet).toEqual({ total: 6, available: 5, inRide: 1, maintenance: 0, offline: 0 });
      expect(d.activity.newBookings).toBe(5);
      expect(d.now.owed).toEqual({ count: 1, amount: 25_000 });
      expect(d.stations).toHaveLength(2);
      const rowA = d.stations.find((s: { id: string }) => s.id === w.a.id);
      const rowB = d.stations.find((s: { id: string }) => s.id === w.b.id);
      expect(rowA).toMatchObject({ fleet: { total: 5, inRide: 1 }, now: { waitingPickups: 1, ridesOut: 1, overdueRides: 1, owed: { count: 1, amount: 25_000 } } });
      expect(rowB).toMatchObject({ fleet: { total: 1 }, money: { collected: 0 }, now: { waitingPickups: 0, owed: { count: 0, amount: 0 } } });
      // The whole city equals its parts.
      expect(d.money.collected).toBe(rowA.money.collected + rowB.money.collected);
    });

    it('is for managers of that city and admins only', async () => {
      await get(`/dashboard/city/${w.city.id}`, w.otherManager.auth).expect(403);
      await get(`/dashboard/city/${w.city.id}`, w.empA.auth).expect(403);
      await get(`/dashboard/city/${w.city.id}`, w.c1.customer.auth).expect(403);
      await get(`/dashboard/city/${w.city.id}`, w.admin.auth).expect(200);
      await get(`/dashboard/city/${w.city.id}`).expect(401);
      expect((await get('/dashboard/city/00000000-0000-4000-8000-000000000000', w.admin.auth).expect(404)).body.code).toBe('CITY_NOT_FOUND');
    });
  });

  describe('admin dashboard', () => {
    it('shows the whole network with a row per city', async () => {
      const d = (await get('/dashboard/admin?range=1d', w.admin.auth).expect(200)).body;
      const row = d.cities.find((c: { id: string }) => c.id === w.city.id);
      expect(row).toMatchObject({ stations: 2, fleet: { total: 6, inRide: 1 }, now: { waitingPickups: 1, ridesOut: 1, owed: { count: 1, amount: 25_000 } } });
      expect(row.money.collected).toBeGreaterThan(0);
      // The network is at least this city (other tests and seed data add more).
      expect(d.fleet.total).toBeGreaterThanOrEqual(6);
      expect(d.money.collected).toBeGreaterThanOrEqual(row.money.collected);
      expect(d.now.owed.amount).toBeGreaterThanOrEqual(25_000);
      expect(d.window).toMatchObject({ key: '1d', hours: 24 });
    });

    it('is for super admins only', async () => {
      await get('/dashboard/admin', w.manager.auth).expect(403);
      await get('/dashboard/admin', w.empA.auth).expect(403);
      await get('/dashboard/admin', w.c1.customer.auth).expect(403);
      await get('/dashboard/admin').expect(401);
    });
  });

  describe('the time window', () => {
    it('defaults to 7 days, accepts 24 hours and 30 days, and rejects anything else', async () => {
      expect((await get(`/dashboard/station/${w.a.id}`, w.empA.auth).expect(200)).body.window).toMatchObject({ key: '7d', hours: 168 });
      expect((await get(`/dashboard/station/${w.a.id}?range=30d`, w.empA.auth).expect(200)).body.window).toMatchObject({ key: '30d', hours: 720 });
      await get(`/dashboard/station/${w.a.id}?range=forever`, w.empA.auth).expect(400);
    });

    it('only counts what happened inside it', async () => {
      // Move c3's payment out of the 24 hour window: it still counts in 7 days, not in 1 day.
      const payment = await t.prisma.payment.findFirstOrThrow({ where: { bookingId: w.c3.id, purpose: 'RENTAL_AND_DEPOSIT' } });
      await t.prisma.payment.update({ where: { id: payment.id }, data: { paidAt: new Date(Date.now() - 3 * 24 * HOUR) } });
      const day = (await get(`/dashboard/station/${w.a.id}?range=1d`, w.empA.auth).expect(200)).body;
      const week = (await get(`/dashboard/station/${w.a.id}?range=7d`, w.empA.auth).expect(200)).body;
      expect(week.money.collected - day.money.collected).toBe(w.c3.total);
    });
  });

  describe('customer dashboard', () => {
    it('shows a ride in progress as the active booking', async () => {
      const d = (await get('/dashboard/customer', w.c2.customer.auth).expect(200)).body;
      expect(d.active).toMatchObject({ id: w.c2.id, status: 'IN_RIDE' });
      expect(d.upcoming).toBeNull();
      expect(d.owed).toBeNull();
      expect(d.stats).toEqual({ rides: 0, distanceKm: 0 });
    });

    it('shows the next paid booking, and never someone else\'s', async () => {
      const d = (await get('/dashboard/customer', w.c1.customer.auth).expect(200)).body;
      expect(d.upcoming).toMatchObject({ id: w.c1.id, status: 'CONFIRMED' });
      expect(d.active).toBeNull();
      expect(d.recent).toEqual([]);
      expect(JSON.stringify(d)).not.toContain(w.c2.id);
    });

    it('shows recent rides and totals after returning a scooter', async () => {
      const d = (await get('/dashboard/customer', w.c3.customer.auth).expect(200)).body;
      expect(d.active).toBeNull();
      expect(d.recent.map((b: { id: string }) => b.id)).toEqual([w.c3.id]);
      expect(d.recent[0].settlement).toMatchObject({ status: 'REFUNDED' });
      expect(d.stats).toEqual({ rides: 1, distanceKm: 26 });
      expect(d.owed).toBeNull();
    });

    it('puts money owed up front and keeps that ride under active', async () => {
      const d = (await get('/dashboard/customer', w.c4.customer.auth).expect(200)).body;
      expect(d.owed).toEqual({ bookingId: w.c4.id, amount: 25_000 });
      expect(d.active).toMatchObject({ id: w.c4.id });
      expect(d.stats).toEqual({ rides: 1, distanceKm: 5 });
      // Paying clears it.
      await t.http().post(api(`/bookings/${w.c4.id}/settlement/pay`)).set(w.c4.customer.auth).send({}).expect(200);
      const after = (await get('/dashboard/customer', w.c4.customer.auth).expect(200)).body;
      expect(after.owed).toBeNull();
      expect(after.active).toBeNull();
      expect(after.recent.map((b: { id: string }) => b.id)).toContain(w.c4.id);
    });

    it('a customer with no bookings gets an empty home', async () => {
      const fresh = await t.verifiedCustomer();
      const d = (await get('/dashboard/customer', fresh.auth).expect(200)).body;
      expect(d).toEqual({ active: null, upcoming: null, recent: [], owed: null, stats: { rides: 0, distanceKm: 0 } });
    });

    it('is for customers only', async () => {
      await get('/dashboard/customer', w.empA.auth).expect(403);
      await get('/dashboard/customer', w.manager.auth).expect(403);
      await get('/dashboard/customer', w.admin.auth).expect(403);
      await get('/dashboard/customer').expect(401);
    });
  });
});
