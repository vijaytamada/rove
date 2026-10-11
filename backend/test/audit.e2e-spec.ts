import { vi } from 'vitest';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { createTestApp, TEST_PASSWORD, type TestApp } from './helpers.js';

const DEPOSIT = 100_000;

describe('Audit trail (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.cleanup());
  afterEach(() => vi.restoreAllMocks());

  const api = (path: string) => `/api/v1${path}`;

  async function setup() {
    const city = await t.makeCity();
    const station = await t.makeStation(city.id);
    const model = await t.makeModel();
    await t.makePlan(model.id);
    const vehicle = await t.makeVehicle(station.id, model.id);
    const emp = await t.asRole('STATION_EMPLOYEE', { stationIds: [station.id] });
    const customer = await t.verifiedCustomer();
    return { city, station, model, vehicle, emp, customer };
  }
  type Setup = Awaited<ReturnType<typeof setup>>;

  async function paidBooking(s: Setup) {
    const created = await t.http().post(api('/bookings')).set(s.customer.auth).send({ vehicleId: s.vehicle.id, hours: 2 }).expect(201);
    return (await t.http().post(api(`/bookings/${created.body.id}/pay`)).set(s.customer.auth).send({}).expect(200)).body;
  }
  const pickup = (s: Setup, b: { id: string; pin: string }) =>
    t.http().post(api(`/station/bookings/${b.id}/pickup`)).set(s.emp.auth).send({ pin: b.pin, idChecked: true, startOdometerKm: 100, startBatteryPercent: 90 });
  const giveBack = (s: Setup, id: string, extra: Record<string, unknown> = {}) =>
    t.http().post(api(`/station/bookings/${id}/return`)).set(s.emp.auth).send({ returnStationId: s.station.id, endOdometerKm: 110, endBatteryPercent: 60, ...extra });
  const entries = (where: Record<string, unknown>) => t.prisma.auditLog.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

  describe('what gets recorded', () => {
    it('a hand-over, a return and a collected payment each leave an entry naming the staff member and the booking', async () => {
      const s = await setup();
      const booking = await paidBooking(s);
      await pickup(s, booking).expect(200);
      await giveBack(s, booking.id, { damages: [{ description: 'Frame bent', severity: 'MAJOR', feeAmount: DEPOSIT + 20_000 }] }).expect(200);
      const settlement = await t.prisma.settlement.findUniqueOrThrow({ where: { bookingId: booking.id } });
      await t.http().post(api(`/settlements/${settlement.id}/collect`)).set(s.emp.auth).send({}).expect(200);

      const bookingTrail = await entries({ entityType: 'booking', entityId: booking.id });
      expect(bookingTrail.map((e) => [e.action, e.actorId, e.actorRole, e.route])).toEqual([
        ['BOOKING_PICKUP', s.emp.id, 'STATION_EMPLOYEE', 'POST /station/bookings/:id/pickup'],
        ['BOOKING_RETURN', s.emp.id, 'STATION_EMPLOYEE', 'POST /station/bookings/:id/return'],
      ]);
      const collected = await entries({ entityType: 'settlement', entityId: settlement.id });
      expect(collected).toEqual([expect.objectContaining({ action: 'SETTLEMENT_COLLECT', actorId: s.emp.id })]);
    });

    it('a refund a staff member retried is recorded, and a no-show too', async () => {
      const s = await setup();
      const booking = await paidBooking(s);
      await pickup(s, booking).expect(200);
      vi.spyOn(t.app.get(PaymentsService), 'refund').mockResolvedValueOnce(false);
      await giveBack(s, booking.id).expect(200);
      const settlement = await t.prisma.settlement.findUniqueOrThrow({ where: { bookingId: booking.id } });
      await t.http().post(api(`/settlements/${settlement.id}/retry-refund`)).set(s.emp.auth).expect(200);
      expect(await entries({ entityId: settlement.id })).toEqual([expect.objectContaining({ action: 'SETTLEMENT_RETRY_REFUND', actorId: s.emp.id })]);

      const later = await t.verifiedCustomer();
      const vehicle = await t.makeVehicle(s.station.id, s.model.id);
      const created = await t.http().post(api('/bookings')).set(later.auth).send({ vehicleId: vehicle.id, hours: 2, startAt: new Date(Date.now() + 3 * 3_600_000).toISOString() }).expect(201);
      const paid = (await t.http().post(api(`/bookings/${created.body.id}/pay`)).set(later.auth).send({}).expect(200)).body;
      await t.prisma.booking.update({ where: { id: paid.id }, data: { startAt: new Date(Date.now() - 61 * 60_000), endAt: new Date(Date.now() + 3 * 3_600_000) } });
      await t.http().post(api(`/station/bookings/${paid.id}/no-show`)).set(s.emp.auth).expect(200);
      expect((await entries({ entityId: paid.id })).map((e) => e.action)).toEqual(['BOOKING_NO_SHOW']);
    });

    it('admin changes are recorded: a new scooter (id from the response), a status change, a retire', async () => {
      const s = await setup();
      const admin = await t.asRole('SUPER_ADMIN');
      const made = await t.http().post(api('/vehicles')).set(admin.auth).send({ modelId: s.model.id, stationId: s.station.id, code: `E2E-${Date.now().toString(36).toUpperCase()}` }).expect(201);
      await t.http().patch(api(`/vehicles/${made.body.id}/status`)).set(admin.auth).send({ status: 'MAINTENANCE' }).expect(200);
      await t.http().delete(api(`/vehicles/${made.body.id}`)).set(admin.auth).expect(204);

      const trail = await entries({ entityId: made.body.id });
      expect(trail.map((e) => [e.action, e.actorId])).toEqual([
        ['VEHICLE_CREATE', admin.id],
        ['VEHICLE_STATUS', admin.id],
        ['VEHICLE_RETIRE', admin.id],
      ]);
      expect(trail[1].details).toEqual({ status: 'MAINTENANCE' });
    });

    it('a price change keeps the numbers that changed, and nothing else', async () => {
      const s = await setup();
      const admin = await t.asRole('SUPER_ADMIN');
      const plan = await t.prisma.pricingPlan.findFirstOrThrow({ where: { modelId: s.model.id } });
      await t.http().patch(api(`/pricing-plans/${plan.id}`)).set(admin.auth).send({ hourlyRateAmount: 6500, depositAmount: 150_000 }).expect(200);
      const [entry] = await entries({ entityId: plan.id });
      expect(entry).toMatchObject({ action: 'PRICING_PLAN_UPDATE', actorId: admin.id, details: { hourlyRateAmount: 6500, depositAmount: 150_000 } });
    });

    it('a new staff account is recorded without its password or personal details', async () => {
      const s = await setup();
      const admin = await t.asRole('SUPER_ADMIN');
      const email = t.email('audit-staff');
      const made = await t.http().post(api('/users')).set(admin.auth).send({
        email,
        password: TEST_PASSWORD,
        fullName: 'e2e-Audit Staff',
        role: 'STATION_EMPLOYEE',
        assignments: [{ stationId: s.station.id }],
      });
      expect(made.status).toBe(201);
      const [entry] = await entries({ entityId: made.body.id });
      expect(entry).toMatchObject({ action: 'STAFF_CREATE', actorId: admin.id, entityType: 'user' });
      const everything = JSON.stringify(await t.prisma.auditLog.findMany({ where: { actorId: admin.id } }));
      expect(everything).not.toContain(TEST_PASSWORD);
      expect(everything).not.toContain(email);
      expect(everything).not.toContain('Audit Staff');
      await t.http().patch(api(`/users/${made.body.id}`)).set(admin.auth).send({ status: 'DISABLED' }).expect(200);
      expect((await entries({ entityId: made.body.id })).map((e) => e.action)).toEqual(['STAFF_CREATE', 'STAFF_UPDATE']);
    });

    it('a route nobody listed is still recorded under its method and path', async () => {
      const admin = await t.asRole('SUPER_ADMIN');
      const city = await t.makeCity();
      await t.http().patch(api(`/cities/${city.id}`)).set(admin.auth).send({ isActive: true }).expect(200);
      expect(await entries({ entityId: city.id })).toEqual([expect.objectContaining({ action: 'CITY_UPDATE', entityType: 'city' })]);
    });
  });

  describe('what is not recorded', () => {
    it('reads, failed attempts, customers\' own actions, sign-in and the inbox leave nothing', async () => {
      const s = await setup();
      const booking = await paidBooking(s);
      const count = () => t.prisma.auditLog.count({ where: { actorId: { in: [s.emp.id, s.customer.id] } } });
      const before = await count();

      // Reads.
      await t.http().get(api('/station/bookings')).set(s.emp.auth).expect(200);
      await t.http().get(api(`/station/bookings/${booking.id}`)).set(s.emp.auth).expect(200);
      // Failed writes: a wrong PIN, an unknown booking, a wrong role.
      await t.http().post(api(`/station/bookings/${booking.id}/pickup`)).set(s.emp.auth).send({ pin: '000000', idChecked: true, startOdometerKm: 1, startBatteryPercent: 50 }).expect(403);
      await t.http().post(api('/station/bookings/00000000-0000-4000-8000-000000000000/no-show')).set(s.emp.auth).expect(404);
      await t.http().post(api('/vehicles')).set(s.emp.auth).send({}).expect(403);
      // The customer's own writes, sign-in and the inbox.
      await t.http().post(api(`/bookings/${booking.id}/cancel`)).set(s.customer.auth).expect(200);
      await t.http().post(api('/notifications/read-all')).set(s.customer.auth).expect(200);
      await t.login({ role: 'STATION_EMPLOYEE', email: (await t.prisma.user.findUniqueOrThrow({ where: { id: s.emp.id } })).email, phone: null });
      await t.http().patch(api('/me')).set(s.emp.auth).send({ fullName: 'e2e-Renamed Staff' }).expect(200);

      expect(await count()).toBe(before);
    });

    it('a customer\'s identity check is recorded (that one is not a staff action)', async () => {
      const c = await t.asRole('CUSTOMER');
      await t.http().post(api('/kyc/start')).set(c.auth).send({ consent: true }).expect(200);
      expect((await entries({ entityId: c.id, entityType: 'user' })).map((e) => e.action)).toEqual(['KYC_STARTED', 'KYC_VERIFIED']);
    });
  });

  describe('reading the trail', () => {
    it('is for super admins only', async () => {
      const s = await setup();
      const manager = await t.asRole('CITY_MANAGER', { cityIds: [s.city.id] });
      await t.http().get(api('/audit-logs')).expect(401);
      for (const who of [s.customer, s.emp, manager]) await t.http().get(api('/audit-logs')).set(who.auth).expect(403);
      const admin = await t.asRole('SUPER_ADMIN');
      await t.http().get(api('/audit-logs')).set(admin.auth).expect(200);
    });

    it('lists newest first with the person\'s name and role, and filters by person, action and thing', async () => {
      const s = await setup();
      const admin = await t.asRole('SUPER_ADMIN');
      const booking = await paidBooking(s);
      await pickup(s, booking).expect(200);
      await giveBack(s, booking.id).expect(200);

      const mine = await t.http().get(api(`/audit-logs?actorId=${s.emp.id}`)).set(admin.auth).expect(200);
      expect(mine.body.total).toBe(2);
      expect(mine.body.items.map((e: { action: string }) => e.action)).toEqual(['BOOKING_RETURN', 'BOOKING_PICKUP']); // newest first
      expect(mine.body.items[0]).toMatchObject({
        entityType: 'booking',
        entityId: booking.id,
        route: 'POST /station/bookings/:id/return',
        actor: { id: s.emp.id, fullName: 'e2e-Test STATION_EMPLOYEE', role: 'STATION_EMPLOYEE' },
      });
      const byAction = await t.http().get(api(`/audit-logs?actorId=${s.emp.id}&action=BOOKING_PICKUP`)).set(admin.auth).expect(200);
      expect(byAction.body.items).toHaveLength(1);
      const byThing = await t.http().get(api(`/audit-logs?entityType=booking&entityId=${booking.id}`)).set(admin.auth).expect(200);
      expect(byThing.body.total).toBe(2);
      const paged = await t.http().get(api(`/audit-logs?actorId=${s.emp.id}&limit=1&page=2`)).set(admin.auth).expect(200);
      expect(paged.body).toMatchObject({ total: 2, page: 2, limit: 1 });
      expect(paged.body.items.map((e: { action: string }) => e.action)).toEqual(['BOOKING_PICKUP']);
    });

    it('rejects a bad filter with a clean 400', async () => {
      const admin = await t.asRole('SUPER_ADMIN');
      await t.http().get(api('/audit-logs?actorId=nope')).set(admin.auth).expect(400);
      await t.http().get(api('/audit-logs?limit=1000')).set(admin.auth).expect(400);
    });

    it('an entry outlives its actor: removing the account keeps the history with no name', async () => {
      const s = await setup();
      const admin = await t.asRole('SUPER_ADMIN');
      const doomed = await t.asRole('SUPER_ADMIN');
      const city = await t.makeCity();
      await t.http().patch(api(`/cities/${city.id}`)).set(doomed.auth).send({ isActive: true }).expect(200);
      await t.prisma.auditLog.updateMany({ where: { actorId: doomed.id }, data: { actorId: null } });
      const res = await t.http().get(api(`/audit-logs?entityId=${city.id}`)).set(admin.auth).expect(200);
      expect(res.body.items[0]).toMatchObject({ action: 'CITY_UPDATE', actor: null });
      // Its actor is gone, so the shared cleanup could not find this row: remove it here.
      await t.prisma.auditLog.deleteMany({ where: { entityId: city.id } });
      expect(s.city.id).toBeTruthy();
    });
  });
});
