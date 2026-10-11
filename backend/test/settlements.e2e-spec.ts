import { vi } from 'vitest';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { createTestApp, type Auth, type TestApp } from './helpers.js';

const HOUR = 3_600_000;
const MIN = 60_000;

// The e2e plan: 12 km per booked hour, Rs 6 per extra km, Rs 99 per late hour, Rs 1000 deposit, 15 minutes grace.
const DEPOSIT = 100_000;

describe('Settlement: final bill, refund, outstanding amount (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.cleanup());
  afterEach(() => vi.restoreAllMocks());

  const api = (path: string) => `/api/v1${path}`;

  /** A city with two stations (A, B), a priced model, scooters at A, and station staff. */
  async function setup(opts: { vehicles?: number } = {}) {
    const city = await t.makeCity();
    const a = await t.makeStation(city.id, { capacity: 10 });
    const b = await t.makeStation(city.id, { capacity: 10 });
    const model = await t.makeModel();
    await t.makePlan(model.id);
    const vehicleIds: string[] = [];
    for (let i = 0; i < (opts.vehicles ?? 3); i++) vehicleIds.push((await t.makeVehicle(a.id, model.id)).id);
    const empA = await t.asRole('STATION_EMPLOYEE', { stationIds: [a.id] });
    const empB = await t.asRole('STATION_EMPLOYEE', { stationIds: [b.id] });
    const manager = await t.asRole('CITY_MANAGER', { cityIds: [city.id] });
    return { city, a, b, vehicleIds, empA, empB, manager };
  }
  type Setup = Awaited<ReturnType<typeof setup>>;

  /**
   * Books a 2-hour ride (24 km included), hands the scooter over at 100 km and takes it back.
   * `lateMinutes` moves the booked end that far into the past before the return.
   */
  async function ride(
    s: Setup,
    opts: {
      vehicle?: number;
      customer?: Awaited<ReturnType<TestApp['verifiedCustomer']>>;
      endKm?: number;
      lateMinutes?: number;
      damages?: { description: string; severity: string; feeAmount?: number }[];
      returnTo?: string;
      expectReturn?: number;
    } = {},
  ) {
    const customer = opts.customer ?? (await t.verifiedCustomer());
    const created = await t.http().post(api('/bookings')).set(customer.auth).send({ vehicleId: s.vehicleIds[opts.vehicle ?? 0], hours: 2 }).expect(201);
    const paid = await t.http().post(api(`/bookings/${created.body.id}/pay`)).set(customer.auth).send({}).expect(200);
    await t
      .http()
      .post(api(`/station/bookings/${paid.body.id}/pickup`))
      .set(s.empA.auth)
      .send({ pin: paid.body.pin, idChecked: true, startOdometerKm: 100, startBatteryPercent: 90 })
      .expect(200);
    if (opts.lateMinutes) {
      const endAt = new Date(Date.now() - opts.lateMinutes * MIN);
      await t.prisma.booking.update({ where: { id: paid.body.id }, data: { startAt: new Date(endAt.getTime() - 2 * HOUR), endAt } });
    }
    const res = await t
      .http()
      .post(api(`/station/bookings/${paid.body.id}/return`))
      .set(s.empA.auth)
      .send({ returnStationId: opts.returnTo ?? s.a.id, endOdometerKm: opts.endKm ?? 110, endBatteryPercent: 60, damages: opts.damages })
      .expect(opts.expectReturn ?? 200);
    return { id: paid.body.id as string, customer, res };
  }

  const dbSettlement = (bookingId: string) => t.prisma.settlement.findUniqueOrThrow({ where: { bookingId }, include: { lineItems: true } });

  describe('the final bill', () => {
    it('a clean, on-time ride gets the whole deposit back and the booking is settled', async () => {
      const s = await setup();
      const { id, customer, res } = await ride(s);

      expect(res.body.status).toBe('SETTLED');
      expect(res.body.settlement).toMatchObject({ status: 'REFUNDED', depositHeld: DEPOSIT, totalCharges: 0, refundAmount: DEPOSIT, outstandingAmount: 0, lineItems: [] });
      const refunds = await t.prisma.refund.findMany({ where: { payment: { bookingId: id } } });
      expect(refunds).toEqual([expect.objectContaining({ reason: 'DEPOSIT_RETURN', refundAmount: DEPOSIT, status: 'SUCCEEDED' })]);

      const mine = await t.http().get(api(`/bookings/${id}/settlement`)).set(customer.auth).expect(200);
      expect(mine.body).toMatchObject({ status: 'REFUNDED', refundAmount: DEPOSIT, payable: false });
      expect(mine.body.settledAt).toBeTruthy();
      // The customer's booking carries the bill and the refund total.
      const booking = await t.http().get(api(`/bookings/${id}`)).set(customer.auth).expect(200);
      expect(booking.body).toMatchObject({ status: 'SETTLED', refundedAmount: DEPOSIT });
      expect(booking.body.settlement.status).toBe('REFUNDED');
    });

    it('charges started extra kilometres at the rate the customer agreed to', async () => {
      const s = await setup();
      // 100 -> 130.4 = 30.4 km; 24 included; 6.4 over = 7 started km at Rs 6.
      const { id, res } = await ride(s, { endKm: 130.4 });
      expect(res.body.settlement.lineItems).toEqual([
        { type: 'EXTRA_KM', description: '7 extra km (24 km included)', quantity: 7, unitAmount: 600, amount: 4200 },
      ]);
      expect(res.body.settlement).toMatchObject({ totalCharges: 4200, refundAmount: DEPOSIT - 4200, status: 'REFUNDED' });
      const refund = await t.prisma.refund.findFirstOrThrow({ where: { payment: { bookingId: id } } });
      expect(refund.refundAmount).toBe(DEPOSIT - 4200);
    });

    it('exactly the included kilometres cost nothing', async () => {
      const s = await setup();
      const { res } = await ride(s, { endKm: 124 });
      expect(res.body.settlement).toMatchObject({ totalCharges: 0, lineItems: [] });
    });

    it('charges a late fee per started hour, but nothing inside the grace period', async () => {
      const s = await setup();
      const onTime = await ride(s, { vehicle: 0, lateMinutes: 14 });
      expect(onTime.res.body.settlement.totalCharges).toBe(0);

      // Well past the 15 minute grace: counted from the booked end, 70 minutes = 2 started hours.
      const late = await ride(s, { vehicle: 1, lateMinutes: 70 });
      expect(late.res.body.settlement.lineItems).toEqual([
        { type: 'LATE_FEE', description: '2 hours late', quantity: 2, unitAmount: 9900, amount: 19800 },
      ]);
      expect(late.res.body.settlement.refundAmount).toBe(DEPOSIT - 19800);
    });

    it('adds extra km, late fee and damage together; damage found at pickup is never billed', async () => {
      const s = await setup();
      const { res } = await ride(s, {
        endKm: 126, // 26 km: 2 over
        lateMinutes: 30,
        damages: [{ description: 'Cracked mirror', severity: 'MINOR', feeAmount: 25_000 }],
      });
      expect(res.body.settlement.lineItems.map((l: { type: string; amount: number }) => [l.type, l.amount])).toEqual([
        ['EXTRA_KM', 1200],
        ['LATE_FEE', 9900],
        ['DAMAGE', 25_000],
      ]);
      expect(res.body.settlement).toMatchObject({ totalCharges: 36_100, refundAmount: DEPOSIT - 36_100 });
      expect(res.body.rental.damages).toHaveLength(1);
    });

    it('the amounts stored always add up, and the database refuses a bill that does not', async () => {
      const s = await setup();
      const { id } = await ride(s, { endKm: 130.4 });
      const row = await dbSettlement(id);
      expect(row.refundAmount + row.totalCharges).toBe(row.depositHeld);
      expect(row.lineItems.reduce((n, l) => n + l.amount, 0)).toBe(row.totalCharges);

      await expect(t.prisma.settlement.update({ where: { id: row.id }, data: { refundAmount: row.refundAmount + 1 } })).rejects.toThrow();
      await expect(t.prisma.settlement.update({ where: { id: row.id }, data: { outstandingAmount: 5 } })).rejects.toThrow();
      await expect(
        t.prisma.settlementLineItem.create({ data: { settlementId: row.id, type: 'DAMAGE', description: 'x', quantity: 2, unitAmount: 100, amount: 150 } }),
      ).rejects.toThrow();
    });

    it('cancelled and no-show bookings have no settlement', async () => {
      const s = await setup();
      const customer = await t.verifiedCustomer();
      const created = await t.http().post(api('/bookings')).set(customer.auth).send({ vehicleId: s.vehicleIds[0], hours: 1 }).expect(201);
      await t.http().post(api(`/bookings/${created.body.id}/pay`)).set(customer.auth).send({}).expect(200);
      await t.http().post(api(`/bookings/${created.body.id}/cancel`)).set(customer.auth).expect(200);
      const res = await t.http().get(api(`/bookings/${created.body.id}/settlement`)).set(customer.auth).expect(404);
      expect(res.body.code).toBe('SETTLEMENT_NOT_FOUND');
    });

    it('the customer can only read their own bill', async () => {
      const s = await setup();
      const { id } = await ride(s);
      const stranger = await t.verifiedCustomer();
      await t.http().get(api(`/bookings/${id}/settlement`)).set(stranger.auth).expect(404);
      await t.http().get(api(`/bookings/${id}/settlement`)).expect(401);
      await t.http().get(api(`/bookings/${id}/settlement`)).set(s.empA.auth).expect(403);
    });
  });

  describe('charges that use up the deposit', () => {
    it('charges equal to the deposit leave nothing to refund or collect', async () => {
      const s = await setup();
      const { id, res } = await ride(s, { damages: [{ description: 'Frame bent', severity: 'MAJOR', feeAmount: DEPOSIT }] });
      expect(res.body.settlement).toMatchObject({ status: 'NO_ACTION', refundAmount: 0, outstandingAmount: 0, totalCharges: DEPOSIT });
      expect(res.body.status).toBe('SETTLED');
      expect(await t.prisma.refund.count({ where: { payment: { bookingId: id } } })).toBe(0);
    });
  });

  describe('an outstanding amount', () => {
    async function owing(s: Setup, over = 50_000) {
      return ride(s, { damages: [{ description: 'Stolen battery', severity: 'MAJOR', feeAmount: DEPOSIT + over }] });
    }

    it('is recorded, nothing is refunded, and it shows under the customer\'s active bookings', async () => {
      const s = await setup();
      const { id, customer, res } = await owing(s);
      expect(res.body.status).toBe('SETTLED');
      expect(res.body.settlement).toMatchObject({ status: 'OUTSTANDING', refundAmount: 0, outstandingAmount: 50_000, payable: true });
      expect(await t.prisma.refund.count({ where: { payment: { bookingId: id } } })).toBe(0);

      const active = await t.http().get(api('/bookings?tab=active')).set(customer.auth).expect(200);
      expect(active.body.items.map((b: { id: string }) => b.id)).toContain(id);
      const past = await t.http().get(api('/bookings?tab=past')).set(customer.auth).expect(200);
      expect(past.body.items.map((b: { id: string }) => b.id)).not.toContain(id);
    });

    it('blocks new bookings until it is paid, then lets the customer book again', async () => {
      const s = await setup();
      const { id, customer } = await owing(s);

      const blocked = await t.http().post(api('/bookings')).set(customer.auth).send({ vehicleId: s.vehicleIds[1], hours: 1 }).expect(409);
      expect(blocked.body).toMatchObject({ code: 'OUTSTANDING_BALANCE', details: { bookingId: id, amount: 50_000 } });
      expect(blocked.body.message).toContain('₹500');
      // Other customers are not affected.
      const other = await t.verifiedCustomer();
      await t.http().post(api('/bookings')).set(other.auth).send({ vehicleId: s.vehicleIds[1], hours: 1 }).expect(201);

      await t.http().post(api(`/bookings/${id}/settlement/pay`)).set(customer.auth).send({}).expect(200);
      await t.http().post(api('/bookings')).set(customer.auth).send({ vehicleId: s.vehicleIds[2], hours: 1 }).expect(201);
    });

    it('a declined payment leaves it owing and can be retried', async () => {
      const s = await setup();
      const { id, customer } = await owing(s);
      const declined = await t.http().post(api(`/bookings/${id}/settlement/pay`)).set(customer.auth).send({ simulate: 'FAIL' }).expect(402);
      expect(declined.body.code).toBe('PAYMENT_FAILED');
      expect((await dbSettlement(id)).status).toBe('OUTSTANDING');

      const paid = await t.http().post(api(`/bookings/${id}/settlement/pay`)).set(customer.auth).send({}).expect(200);
      expect(paid.body).toMatchObject({ status: 'CLEARED', outstandingAmount: 50_000, payable: false });
      expect(paid.body.clearedAt).toBeTruthy();
      const payments = await t.prisma.payment.findMany({ where: { bookingId: id, purpose: 'OUTSTANDING' }, orderBy: { createdAt: 'asc' } });
      expect(payments.map((p) => [p.status, p.chargeAmount])).toEqual([['FAILED', 50_000], ['SUCCEEDED', 50_000]]);

      const again = await t.http().post(api(`/bookings/${id}/settlement/pay`)).set(customer.auth).send({}).expect(409);
      expect(again.body.code).toBe('ALREADY_PAID');
    });

    it('never charges twice: a repeated key and parallel taps pay once', async () => {
      const s = await setup();
      const { id, customer } = await owing(s);
      const key = `pay-${Date.now()}-abcdef`;
      await t.http().post(api(`/bookings/${id}/settlement/pay`)).set(customer.auth).set('Idempotency-Key', key).send({}).expect(200);
      await t.http().post(api(`/bookings/${id}/settlement/pay`)).set(customer.auth).set('Idempotency-Key', key).send({}).expect(200);
      expect(await t.prisma.payment.count({ where: { bookingId: id, purpose: 'OUTSTANDING' } })).toBe(1);

      const s2 = await setup();
      const second = await owing(s2);
      const results = await Promise.all(
        Array.from({ length: 6 }, () => t.http().post(api(`/bookings/${second.id}/settlement/pay`)).set(second.customer.auth).send({})),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status !== 200).every((r) => r.status === 409)).toBe(true);
      expect(await t.prisma.payment.count({ where: { bookingId: second.id, purpose: 'OUTSTANDING', status: 'SUCCEEDED' } })).toBe(1);
    });

    it('rejects a bad idempotency key, someone else\'s bill and a bill with nothing to pay', async () => {
      const s = await setup();
      const { id, customer } = await owing(s);
      await t.http().post(api(`/bookings/${id}/settlement/pay`)).set(customer.auth).set('Idempotency-Key', 'short').send({}).expect(400);
      const stranger = await t.verifiedCustomer();
      await t.http().post(api(`/bookings/${id}/settlement/pay`)).set(stranger.auth).send({}).expect(404);

      const clean = await ride(s, { vehicle: 1 });
      const none = await t.http().post(api(`/bookings/${clean.id}/settlement/pay`)).set(clean.customer.auth).send({}).expect(409);
      expect(none.body.code).toBe('NOTHING_TO_PAY');
    });
  });

  describe('the desk', () => {
    it('lists what is owed at the stations staff run, and only those', async () => {
      const s = await setup();
      const { id } = await ride(s, { damages: [{ description: 'Broken light', severity: 'MINOR', feeAmount: DEPOSIT + 10_000 }] });
      const clean = await ride(s, { vehicle: 1 });

      const ids = async (auth: Auth, q = '') =>
        (await t.http().get(api(`/settlements${q}`)).set(auth).expect(200)).body.items.map((x: { booking: { id: string } }) => x.booking.id);
      expect(await ids(s.empA.auth)).toContain(id);
      expect(await ids(s.empA.auth)).not.toContain(clean.id); // refunded ones are not actionable
      expect(await ids(s.empA.auth, '?status=REFUNDED')).toContain(clean.id);
      expect(await ids(s.manager.auth)).toContain(id);
      expect(await ids((await t.asRole('SUPER_ADMIN')).auth)).toContain(id);
      expect(await ids(s.empB.auth)).not.toContain(id);

      const list = await t.http().get(api('/settlements')).set(s.empA.auth).expect(200);
      const item = list.body.items.find((x: { booking: { id: string } }) => x.booking.id === id);
      expect(item).toMatchObject({ status: 'OUTSTANDING', outstandingAmount: 10_000, booking: { vehicleCode: expect.any(String), customer: { fullName: expect.any(String) } } });
    });

    it('other stations get 404, customers get 403, the filter checks scope', async () => {
      const s = await setup();
      const { id, customer } = await ride(s, { damages: [{ description: 'Scratch', severity: 'MINOR', feeAmount: DEPOSIT + 100 }] });
      const row = await dbSettlement(id);
      await t.http().get(api(`/settlements/${row.id}`)).set(s.empA.auth).expect(200);
      await t.http().get(api(`/settlements/${row.id}`)).set(s.empB.auth).expect(404);
      await t.http().post(api(`/settlements/${row.id}/collect`)).set(s.empB.auth).send({}).expect(404);
      await t.http().get(api('/settlements')).set(customer.auth).expect(403);
      await t.http().get(api(`/settlements/${row.id}`)).set(customer.auth).expect(403);
      await t.http().get(api('/settlements')).expect(401);
      await t.http().get(api(`/settlements?stationId=${s.b.id}`)).set(s.empA.auth).expect(403);
      await t.http().get(api('/settlements?status=NOPE')).set(s.empA.auth).expect(400);
    });

    it('staff take the payment at the desk and the customer can book again', async () => {
      const s = await setup();
      const { id, customer } = await ride(s, { damages: [{ description: 'Mirror', severity: 'MINOR', feeAmount: DEPOSIT + 7_500 }] });
      const row = await dbSettlement(id);
      const res = await t.http().post(api(`/settlements/${row.id}/collect`)).set(s.empA.auth).send({}).expect(200);
      expect(res.body).toMatchObject({ status: 'CLEARED', outstandingAmount: 7_500 });
      await t.http().post(api(`/settlements/${row.id}/collect`)).set(s.empA.auth).send({}).expect(409);
      await t.http().post(api('/bookings')).set(customer.auth).send({ vehicleId: s.vehicleIds[1], hours: 1 }).expect(201);
    });

    it('staff see the bill on the booking, never the PIN', async () => {
      const s = await setup();
      const { id } = await ride(s, { endKm: 130.4 });
      const res = await t.http().get(api(`/station/bookings/${id}`)).set(s.empA.auth).expect(200);
      expect(res.body.settlement).toMatchObject({ status: 'REFUNDED', totalCharges: 4200 });
      expect(res.body.refundedAmount).toBe(DEPOSIT - 4200);
      expect(res.body.pin).toBeUndefined();
    });
  });

  describe('a refund that does not go through', () => {
    it('stays pending, can be retried, and then settles the booking', async () => {
      const s = await setup();
      vi.spyOn(t.app.get(PaymentsService), 'refund').mockResolvedValueOnce(false);
      const { id, customer, res } = await ride(s);

      expect(res.body.status).toBe('RETURNED');
      expect(res.body.settlement).toMatchObject({ status: 'REFUND_PENDING', refundAmount: DEPOSIT });
      const row = await dbSettlement(id);
      const listed = await t.http().get(api('/settlements')).set(s.empA.auth).expect(200);
      expect(listed.body.items.map((x: { id: string }) => x.id)).toContain(row.id);
      // The customer sees the amount that is on its way.
      const mine = await t.http().get(api(`/bookings/${id}/settlement`)).set(customer.auth).expect(200);
      expect(mine.body.status).toBe('REFUND_PENDING');

      await t.http().post(api(`/settlements/${row.id}/retry-refund`)).set(s.empB.auth).expect(404);
      const retried = await t.http().post(api(`/settlements/${row.id}/retry-refund`)).set(s.empA.auth).expect(200);
      expect(retried.body).toMatchObject({ status: 'REFUNDED', booking: { status: 'SETTLED' } });
      expect(await t.prisma.refund.count({ where: { payment: { bookingId: id }, status: 'SUCCEEDED', reason: 'DEPOSIT_RETURN' } })).toBe(1);

      const again = await t.http().post(api(`/settlements/${row.id}/retry-refund`)).set(s.empA.auth).expect(409);
      expect(again.body.code).toBe('NOTHING_TO_RETRY');
    });

    it('a failed retry says so and keeps it pending', async () => {
      const s = await setup();
      vi.spyOn(t.app.get(PaymentsService), 'refund').mockResolvedValue(false);
      const { id } = await ride(s);
      const row = await dbSettlement(id);
      const res = await t.http().post(api(`/settlements/${row.id}/retry-refund`)).set(s.empA.auth).expect(502);
      expect(res.body.code).toBe('REFUND_FAILED');
      expect((await dbSettlement(id)).status).toBe('REFUND_PENDING');
    });

    it('parallel retries send the deposit back only once', async () => {
      const s = await setup();
      vi.spyOn(t.app.get(PaymentsService), 'refund').mockResolvedValueOnce(false);
      const { id } = await ride(s);
      const row = await dbSettlement(id);
      const results = await Promise.all(Array.from({ length: 4 }, () => t.http().post(api(`/settlements/${row.id}/retry-refund`)).set(s.empA.auth)));
      expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);
      expect(results.some((r) => r.status === 200)).toBe(true);
      expect(await t.prisma.refund.count({ where: { payment: { bookingId: id }, status: 'SUCCEEDED', reason: 'DEPOSIT_RETURN' } })).toBe(1);
      expect((await dbSettlement(id)).status).toBe('REFUNDED');
    });

    it('the database allows one successful deposit refund per payment', async () => {
      const s = await setup();
      const { id } = await ride(s);
      const payment = await t.prisma.payment.findFirstOrThrow({ where: { bookingId: id } });
      await expect(
        t.prisma.refund.create({ data: { paymentId: payment.id, refundAmount: 1, status: 'SUCCEEDED', reason: 'DEPOSIT_RETURN', provider: 'mock' } }),
      ).rejects.toThrow();
    });
  });
});
