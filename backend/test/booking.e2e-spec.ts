import { createTestApp, type Auth, type TestApp } from './helpers.js';

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('Booking: KYC, pricing, holds, payment and cancellation (e2e)', () => {
  let t: TestApp;
  let admin: Auth;

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await t.asRole('SUPER_ADMIN')).auth;
  });
  afterAll(() => t.cleanup());

  const quote = (body: Record<string, unknown>) => t.http().post('/api/v1/bookings/quote').send(body);
  const book = (auth: Auth, body: Record<string, unknown>) => t.http().post('/api/v1/bookings').set(auth).send(body);
  const pay = (auth: Auth, id: string, body: Record<string, unknown> = {}, key?: string) =>
    t
      .http()
      .post(`/api/v1/bookings/${id}/pay`)
      .set({ ...auth, ...(key && { 'Idempotency-Key': key }) })
      .send(body);
  const cancel = (auth: Auth, id: string) => t.http().post(`/api/v1/bookings/${id}/cancel`).set(auth);
  const bookAndPay = async (auth: Auth, vehicleId: string, extra: Record<string, unknown> = {}) => {
    const created = await book(auth, { vehicleId, hours: 2, ...extra }).expect(201);
    const paid = await pay(auth, created.body.id).expect(200);
    return paid.body as { id: string; code: string; pin: string };
  };

  describe('KYC (mock)', () => {
    it('starts as not started, then verifies once the customer agrees', async () => {
      const customer = await t.asRole('CUSTOMER');
      const before = await t.http().get('/api/v1/kyc/status').set(customer.auth).expect(200);
      expect(before.body.status).toBe('NOT_STARTED');

      const refused = await t.http().post('/api/v1/kyc/start').set(customer.auth).send({ consent: false }).expect(400);
      expect(refused.body.code).toBe('CONSENT_REQUIRED');

      const started = await t.http().post('/api/v1/kyc/start').set(customer.auth).send({ consent: true }).expect(200);
      expect(started.body.status).toBe('VERIFIED');
      expect(started.body.verifiedAt).toBeTruthy();

      // Starting again is harmless.
      await t.http().post('/api/v1/kyc/start').set(customer.auth).send({ consent: true }).expect(200);
      const record = await t.prisma.kycRecord.findUnique({ where: { userId: customer.id } });
      expect(record?.provider).toBe('mock');
    });

    it('is for customers only and needs a sign-in', async () => {
      const employee = await t.asRole('STATION_EMPLOYEE');
      await t.http().get('/api/v1/kyc/status').expect(401);
      await t.http().get('/api/v1/kyc/status').set(employee.auth).expect(403);
    });
  });

  describe('pricing plans', () => {
    it('lets staff read plans but only super admins change them', async () => {
      const model = await t.makeModel();
      const manager = await t.asRole('CITY_MANAGER');
      const body = {
        modelId: model.id,
        hourlyRateAmount: 4900,
        dailyRateAmount: 29900,
        includedKmPerHour: 12,
        extraKmRateAmount: 600,
        lateFeePerHourAmount: 9900,
        depositAmount: 100000,
      };
      await t.http().post('/api/v1/pricing-plans').set(manager.auth).send(body).expect(403);
      const created = await t.http().post('/api/v1/pricing-plans').set(admin).send(body).expect(201);
      expect(created.body).toMatchObject({ modelId: model.id, cityId: null, graceMinutes: 15, isActive: true });

      const list = await t.http().get(`/api/v1/manage/pricing-plans?modelId=${model.id}`).set(manager.auth).expect(200);
      expect(list.body.items).toHaveLength(1);

      const edited = await t
        .http()
        .patch(`/api/v1/pricing-plans/${created.body.id}`)
        .set(admin)
        .send({ hourlyRateAmount: 5500, dailyRateAmount: null })
        .expect(200);
      expect(edited.body).toMatchObject({ hourlyRateAmount: 5500, dailyRateAmount: null });
      await t.http().patch(`/api/v1/pricing-plans/${created.body.id}`).set(manager.auth).send({}).expect(403);
    });

    it('allows one default plan and one plan per city for a model, and rejects silly day rates', async () => {
      const model = await t.makeModel();
      const city = await t.makeCity();
      const body = {
        modelId: model.id,
        hourlyRateAmount: 1000,
        includedKmPerHour: 10,
        extraKmRateAmount: 100,
        lateFeePerHourAmount: 100,
        depositAmount: 0,
      };
      await t.http().post('/api/v1/pricing-plans').set(admin).send(body).expect(201);
      const dup = await t.http().post('/api/v1/pricing-plans').set(admin).send(body).expect(409);
      expect(dup.body.code).toBe('PLAN_EXISTS');
      await t.http().post('/api/v1/pricing-plans').set(admin).send({ ...body, cityId: city.id }).expect(201);
      const dup2 = await t.http().post('/api/v1/pricing-plans').set(admin).send({ ...body, cityId: city.id }).expect(409);
      expect(dup2.body.code).toBe('PLAN_EXISTS');

      const silly = await t.http().post('/api/v1/pricing-plans').set(admin).send({ ...body, modelId: (await t.makeModel()).id, dailyRateAmount: 25000 }).expect(400);
      expect(silly.body.code).toBe('INVALID_DAY_RATE');
      await t.http().post('/api/v1/pricing-plans').set(admin).send({ ...body, hourlyRateAmount: 0 }).expect(400);
    });

    it('prices a city with its own plan differently from the default', async () => {
      const setup = await t.makeBookable();
      await t.makePlan(setup.modelId, { cityId: setup.cityId, hourly: 9000, daily: null, deposit: 50000 });
      const res = await quote({ vehicleId: setup.vehicleIds[0], hours: 2 }).expect(200);
      expect(res.body).toMatchObject({ rentalAmount: 18000, depositAmount: 50000, totalAmount: 68000 });
    });
  });

  describe('quote (public)', () => {
    it('shows rental, a separate deposit and the total, without signing in', async () => {
      const setup = await t.makeBookable();
      const res = await quote({ vehicleId: setup.vehicleIds[0], hours: 3 }).expect(200);
      expect(res.body).toMatchObject({
        hours: 3,
        rentalAmount: 15000,
        depositAmount: 100000,
        totalAmount: 115000,
        includedKm: 36,
        holdMinutes: 10,
      });
      expect(res.body.station.id).toBe(setup.stationId);
      expect(res.body.pricing.hourlyRateAmount).toBe(5000);
      expect(res.body.vehicle.registrationNumber).toBeUndefined();
    });

    it('caps a long rental at the day rate', async () => {
      const setup = await t.makeBookable();
      expect((await quote({ vehicleId: setup.vehicleIds[0], hours: 24 }).expect(200)).body.rentalAmount).toBe(30000);
    });

    it('rejects bad input with clear codes', async () => {
      const setup = await t.makeBookable();
      const vehicleId = setup.vehicleIds[0];
      await quote({ vehicleId, hours: 0 }).expect(400);
      await quote({ vehicleId, hours: 25 }).expect(400);
      await quote({ vehicleId }).expect(400);
      await quote({ vehicleId: 'nope', hours: 1 }).expect(400);
      expect((await quote({ vehicleId, hours: 1, startAt: iso(Date.now() - HOUR) }).expect(400)).body.code).toBe('START_IN_PAST');
      expect((await quote({ vehicleId, hours: 1, startAt: iso(Date.now() + 8 * 24 * HOUR) }).expect(400)).body.code).toBe('START_TOO_FAR');
      expect((await quote({ vehicleId: '00000000-0000-4000-8000-000000000000', hours: 1 }).expect(404)).body.code).toBe('VEHICLE_NOT_FOUND');
    });

    it('refuses scooters that cannot be rented', async () => {
      const setup = await t.makeBookable();
      const maintenance = await t.makeVehicle(setup.stationId, setup.modelId, { status: 'MAINTENANCE' });
      expect((await quote({ vehicleId: maintenance.id, hours: 1 }).expect(409)).body.code).toBe('VEHICLE_NOT_AVAILABLE');

      const noPlanModel = await t.makeModel();
      const noPlan = await t.makeVehicle(setup.stationId, noPlanModel.id);
      expect((await quote({ vehicleId: noPlan.id, hours: 1 }).expect(409)).body.code).toBe('NO_PRICING_PLAN');

      const closed = await t.makeStation(setup.cityId, { status: 'INACTIVE' });
      const atClosed = await t.makeVehicle(closed.id, setup.modelId);
      await quote({ vehicleId: atClosed.id, hours: 1 }).expect(404);
    });

    it('refuses a start time when the station is closed', async () => {
      const localHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
      const pad = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
      const setup = await t.makeBookable({ hours: { opensAt: pad(localHour + 2), closesAt: pad(localHour + 3) } });
      const res = await quote({ vehicleId: setup.vehicleIds[0], hours: 1 }).expect(409);
      expect(res.body.code).toBe('STATION_CLOSED');
      // The same scooter is fine once the start falls inside opening hours (2.5 hours from now).
      await quote({ vehicleId: setup.vehicleIds[0], hours: 1, startAt: iso(Date.now() + 2.5 * HOUR) }).expect(200);
    });
  });

  describe('creating a booking', () => {
    it('needs a signed-in customer with a verified identity', async () => {
      const setup = await t.makeBookable();
      const body = { vehicleId: setup.vehicleIds[0], hours: 1 };
      await t.http().post('/api/v1/bookings').send(body).expect(401);
      const employee = await t.asRole('STATION_EMPLOYEE');
      await book(employee.auth, body).expect(403);

      const unverified = await t.asRole('CUSTOMER');
      const res = await book(unverified.auth, body).expect(403);
      expect(res.body.code).toBe('KYC_REQUIRED');
    });

    it('holds the scooter for ten minutes with the agreed price, code and no PIN yet', async () => {
      const setup = await t.makeBookable();
      const customer = await t.verifiedCustomer();
      const res = await book(customer.auth, { vehicleId: setup.vehicleIds[0], hours: 3 }).expect(201);
      expect(res.body).toMatchObject({
        status: 'PENDING_PAYMENT',
        hours: 3,
        rentalAmount: 15000,
        depositAmount: 100000,
        totalAmount: 115000,
        pin: null,
        payment: null,
      });
      expect(res.body.code).toMatch(/^RV-[A-HJ-NP-Z2-9]{6}$/);
      expect(res.body.station.id).toBe(setup.stationId);
      expect(res.body.cancellation).toEqual({ allowed: true, refundAmount: 0, retainedAmount: 0 });
      const hold = new Date(res.body.holdExpiresAt).getTime() - Date.now();
      expect(hold).toBeGreaterThan(9 * 60_000);
      expect(hold).toBeLessThanOrEqual(10 * 60_000);
    });

    it('keeps the agreed price when the plan changes afterwards', async () => {
      const setup = await t.makeBookable();
      const customer = await t.verifiedCustomer();
      const created = await book(customer.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);
      await t.prisma.pricingPlan.updateMany({ where: { modelId: setup.modelId }, data: { hourlyRateAmount: 99999, depositAmount: 1 } });
      const again = await t.http().get(`/api/v1/bookings/${created.body.id}`).set(customer.auth).expect(200);
      expect(again.body).toMatchObject({ rentalAmount: 5000, depositAmount: 100000, totalAmount: 105000 });
      expect(again.body.pricing.hourlyRateAmount).toBe(5000);
    });

    it('stops a second customer from booking the same scooter for an overlapping time', async () => {
      const setup = await t.makeBookable();
      const [a, b] = [await t.verifiedCustomer(), await t.verifiedCustomer()];
      const vehicleId = setup.vehicleIds[0];
      const start = Date.now() + 3 * HOUR;
      await book(a.auth, { vehicleId, hours: 2, startAt: iso(start) }).expect(201);

      for (const startAt of [start, start + HOUR, start - HOUR]) {
        const res = await book(b.auth, { vehicleId, hours: 2, startAt: iso(startAt) }).expect(409);
        expect(res.body.code).toBe('VEHICLE_NOT_AVAILABLE');
      }
      // Right before and right after are fine: the windows only touch.
      await book(b.auth, { vehicleId, hours: 3, startAt: iso(start - 3 * HOUR + 60_000) }).expect(409);
      await book(b.auth, { vehicleId, hours: 2, startAt: iso(start + 2 * HOUR) }).expect(201);
      await book(b.auth, { vehicleId, hours: 1, startAt: iso(start - HOUR) }).expect(201);
    });

    it('lets only one of many simultaneous attempts win', async () => {
      const setup = await t.makeBookable();
      const customers = await Promise.all(Array.from({ length: 6 }, () => t.verifiedCustomer()));
      const results = await Promise.all(
        customers.map((c) => book(c.auth, { vehicleId: setup.vehicleIds[0], hours: 1 })),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      for (const r of results.filter((r) => r.status !== 201)) {
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('VEHICLE_NOT_AVAILABLE');
      }
      const count = await t.prisma.booking.count({ where: { vehicleId: setup.vehicleIds[0] } });
      expect(count).toBe(1);
    });

    it('frees the scooter when the payment hold runs out', async () => {
      const setup = await t.makeBookable();
      const [a, b] = [await t.verifiedCustomer(), await t.verifiedCustomer()];
      const first = await book(a.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);
      await book(b.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(409);

      await t.prisma.booking.update({ where: { id: first.body.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
      // Held-out scooters are free again for everyone...
      const listed = await t.http().get(`/api/v1/stations/${setup.stationId}/vehicles`).expect(200);
      expect(listed.body.map((v: { id: string }) => v.id)).toContain(setup.vehicleIds[0]);
      await book(b.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);

      // ...and the first customer sees their booking as expired and cannot pay it.
      const mine = await t.http().get(`/api/v1/bookings/${first.body.id}`).set(a.auth).expect(200);
      expect(mine.body.status).toBe('EXPIRED');
      const late = await pay(a.auth, first.body.id).expect(409);
      expect(late.body.code).toBe('HOLD_EXPIRED');
    });

    it('does not let one customer hold two scooters for the same time, or too many bookings', async () => {
      const setup = await t.makeBookable({ vehicles: 2 });
      const customer = await t.verifiedCustomer();
      await book(customer.auth, { vehicleId: setup.vehicleIds[0], hours: 2 }).expect(201);
      const clash = await book(customer.auth, { vehicleId: setup.vehicleIds[1], hours: 1 }).expect(409);
      expect(clash.body.code).toBe('OVERLAPPING_BOOKING');

      // Four more on separate days reaches the limit of five open bookings.
      for (let day = 1; day <= 4; day++) {
        await book(customer.auth, { vehicleId: setup.vehicleIds[1], hours: 1, startAt: iso(Date.now() + day * 25 * HOUR) }).expect(201);
      }
      const many = await book(customer.auth, { vehicleId: setup.vehicleIds[1], hours: 1, startAt: iso(Date.now() + 6 * 24 * HOUR) }).expect(409);
      expect(many.body.code).toBe('TOO_MANY_BOOKINGS');
    });

    it('is enforced by the database too, not only by the service', async () => {
      const setup = await t.makeBookable();
      const customer = await t.verifiedCustomer();
      const created = await book(customer.auth, { vehicleId: setup.vehicleIds[0], hours: 2 }).expect(201);
      const existing = await t.prisma.booking.findUniqueOrThrow({ where: { id: created.body.id } });
      await expect(
        t.prisma.booking.create({
          data: {
            code: 'RV-DBTEST',
            userId: customer.id,
            vehicleId: existing.vehicleId,
            stationId: existing.stationId,
            startAt: new Date(existing.startAt.getTime() + 30 * 60_000),
            endAt: new Date(existing.endAt.getTime() + 30 * 60_000),
            hours: 2,
            rentalAmount: 1,
            depositAmount: 1,
            totalAmount: 2,
            pricingSnapshot: {},
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('paying (mock)', () => {
    it('confirms the booking, records the payment and reveals the PIN', async () => {
      const setup = await t.makeBookable();
      const customer = await t.verifiedCustomer();
      const created = await book(customer.auth, { vehicleId: setup.vehicleIds[0], hours: 2 }).expect(201);
      const paid = await pay(customer.auth, created.body.id).expect(200);
      expect(paid.body).toMatchObject({ status: 'CONFIRMED', holdExpiresAt: null, totalAmount: 110000 });
      expect(paid.body.pin).toMatch(/^\d{6}$/);
      expect(paid.body.payment).toMatchObject({ status: 'SUCCEEDED', chargeAmount: 110000 });

      // The PIN is the same every time the booking is read.
      const again = await t.http().get(`/api/v1/bookings/${created.body.id}`).set(customer.auth).expect(200);
      expect(again.body.pin).toBe(paid.body.pin);

      const payments = await t.prisma.payment.findMany({ where: { bookingId: created.body.id } });
      expect(payments).toHaveLength(1);
      expect(payments[0]).toMatchObject({ provider: 'mock', purpose: 'RENTAL_AND_DEPOSIT', status: 'SUCCEEDED' });
    });

    it('never charges twice: replays return the same result, and a paid booking cannot be paid again', async () => {
      const setup = await t.makeBookable();
      const customer = await t.verifiedCustomer();
      const created = await book(customer.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);
      const key = 'idem-key-booking-1';
      await pay(customer.auth, created.body.id, {}, key).expect(200);
      const replay = await pay(customer.auth, created.body.id, {}, key).expect(200);
      expect(replay.body.status).toBe('CONFIRMED');
      const again = await pay(customer.auth, created.body.id, {}, 'idem-key-booking-2').expect(409);
      expect(again.body.code).toBe('ALREADY_PAID');
      expect(await t.prisma.payment.count({ where: { bookingId: created.body.id } })).toBe(1);

      // The key belongs to one booking only.
      const other = await t.makeBookable();
      const second = await book(customer.auth, { vehicleId: other.vehicleIds[0], hours: 1, startAt: iso(Date.now() + 5 * HOUR) }).expect(201);
      const reuse = await pay(customer.auth, second.body.id, {}, key).expect(409);
      expect(reuse.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      await t.http().post(`/api/v1/bookings/${second.body.id}/pay`).set({ ...customer.auth, 'Idempotency-Key': 'x' }).send({}).expect(400);
    });

    it('charges once even when the pay button is tapped many times at once', async () => {
      const setup = await t.makeBookable();
      const customer = await t.verifiedCustomer();
      const created = await book(customer.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);
      const results = await Promise.all(Array.from({ length: 5 }, () => pay(customer.auth, created.body.id)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await t.prisma.payment.count({ where: { bookingId: created.body.id, status: 'SUCCEEDED' } })).toBe(1);
    });

    it('keeps the hold after a failed payment so the customer can try again', async () => {
      const setup = await t.makeBookable();
      const customer = await t.verifiedCustomer();
      const created = await book(customer.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);
      const failed = await pay(customer.auth, created.body.id, { simulate: 'FAIL' }).expect(402);
      expect(failed.body.code).toBe('PAYMENT_FAILED');

      const still = await t.http().get(`/api/v1/bookings/${created.body.id}`).set(customer.auth).expect(200);
      expect(still.body.status).toBe('PENDING_PAYMENT');
      expect(still.body.payment.status).toBe('FAILED');

      const ok = await pay(customer.auth, created.body.id).expect(200);
      expect(ok.body.status).toBe('CONFIRMED');
      expect(ok.body.payment.status).toBe('SUCCEEDED');
    });

    it('only works on your own booking and rejects unknown options', async () => {
      const setup = await t.makeBookable();
      const owner = await t.verifiedCustomer();
      const stranger = await t.verifiedCustomer();
      const created = await book(owner.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);
      await pay(stranger.auth, created.body.id).expect(404);
      await t.http().get(`/api/v1/bookings/${created.body.id}`).set(stranger.auth).expect(404);
      await cancel(stranger.auth, created.body.id).expect(404);
      await pay(owner.auth, created.body.id, { simulate: 'NOPE' }).expect(400);
      await pay(owner.auth, created.body.id, { amount: 1 }).expect(400);
    });
  });

  describe('my bookings', () => {
    it('sorts bookings into active, upcoming and past', async () => {
      const setup = await t.makeBookable({ vehicles: 3 });
      const customer = await t.verifiedCustomer();
      const pending = await book(customer.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);
      const upcoming = await bookAndPay(customer.auth, setup.vehicleIds[1], { startAt: iso(Date.now() + 5 * HOUR) });
      const cancelled = await bookAndPay(customer.auth, setup.vehicleIds[2], { startAt: iso(Date.now() + 30 * HOUR) });
      await cancel(customer.auth, cancelled.id).expect(200);

      const ids = async (tab: string) =>
        (await t.http().get(`/api/v1/bookings?tab=${tab}`).set(customer.auth).expect(200)).body.items.map((b: { id: string }) => b.id);
      expect(await ids('active')).toEqual([pending.body.id]);
      expect(await ids('upcoming')).toEqual([upcoming.id]);
      expect(await ids('past')).toEqual([cancelled.id]);

      const all = await t.http().get('/api/v1/bookings').set(customer.auth).expect(200);
      expect(all.body.total).toBe(3);
      await t.http().get('/api/v1/bookings?tab=bogus').set(customer.auth).expect(400);
    });

    it('shows a customer only their own bookings', async () => {
      const setup = await t.makeBookable();
      const owner = await t.verifiedCustomer();
      const other = await t.verifiedCustomer();
      await book(owner.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);
      expect((await t.http().get('/api/v1/bookings').set(other.auth).expect(200)).body.total).toBe(0);
      await t.http().get('/api/v1/bookings').expect(401);
    });
  });

  describe('cancelling', () => {
    it('releases a held scooter without any money moving', async () => {
      const setup = await t.makeBookable();
      const [a, b] = [await t.verifiedCustomer(), await t.verifiedCustomer()];
      const created = await book(a.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);
      const res = await cancel(a.auth, created.body.id).expect(200);
      expect(res.body).toMatchObject({ status: 'CANCELLED', refundedAmount: 0 });
      expect(res.body.cancelledAt).toBeTruthy();
      await book(b.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);
    });

    it('refunds everything when cancelling well before the start', async () => {
      const setup = await t.makeBookable();
      const customer = await t.verifiedCustomer();
      const paid = await bookAndPay(customer.auth, setup.vehicleIds[0], { startAt: iso(Date.now() + 5 * HOUR) });
      await t.prisma.booking.update({ where: { id: paid.id }, data: { confirmedAt: new Date(Date.now() - HOUR) } });

      const view = await t.http().get(`/api/v1/bookings/${paid.id}`).set(customer.auth).expect(200);
      expect(view.body.cancellation).toEqual({ allowed: true, refundAmount: 110000, retainedAmount: 0 });
      const res = await cancel(customer.auth, paid.id).expect(200);
      expect(res.body).toMatchObject({ status: 'CANCELLED', refundedAmount: 110000, pin: null });

      const refunds = await t.prisma.refund.findMany({ where: { payment: { bookingId: paid.id } } });
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({ refundAmount: 110000, status: 'SUCCEEDED', reason: 'CANCELLATION' });
    });

    it('keeps the rental but returns the deposit when cancelling late', async () => {
      const setup = await t.makeBookable();
      const customer = await t.verifiedCustomer();
      const paid = await bookAndPay(customer.auth, setup.vehicleIds[0], { startAt: iso(Date.now() + 30 * 60_000) });
      await t.prisma.booking.update({ where: { id: paid.id }, data: { confirmedAt: new Date(Date.now() - HOUR) } });

      const res = await cancel(customer.auth, paid.id).expect(200);
      expect(res.body.refundedAmount).toBe(100000);
      expect(res.body.totalAmount - res.body.refundedAmount).toBe(res.body.rentalAmount);
    });

    it('refunds everything for a ride starting now if cancelled within ten minutes of paying', async () => {
      const setup = await t.makeBookable();
      const customer = await t.verifiedCustomer();
      const paid = await bookAndPay(customer.auth, setup.vehicleIds[0]);
      const res = await cancel(customer.auth, paid.id).expect(200);
      expect(res.body.refundedAmount).toBe(110000);
    });

    it('cannot be cancelled twice, and the scooter is bookable again afterwards', async () => {
      const setup = await t.makeBookable();
      const [a, b] = [await t.verifiedCustomer(), await t.verifiedCustomer()];
      const paid = await bookAndPay(a.auth, setup.vehicleIds[0]);
      await book(b.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(409);

      const results = await Promise.all([cancel(a.auth, paid.id), cancel(a.auth, paid.id)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await t.prisma.refund.count({ where: { payment: { bookingId: paid.id } } })).toBe(1);
      expect((await cancel(a.auth, paid.id).expect(409)).body.code).toBe('CANNOT_CANCEL');
      await book(b.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);
    });

    it('cannot cancel once the booked time is over', async () => {
      const setup = await t.makeBookable();
      const customer = await t.verifiedCustomer();
      const paid = await bookAndPay(customer.auth, setup.vehicleIds[0]);
      await t.prisma.booking.update({
        where: { id: paid.id },
        data: { startAt: new Date(Date.now() - 4 * HOUR), endAt: new Date(Date.now() - 2 * HOUR) },
      });
      expect((await cancel(customer.auth, paid.id).expect(409)).body.code).toBe('CANNOT_CANCEL');
    });
  });

  describe('browsing with bookings in the picture', () => {
    it('hides booked scooters for the window and shows prices', async () => {
      const setup = await t.makeBookable({ vehicles: 2 });
      const customer = await t.verifiedCustomer();
      const start = Date.now() + 3 * HOUR;
      await book(customer.auth, { vehicleId: setup.vehicleIds[0], hours: 2, startAt: iso(start) }).expect(201);

      const ids = async (qs: string) =>
        (await t.http().get(`/api/v1/stations/${setup.stationId}/vehicles${qs}`).expect(200)).body.map((v: { id: string }) => v.id);
      // Now: both are free. During the booking: only the other one. After it: both again.
      expect(await ids('')).toHaveLength(2);
      expect(await ids(`?startAt=${encodeURIComponent(iso(start + 30 * 60_000))}&hours=1`)).toEqual([setup.vehicleIds[1]]);
      expect(await ids(`?startAt=${encodeURIComponent(iso(start + 2 * HOUR))}&hours=1`)).toHaveLength(2);

      const listed = await t.http().get(`/api/v1/stations/${setup.stationId}/vehicles`).expect(200);
      expect(listed.body[0].pricing).toMatchObject({ hourlyRateAmount: 5000, dailyRateAmount: 30000, depositAmount: 100000 });
      await t.http().get(`/api/v1/stations/${setup.stationId}/vehicles?hours=99`).expect(400);
    });

    it('counts held and booked scooters out of the station availability', async () => {
      const setup = await t.makeBookable({ vehicles: 2 });
      const customer = await t.verifiedCustomer();
      const count = async () => (await t.http().get(`/api/v1/stations/${setup.stationId}`).expect(200)).body.availableVehicles;
      expect(await count()).toBe(2);
      await book(customer.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);
      expect(await count()).toBe(1);
    });

    it('shows one scooter with its station and price, even while it is booked', async () => {
      const setup = await t.makeBookable();
      const customer = await t.verifiedCustomer();
      await book(customer.auth, { vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);

      const res = await t.http().get(`/api/v1/vehicles/${setup.vehicleIds[0]}`).expect(200);
      expect(res.body.vehicle).toMatchObject({ id: setup.vehicleIds[0], pricing: { hourlyRateAmount: 5000 } });
      expect(res.body.vehicle.registrationNumber).toBeUndefined();
      expect(res.body.station).toMatchObject({ id: setup.stationId, timezone: 'Asia/Kolkata' });

      const retired = await t.makeVehicle(setup.stationId, setup.modelId);
      await t.prisma.vehicle.update({ where: { id: retired.id }, data: { retiredAt: new Date() } });
      await t.http().get(`/api/v1/vehicles/${retired.id}`).expect(404);
      await t.http().get('/api/v1/vehicles/nope').expect(400);
    });

    it('lists a scooter without a price but marks it as such', async () => {
      const setup = await t.makeBookable();
      const noPlan = await t.makeVehicle(setup.stationId, (await t.makeModel()).id);
      const listed = await t.http().get(`/api/v1/stations/${setup.stationId}/vehicles`).expect(200);
      expect(listed.body.find((v: { id: string }) => v.id === noPlan.id).pricing).toBeNull();
    });
  });

  describe('staff changes to booked scooters', () => {
    it('blocks maintenance, moves and retirement while a customer holds a booking', async () => {
      const setup = await t.makeBookable();
      const other = await t.makeStation(setup.cityId);
      const customer = await t.verifiedCustomer();
      const vehicleId = setup.vehicleIds[0];
      await bookAndPay(customer.auth, vehicleId, { startAt: iso(Date.now() + 5 * HOUR) });

      const maintenance = await t.http().patch(`/api/v1/vehicles/${vehicleId}/status`).set(admin).send({ status: 'MAINTENANCE' }).expect(409);
      expect(maintenance.body.code).toBe('VEHICLE_BOOKED');
      expect((await t.http().patch(`/api/v1/vehicles/${vehicleId}`).set(admin).send({ stationId: other.id }).expect(409)).body.code).toBe('VEHICLE_BOOKED');
      expect((await t.http().delete(`/api/v1/vehicles/${vehicleId}`).set(admin).expect(409)).body.code).toBe('VEHICLE_BOOKED');
      // Editing harmless details is still fine.
      await t.http().patch(`/api/v1/vehicles/${vehicleId}`).set(admin).send({ batteryPercent: 50 }).expect(200);
    });
  });
});
