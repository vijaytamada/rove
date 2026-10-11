import { vi } from 'vitest';
import { JobsRunner } from '../src/modules/jobs/jobs.runner.js';
import { JobsService } from '../src/modules/jobs/jobs.service.js';
import { NotificationEventsService } from '../src/modules/notifications/notification-events.service.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { NOTIFICATION_PROVIDER } from '../src/providers/notification/notification.provider.js';
import { createTestApp, type TestApp } from './helpers.js';

const HOUR = 3_600_000;
const MIN = 60_000;
const DEPOSIT = 100_000;

describe('Notifications and background jobs (e2e)', () => {
  let t: TestApp;
  let jobs: JobsService;

  beforeAll(async () => {
    t = await createTestApp();
    jobs = t.app.get(JobsService);
  });
  afterAll(() => t.cleanup());
  afterEach(() => vi.restoreAllMocks());

  const api = (path: string) => `/api/v1${path}`;

  async function setup(opts: { vehicles?: number } = {}) {
    const city = await t.makeCity();
    const a = await t.makeStation(city.id, { capacity: 10 });
    const model = await t.makeModel();
    await t.makePlan(model.id);
    const vehicleIds: string[] = [];
    for (let i = 0; i < (opts.vehicles ?? 2); i++) vehicleIds.push((await t.makeVehicle(a.id, model.id)).id);
    const emp = await t.asRole('STATION_EMPLOYEE', { stationIds: [a.id] });
    const customer = await t.verifiedCustomer();
    return { city, a, vehicleIds, emp, customer };
  }
  type Setup = Awaited<ReturnType<typeof setup>>;

  async function book(s: Setup, opts: { vehicle?: number; startInMs?: number; hours?: number; customer?: Setup['customer'] } = {}) {
    const customer = opts.customer ?? s.customer;
    const body: Record<string, unknown> = { vehicleId: s.vehicleIds[opts.vehicle ?? 0], hours: opts.hours ?? 2 };
    if (opts.startInMs) body.startAt = new Date(Date.now() + opts.startInMs).toISOString();
    return (await t.http().post(api('/bookings')).set(customer.auth).send(body).expect(201)).body;
  }
  async function pay(s: Setup, booking: { id: string }, customer = s.customer) {
    return (await t.http().post(api(`/bookings/${booking.id}/pay`)).set(customer.auth).send({}).expect(200)).body;
  }
  const pickup = (s: Setup, paid: { id: string; pin: string }) =>
    t
      .http()
      .post(api(`/station/bookings/${paid.id}/pickup`))
      .set(s.emp.auth)
      .send({ pin: paid.pin, idChecked: true, startOdometerKm: 100, startBatteryPercent: 90 });
  const giveBack = (s: Setup, id: string, extra: Record<string, unknown> = {}) =>
    t
      .http()
      .post(api(`/station/bookings/${id}/return`))
      .set(s.emp.auth)
      .send({ returnStationId: s.a.id, endOdometerKm: 110, endBatteryPercent: 60, ...extra });

  /** Everything in a customer's inbox, newest first. */
  async function inbox(who: { auth: { Authorization: string } }, query = '') {
    return (await t.http().get(api(`/notifications${query}`)).set(who.auth).expect(200)).body as {
      items: { id: string; type: string; title: string; body: string; bookingId: string | null; readAt: string | null }[];
      total: number;
    };
  }
  const types = async (who: { auth: { Authorization: string } }) => (await inbox(who)).items.map((n) => n.type).reverse();

  describe('booking messages', () => {
    it('confirmation arrives when the payment goes through, with the booking code and no PIN', async () => {
      const s = await setup();
      const booking = await book(s);
      expect(await types(s.customer)).toEqual([]); // holding a scooter is not news yet
      const paid = await pay(s, booking);

      const { items } = await inbox(s.customer);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ type: 'BOOKING_CONFIRMED', title: 'Booking confirmed', bookingId: booking.id, readAt: null });
      expect(items[0].body).toContain(paid.code);
      expect(items[0].body).toContain('₹1,100'); // Rs 100 for 2 hours + Rs 1000 deposit
      expect(items[0].body).not.toContain(paid.pin);
    });

    it('a failed payment sends nothing, and paying again later sends one confirmation', async () => {
      const s = await setup();
      const booking = await book(s);
      await t.http().post(api(`/bookings/${booking.id}/pay`)).set(s.customer.auth).send({ simulate: 'FAIL' }).expect(402);
      expect(await types(s.customer)).toEqual([]);
      await pay(s, booking);
      await t.http().post(api(`/bookings/${booking.id}/pay`)).set(s.customer.auth).send({}).expect(409);
      expect(await types(s.customer)).toEqual(['BOOKING_CONFIRMED']);
    });

    it('cancelling a paid booking says what was refunded; cancelling an unpaid hold says nothing', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s, { vehicle: 0 }));
      await t.http().post(api(`/bookings/${paid.id}/cancel`)).set(s.customer.auth).expect(200);
      const unpaid = await book(s, { vehicle: 1 });
      await t.http().post(api(`/bookings/${unpaid.id}/cancel`)).set(s.customer.auth).expect(200);

      const { items } = await inbox(s.customer);
      expect(items.map((n) => n.type).reverse()).toEqual(['BOOKING_CONFIRMED', 'BOOKING_CANCELLED']);
      expect(items[0].body).toContain('₹1,100 has been refunded');
    });

    it('a refund the gateway refuses is described as being processed', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s));
      vi.spyOn(t.app.get(PaymentsService), 'refund').mockResolvedValueOnce(false);
      await t.http().post(api(`/bookings/${paid.id}/cancel`)).set(s.customer.auth).expect(200);
      const { items } = await inbox(s.customer);
      expect(items[0].type).toBe('BOOKING_CANCELLED');
      expect(items[0].body).toContain('is being processed');
    });

    it('a delivery failure never breaks the booking, and the message is still in the inbox', async () => {
      const s = await setup();
      vi.spyOn(t.app.get(NOTIFICATION_PROVIDER), 'deliver').mockRejectedValue(new Error('sms is down'));
      const paid = await pay(s, await book(s));
      expect(paid.status).toBe('CONFIRMED');
      expect(await types(s.customer)).toEqual(['BOOKING_CONFIRMED']);
    });

    it('raising the same event twice sends it once', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s));
      const events = t.app.get(NotificationEventsService);
      expect(await events.bookingConfirmed(paid.id)).toBe(false);
      expect(await events.bookingConfirmed(paid.id)).toBe(false);
      expect(await t.prisma.notification.count({ where: { bookingId: paid.id } })).toBe(1);
    });
  });

  describe('the hold that expires', () => {
    it('the job marks an unpaid hold expired and tells the customer, once', async () => {
      const s = await setup();
      const booking = await book(s);
      await t.prisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: new Date(Date.now() - MIN) } });

      const first = await jobs.runOnce();
      expect(first.holdsExpired).toBeGreaterThanOrEqual(1);
      expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('EXPIRED');
      const { items } = await inbox(s.customer);
      expect(items.map((n) => n.type)).toEqual(['BOOKING_EXPIRED']);
      expect(items[0].bookingId).toBe(booking.id);

      await jobs.runOnce();
      expect(await types(s.customer)).toEqual(['BOOKING_EXPIRED']);
    });

    it('a hold the customer\'s own request already marked expired still gets its notice', async () => {
      const s = await setup();
      const booking = await book(s);
      await t.prisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: new Date(Date.now() - MIN) } });
      // Opening the list marks it expired without any message.
      await t.http().get(api('/bookings')).set(s.customer.auth).expect(200);
      expect(await types(s.customer)).toEqual([]);
      await jobs.runOnce();
      expect(await types(s.customer)).toEqual(['BOOKING_EXPIRED']);
    });

    it('does not announce holds that ran out more than a day ago', async () => {
      const s = await setup();
      const booking = await book(s);
      await t.prisma.booking.update({ where: { id: booking.id }, data: { status: 'EXPIRED', holdExpiresAt: new Date(Date.now() - 2 * 24 * HOUR) } });
      await t.prisma.$executeRaw`UPDATE "Booking" SET "updatedAt" = now() - interval '2 days' WHERE id = ${booking.id}::uuid`;
      await jobs.runOnce();
      expect(await types(s.customer)).toEqual([]);
    });

    it('leaves a hold alone while it is still running, and never touches a paid booking', async () => {
      const s = await setup();
      const live = await book(s, { vehicle: 0 });
      const paid = await pay(s, await book(s, { vehicle: 1, startInMs: 5 * HOUR }));
      await jobs.runOnce();
      expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: live.id } })).status).toBe('PENDING_PAYMENT');
      expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe('CONFIRMED');
    });

    it('a payment that lands after the job expired the hold is refunded', async () => {
      const s = await setup();
      const booking = await book(s);
      await t.prisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: new Date(Date.now() - MIN) } });
      await jobs.runOnce();
      const res = await t.http().post(api(`/bookings/${booking.id}/pay`)).set(s.customer.auth).send({}).expect(409);
      expect(res.body.code).toBe('HOLD_EXPIRED');
      expect(await t.prisma.payment.count({ where: { bookingId: booking.id } })).toBe(0);
    });
  });

  describe('reminders', () => {
    it('sends a pickup reminder in the hour before the start, once', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s, { startInMs: 5 * HOUR }));
      const startAt = new Date(paid.startAt);
      const run = (minutesBeforeStart: number) => jobs.runOnce(new Date(startAt.getTime() - minutesBeforeStart * MIN));

      await run(120);
      expect(await types(s.customer)).toEqual(['BOOKING_CONFIRMED']);
      await run(45);
      expect(await types(s.customer)).toEqual(['BOOKING_CONFIRMED', 'PICKUP_REMINDER']);
      await run(40);
      expect(await types(s.customer)).toEqual(['BOOKING_CONFIRMED', 'PICKUP_REMINDER']);

      const { items } = await inbox(s.customer);
      expect(items[0]).toMatchObject({ type: 'PICKUP_REMINDER', bookingId: paid.id });
      expect(items[0].body).toContain(paid.code);
      expect(items[0].body).toContain(s.a.name);
      expect(items[0].body).not.toContain(paid.pin);
    });

    it('does not remind someone who booked a ride that starts within the hour', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s, { startInMs: 30 * MIN }));
      await jobs.runOnce(new Date(new Date(paid.startAt).getTime() - 20 * MIN));
      expect(await types(s.customer)).toEqual(['BOOKING_CONFIRMED']);
    });

    it('does not remind a cancelled booking', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s, { startInMs: 5 * HOUR }));
      await t.http().post(api(`/bookings/${paid.id}/cancel`)).set(s.customer.auth).expect(200);
      await jobs.runOnce(new Date(new Date(paid.startAt).getTime() - 30 * MIN));
      expect(await types(s.customer)).toEqual(['BOOKING_CONFIRMED', 'BOOKING_CANCELLED']);
    });

    it('tells the customer the ride has started, then reminds them to return, then that they are overdue', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s));
      await pickup(s, paid).expect(200);
      expect(await types(s.customer)).toEqual(['BOOKING_CONFIRMED', 'RIDE_STARTED']);
      const endAt = new Date(paid.endAt);

      const run = async (minutesFromEnd: number, expected: string[]) => {
        await jobs.runOnce(new Date(endAt.getTime() + minutesFromEnd * MIN));
        expect(await types(s.customer)).toEqual(['BOOKING_CONFIRMED', 'RIDE_STARTED', ...expected]);
      };
      await run(-40, []);
      await run(-20, ['RETURN_REMINDER']);
      await run(-10, ['RETURN_REMINDER']); // already sent
      await run(10, ['RETURN_REMINDER']); // inside the 15 minute grace period: not overdue yet
      await run(20, ['RETURN_REMINDER', 'RETURN_OVERDUE']);
      await run(30, ['RETURN_REMINDER', 'RETURN_OVERDUE']); // already sent

      // Once the scooter is back no more reminders are due.
      await giveBack(s, paid.id).expect(200);
      await jobs.runOnce(new Date(endAt.getTime() + 60 * MIN));
      expect(await types(s.customer)).toEqual(['BOOKING_CONFIRMED', 'RIDE_STARTED', 'RETURN_REMINDER', 'RETURN_OVERDUE', 'RIDE_COMPLETED']);
    });
  });

  describe('after the ride', () => {
    it('a clean return says the deposit was refunded', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s));
      await pickup(s, paid).expect(200);
      await giveBack(s, paid.id).expect(200);
      const { items } = await inbox(s.customer);
      expect(items[0]).toMatchObject({ type: 'RIDE_COMPLETED', title: 'Ride complete', bookingId: paid.id });
      expect(items[0].body).toContain('no extra charges');
      expect(items[0].body).toContain('₹1,000 of your deposit has been refunded');
    });

    it('charges are shown and the refund is what is left', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s));
      await pickup(s, paid).expect(200);
      await giveBack(s, paid.id, { endOdometerKm: 130.4 }).expect(200); // 7 extra km at Rs 6 = Rs 42
      const { items } = await inbox(s.customer);
      expect(items[0].body).toContain('Charges came to ₹42.');
      expect(items[0].body).toContain('₹958 of your deposit has been refunded');
    });

    it('a refund that fails is "being processed", and the retry sends a refund message', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s));
      await pickup(s, paid).expect(200);
      vi.spyOn(t.app.get(PaymentsService), 'refund').mockResolvedValueOnce(false);
      await giveBack(s, paid.id).expect(200);
      let { items } = await inbox(s.customer);
      expect(items[0].type).toBe('RIDE_COMPLETED');
      expect(items[0].body).toContain('is being processed');

      const settlement = await t.prisma.settlement.findUniqueOrThrow({ where: { bookingId: paid.id } });
      await t.http().post(api(`/settlements/${settlement.id}/retry-refund`)).set(s.emp.auth).expect(200);
      ({ items } = await inbox(s.customer));
      expect(items[0]).toMatchObject({ type: 'REFUND_SENT' });
      expect(items[0].body).toContain('₹1,000');
      expect(await types(s.customer)).toEqual(['BOOKING_CONFIRMED', 'RIDE_STARTED', 'RIDE_COMPLETED', 'REFUND_SENT']);
    });

    it('an amount owed is announced, and paying it sends a receipt', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s));
      await pickup(s, paid).expect(200);
      await giveBack(s, paid.id, { damages: [{ description: 'Stolen battery', severity: 'MAJOR', feeAmount: DEPOSIT + 50_000 }] }).expect(200);
      let { items } = await inbox(s.customer);
      expect(items[0]).toMatchObject({ type: 'RIDE_COMPLETED', title: 'You owe ₹500' });
      expect(items[0].body).toContain('Pay it to book again');

      await t.http().post(api(`/bookings/${paid.id}/settlement/pay`)).set(s.customer.auth).send({ simulate: 'FAIL' }).expect(402);
      expect((await inbox(s.customer)).items[0].type).toBe('RIDE_COMPLETED'); // a declined payment is no receipt
      await t.http().post(api(`/bookings/${paid.id}/settlement/pay`)).set(s.customer.auth).send({}).expect(200);
      ({ items } = await inbox(s.customer));
      expect(items[0]).toMatchObject({ type: 'PAYMENT_RECEIVED' });
      expect(items[0].body).toContain('₹500');
    });

    it('a payment taken at the desk also sends the receipt', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s));
      await pickup(s, paid).expect(200);
      await giveBack(s, paid.id, { damages: [{ description: 'Frame bent', severity: 'MAJOR', feeAmount: DEPOSIT + 20_000 }] }).expect(200);
      const settlement = await t.prisma.settlement.findUniqueOrThrow({ where: { bookingId: paid.id } });
      await t.http().post(api(`/settlements/${settlement.id}/collect`)).set(s.emp.auth).send({}).expect(200);
      expect((await inbox(s.customer)).items[0]).toMatchObject({ type: 'PAYMENT_RECEIVED' });
    });

    it('charges that use the whole deposit say nothing is left and nothing is owed', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s));
      await pickup(s, paid).expect(200);
      await giveBack(s, paid.id, { damages: [{ description: 'Frame bent', severity: 'MAJOR', feeAmount: DEPOSIT }] }).expect(200);
      expect((await inbox(s.customer)).items[0].body).toContain('nothing is owed');
    });

    it('a no-show tells the customer the deposit came back', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s, { startInMs: 3 * HOUR }));
      await t.prisma.booking.update({
        where: { id: paid.id },
        data: { startAt: new Date(Date.now() - 61 * MIN), endAt: new Date(Date.now() + 3 * HOUR) },
      });
      await t.http().post(api(`/station/bookings/${paid.id}/no-show`)).set(s.emp.auth).expect(200);
      const { items } = await inbox(s.customer);
      expect(items[0]).toMatchObject({ type: 'NO_SHOW', bookingId: paid.id });
      expect(items[0].body).toContain('₹1,000 deposit has been refunded');
    });
  });

  describe('the inbox', () => {
    async function threeMessages() {
      const s = await setup();
      const paid = await pay(s, await book(s));
      await pickup(s, paid).expect(200);
      await giveBack(s, paid.id).expect(200);
      return { s, paid };
    }

    it('lists newest first, with a page size', async () => {
      const { s } = await threeMessages();
      const all = await inbox(s.customer);
      expect(all.total).toBe(3);
      expect(all.items.map((n) => n.type)).toEqual(['RIDE_COMPLETED', 'RIDE_STARTED', 'BOOKING_CONFIRMED']);
      const page = await inbox(s.customer, '?limit=2&page=2');
      expect(page.items.map((n) => n.type)).toEqual(['BOOKING_CONFIRMED']);
      await t.http().get(api('/notifications?limit=500')).set(s.customer.auth).expect(400);
    });

    it('counts unread ones, marks one as read, and then all', async () => {
      const { s } = await threeMessages();
      const count = async () => (await t.http().get(api('/notifications/unread-count')).set(s.customer.auth).expect(200)).body.count;
      expect(await count()).toBe(3);

      const [newest] = (await inbox(s.customer)).items;
      const read = await t.http().post(api(`/notifications/${newest.id}/read`)).set(s.customer.auth).expect(200);
      expect(read.body.readAt).toBeTruthy();
      expect(await count()).toBe(2);
      // Marking it again changes nothing.
      const again = await t.http().post(api(`/notifications/${newest.id}/read`)).set(s.customer.auth).expect(200);
      expect(again.body.readAt).toBe(read.body.readAt);

      const unread = await inbox(s.customer, '?unread=true');
      expect(unread.total).toBe(2);
      expect(unread.items.map((n) => n.id)).not.toContain(newest.id);
      await t.http().get(api('/notifications?unread=maybe')).set(s.customer.auth).expect(400);

      const all = await t.http().post(api('/notifications/read-all')).set(s.customer.auth).expect(200);
      expect(all.body.updated).toBe(2);
      expect(await count()).toBe(0);
      expect((await inbox(s.customer, '?unread=true')).total).toBe(0);
      expect((await t.http().post(api('/notifications/read-all')).set(s.customer.auth).expect(200)).body.updated).toBe(0);
    });

    it('is private: other people cannot read or change anyone else\'s messages', async () => {
      const { s } = await threeMessages();
      const [mine] = (await inbox(s.customer)).items;
      const stranger = await t.verifiedCustomer();
      expect((await inbox(stranger)).total).toBe(0);
      const res = await t.http().post(api(`/notifications/${mine.id}/read`)).set(stranger.auth).expect(404);
      expect(res.body.code).toBe('NOTIFICATION_NOT_FOUND');
      await t.http().post(api('/notifications/read-all')).set(stranger.auth).expect(200);
      expect((await inbox(s.customer, '?unread=true')).total).toBe(3); // untouched by the stranger
      await t.http().post(api('/notifications/not-a-uuid/read')).set(s.customer.auth).expect(400);
    });

    it('needs a login, and staff have an empty inbox of their own', async () => {
      const { s } = await threeMessages();
      await t.http().get(api('/notifications')).expect(401);
      await t.http().get(api('/notifications/unread-count')).expect(401);
      await t.http().post(api('/notifications/read-all')).expect(401);
      expect((await inbox(s.emp)).total).toBe(0);
    });
  });

  describe('the job runner', () => {
    it('runs only one instance at a time, and does the work when it holds the lock', async () => {
      const runner = t.app.get(JobsRunner);
      await t.redis.client.del('jobs:tick');
      expect(await runner.tick()).toBe(true);
      expect(await runner.tick()).toBe(false); // the lock is still held
      await t.redis.client.del('jobs:tick');
    });

    it('keeps going when one step fails', async () => {
      const s = await setup();
      const paid = await pay(s, await book(s, { vehicle: 1, startInMs: 5 * HOUR }));
      vi.spyOn(jobs, 'expireHolds').mockRejectedValueOnce(new Error('database hiccup'));
      await jobs.runOnce(new Date(new Date(paid.startAt).getTime() - 30 * MIN));
      // The first step failed, but the reminder step still ran.
      expect(await types(s.customer)).toContain('PICKUP_REMINDER');
    });
  });
});
