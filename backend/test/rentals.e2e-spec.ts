import { createTestApp, type Auth, type TestApp } from './helpers.js';

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('Station desk: pickup, return and no-show (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.cleanup());

  /** A city with two stations (A, B), one scooter model with a plan and `vehicles` scooters at A, a customer and staff. */
  async function setup(opts: { vehicles?: number } = {}) {
    const city = await t.makeCity();
    const a = await t.makeStation(city.id, { capacity: 10 });
    const b = await t.makeStation(city.id, { capacity: 10 });
    const model = await t.makeModel();
    await t.makePlan(model.id);
    const vehicleIds: string[] = [];
    for (let i = 0; i < (opts.vehicles ?? 1); i++) vehicleIds.push((await t.makeVehicle(a.id, model.id)).id);
    const empA = await t.asRole('STATION_EMPLOYEE', { stationIds: [a.id] });
    const empB = await t.asRole('STATION_EMPLOYEE', { stationIds: [b.id] });
    const manager = await t.asRole('CITY_MANAGER', { cityIds: [city.id] });
    const customer = await t.verifiedCustomer();
    return { city, a, b, model, vehicleIds, empA, empB, manager, customer };
  }

  const api = (path: string) => `/api/v1${path}`;

  /** Customer books and pays. `startOffsetMs` 0 = starting now. Returns the booking id, code and PIN. */
  async function paidBooking(customer: { auth: Auth }, vehicleId: string, opts: { startOffsetMs?: number; hours?: number } = {}) {
    const body: Record<string, unknown> = { vehicleId, hours: opts.hours ?? 2 };
    if (opts.startOffsetMs) body.startAt = iso(Date.now() + opts.startOffsetMs);
    const created = await t.http().post(api('/bookings')).set(customer.auth).send(body).expect(201);
    const paid = await t.http().post(api(`/bookings/${created.body.id}/pay`)).set(customer.auth).send({}).expect(200);
    return { id: paid.body.id as string, code: paid.body.code as string, pin: paid.body.pin as string };
  }

  const pickupBody = (pin: string, over: Record<string, unknown> = {}) => ({
    pin,
    idChecked: true,
    startOdometerKm: 100,
    startBatteryPercent: 90,
    ...over,
  });
  const pickup = (auth: Auth, id: string, body: Record<string, unknown>) =>
    t.http().post(api(`/station/bookings/${id}/pickup`)).set(auth).send(body);
  const doReturn = (auth: Auth, id: string, body: Record<string, unknown>) =>
    t.http().post(api(`/station/bookings/${id}/return`)).set(auth).send(body);
  const returnBody = (stationId: string, over: Record<string, unknown> = {}) => ({
    returnStationId: stationId,
    endOdometerKm: 112.5,
    endBatteryPercent: 70,
    ...over,
  });

  describe('finding a booking', () => {
    it('finds it by code, phone and name, and never shows the PIN', async () => {
      const s = await setup();
      const booking = await paidBooking(s.customer, s.vehicleIds[0]);
      const phone = (await t.prisma.user.findUniqueOrThrow({ where: { id: s.customer.id } })).phone!;

      for (const q of [booking.code, booking.code.toLowerCase(), booking.code.replace('RV-', ''), phone.slice(-7), 'Test CUSTOMER']) {
        const res = await t.http().get(api(`/station/bookings?q=${encodeURIComponent(q)}`)).set(s.empA.auth).expect(200);
        expect(res.body.items.map((b: { id: string }) => b.id)).toContain(booking.id);
      }
      const res = await t.http().get(api(`/station/bookings/${booking.id}`)).set(s.empA.auth).expect(200);
      expect(res.body).toMatchObject({ code: booking.code, status: 'CONFIRMED', station: { id: s.a.id } });
      expect(res.body.customer.phone).toBe(phone);
      expect(JSON.stringify(res.body)).not.toContain(booking.pin);
      expect(res.body.pin).toBeUndefined();
      expect(res.body.actions.pickup.allowed).toBe(true);
      expect(res.body.actions.return.allowed).toBe(false);
    });

    it('lists pickups, rides and past bookings in their own tabs', async () => {
      const s = await setup({ vehicles: 2 });
      const waiting = await paidBooking(s.customer, s.vehicleIds[0], { startOffsetMs: 5 * HOUR });
      const other = await t.verifiedCustomer();
      const riding = await paidBooking(other, s.vehicleIds[1]);
      await pickup(s.empA.auth, riding.id, pickupBody(riding.pin)).expect(200);

      const ids = async (tab: string, auth = s.empA.auth) =>
        (await t.http().get(api(`/station/bookings?tab=${tab}&stationId=${s.a.id}`)).set(auth).expect(200)).body.items.map((b: { id: string }) => b.id);
      expect(await ids('pickups')).toEqual([waiting.id]);
      expect(await ids('rides')).toEqual([riding.id]);
      expect(await ids('past')).toEqual([]);

      await doReturn(s.empA.auth, riding.id, returnBody(s.a.id)).expect(200);
      expect(await ids('rides')).toEqual([]);
      expect(await ids('past')).toEqual([riding.id]);
    });

    it('keeps other stations out, but lets a whole city see the rides it could take back', async () => {
      const s = await setup();
      const booking = await paidBooking(s.customer, s.vehicleIds[0]);
      // Another station's employee cannot see a booking that is waiting at station A...
      await t.http().get(api(`/station/bookings/${booking.id}`)).set(s.empB.auth).expect(404);
      expect((await t.http().get(api('/station/bookings?tab=pickups')).set(s.empB.auth).expect(200)).body.total).toBe(0);
      await t.http().get(api(`/station/bookings?stationId=${s.a.id}`)).set(s.empB.auth).expect(403);
      // ...the manager of the city can.
      await t.http().get(api(`/station/bookings/${booking.id}`)).set(s.manager.auth).expect(200);

      await pickup(s.empA.auth, booking.id, pickupBody(booking.pin)).expect(200);
      // Once it is out, staff at station B (same city) can see it, because they may take it back.
      const seen = await t.http().get(api(`/station/bookings/${booking.id}`)).set(s.empB.auth).expect(200);
      expect(seen.body.actions.return.allowed).toBe(true);
      expect(seen.body.returnStations.map((x: { id: string }) => x.id)).toEqual([s.b.id]);
      expect(seen.body.actions.pickup.allowed).toBe(false);
    });

    it('is for staff only, and unknown or foreign ids give 404', async () => {
      const s = await setup();
      const booking = await paidBooking(s.customer, s.vehicleIds[0]);
      await t.http().get(api('/station/bookings')).expect(401);
      await t.http().get(api('/station/bookings')).set(s.customer.auth).expect(403);
      await pickup(s.customer.auth, booking.id, pickupBody(booking.pin)).expect(403);
      await t.http().get(api('/station/bookings/00000000-0000-4000-8000-000000000000')).set(s.empA.auth).expect(404);
      await t.http().get(api('/station/bookings?tab=nonsense')).set(s.empA.auth).expect(400);
      // Searching for nothing sensible returns nothing, not everything.
      expect((await t.http().get(api('/station/bookings?q=%25%25')).set(s.empA.auth).expect(200)).body.total).toBe(0);
    });
  });

  describe('handing the scooter over', () => {
    it('starts the ride, takes the scooter out of the station and records the readings', async () => {
      const s = await setup();
      const booking = await paidBooking(s.customer, s.vehicleIds[0]);
      const res = await pickup(s.empA.auth, booking.id, pickupBody(booking.pin, { damages: [{ description: 'Scratch on left mirror', severity: 'MINOR' }] })).expect(200);

      expect(res.body.status).toBe('IN_RIDE');
      expect(res.body.rental).toMatchObject({ startOdometerKm: 100, startBatteryPercent: 90, endedAt: null, returnStation: null });
      expect(res.body.rental.damages).toEqual([expect.objectContaining({ phase: 'PICKUP', severity: 'MINOR', feeAmount: 0 })]);
      const vehicle = await t.prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicleIds[0] } });
      expect(vehicle).toMatchObject({ status: 'IN_RIDE', stationId: null, odometerKm: 100, batteryPercent: 90 });

      // The customer sees a ride in progress with no cancel option, and the station count drops.
      const mine = await t.http().get(api(`/bookings/${booking.id}`)).set(s.customer.auth).expect(200);
      expect(mine.body).toMatchObject({ status: 'IN_RIDE', cancellation: { allowed: false } });
      expect(mine.body.rental.startedAt).toBeTruthy();
      expect(mine.body.pin).toBeNull(); // the PIN has done its job
      expect((await t.http().get(api(`/stations/${s.a.id}`)).expect(200)).body.availableVehicles).toBe(0);
      await t.http().post(api(`/bookings/${booking.id}/cancel`)).set(s.customer.auth).expect(409);
    });

    it('needs the right PIN and the ID check, and locks after five wrong PINs', async () => {
      const s = await setup();
      const booking = await paidBooking(s.customer, s.vehicleIds[0]);
      const wrong = booking.pin === '000000' ? '111111' : '000000';

      expect((await pickup(s.empA.auth, booking.id, pickupBody(booking.pin, { idChecked: false })).expect(400)).body.code).toBe('VALIDATION_ERROR');
      await pickup(s.empA.auth, booking.id, pickupBody('12345')).expect(400);
      for (let i = 0; i < 5; i++) {
        expect((await pickup(s.empA.auth, booking.id, pickupBody(wrong)).expect(403)).body.code).toBe('PIN_INVALID');
      }
      // Locked: even the right PIN is refused for a while, so the PIN cannot be guessed.
      const locked = await pickup(s.empA.auth, booking.id, pickupBody(booking.pin)).expect(429);
      expect(locked.body.code).toBe('PIN_LOCKED');
      await t.redis.client.del(`pickup:pin:fail:${booking.id}`);
      await pickup(s.empA.auth, booking.id, pickupBody(booking.pin)).expect(200);
    });

    it('refuses too early, unpaid, out of scope and doubled-up handovers', async () => {
      const s = await setup({ vehicles: 3 });
      const later = await paidBooking(s.customer, s.vehicleIds[0], { startOffsetMs: 5 * HOUR });
      const early = await pickup(s.empA.auth, later.id, pickupBody(later.pin)).expect(409);
      expect(early.body.code).toBe('PICKUP_NOT_ALLOWED');
      expect(early.body.message).toContain('Too early');

      const other = await t.verifiedCustomer();
      const unpaid = await t.http().post(api('/bookings')).set(other.auth).send({ vehicleId: s.vehicleIds[1], hours: 1 }).expect(201);
      const third = await t.verifiedCustomer();
      expect((await pickup(s.empA.auth, unpaid.body.id, pickupBody('123456')).expect(409)).body.code).toBe('PICKUP_NOT_ALLOWED');

      const booking = await paidBooking(third, s.vehicleIds[2], { startOffsetMs: 6 * HOUR });
      await t.prisma.booking.update({ where: { id: booking.id }, data: { startAt: new Date(Date.now() - 10 * 60_000), endAt: new Date(Date.now() + HOUR) } });
      expect((await pickup(s.empB.auth, booking.id, pickupBody(booking.pin)).expect(403)).body.code).toBe('FORBIDDEN_SCOPE');
      await pickup(s.empA.auth, booking.id, pickupBody(booking.pin)).expect(200);
      expect((await pickup(s.empA.auth, booking.id, pickupBody(booking.pin)).expect(409)).body.code).toBe('PICKUP_NOT_ALLOWED');
    });

    it('rejects readings that cannot be right', async () => {
      const s = await setup();
      await t.prisma.vehicle.update({ where: { id: s.vehicleIds[0] }, data: { odometerKm: 500 } });
      const booking = await paidBooking(s.customer, s.vehicleIds[0]);
      const behind = await pickup(s.empA.auth, booking.id, pickupBody(booking.pin, { startOdometerKm: 400 })).expect(400);
      expect(behind.body.code).toBe('ODOMETER_BEHIND');
      await pickup(s.empA.auth, booking.id, pickupBody(booking.pin, { startBatteryPercent: 150 })).expect(400);
      await pickup(s.empA.auth, booking.id, pickupBody(booking.pin, { startOdometerKm: -1 })).expect(400);
      expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CONFIRMED');
      await pickup(s.empA.auth, booking.id, pickupBody(booking.pin, { startOdometerKm: 500 })).expect(200);
    });

    it('lets only one of two simultaneous handovers win', async () => {
      const s = await setup();
      const booking = await paidBooking(s.customer, s.vehicleIds[0]);
      const results = await Promise.all([
        pickup(s.empA.auth, booking.id, pickupBody(booking.pin)),
        pickup(s.empA.auth, booking.id, pickupBody(booking.pin)),
        pickup(s.manager.auth, booking.id, pickupBody(booking.pin)),
      ]);
      expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([200, 409, 409]);
      expect(await t.prisma.rental.count({ where: { bookingId: booking.id } })).toBe(1);
    });

    it('swaps in another scooter of the same model, with a reason', async () => {
      const s = await setup({ vehicles: 3 });
      const booking = await paidBooking(s.customer, s.vehicleIds[0]);
      const detail = await t.http().get(api(`/station/bookings/${booking.id}`)).set(s.empA.auth).expect(200);
      expect(detail.body.swapOptions.map((v: { id: string }) => v.id).sort()).toEqual([s.vehicleIds[1], s.vehicleIds[2]].sort());

      await pickup(s.empA.auth, booking.id, pickupBody(booking.pin, { replacementVehicleId: s.vehicleIds[1] })).expect(400);
      const res = await pickup(s.empA.auth, booking.id, pickupBody(booking.pin, { replacementVehicleId: s.vehicleIds[1], swapReason: 'Flat tyre on the booked scooter' })).expect(200);
      expect(res.body.vehicle.id).toBe(s.vehicleIds[1]);
      expect(res.body.rental.swapReason).toBe('Flat tyre on the booked scooter');
      const original = await t.prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicleIds[0] } });
      expect(original).toMatchObject({ status: 'AVAILABLE', stationId: s.a.id });
      const mine = await t.http().get(api(`/bookings/${booking.id}`)).set(s.customer.auth).expect(200);
      expect(mine.body.vehicle.id).toBe(s.vehicleIds[1]);
    });

    it('does not swap in another model, a booked scooter or one that is out of service', async () => {
      const s = await setup({ vehicles: 3 });
      const otherModel = await t.makeModel();
      await t.makePlan(otherModel.id);
      const wrongModel = await t.makeVehicle(s.a.id, otherModel.id);
      const booking = await paidBooking(s.customer, s.vehicleIds[0]);
      const swap = (id: string) => pickup(s.empA.auth, booking.id, pickupBody(booking.pin, { replacementVehicleId: id, swapReason: 'Faulty scooter' }));

      expect((await swap(wrongModel.id).expect(409)).body.code).toBe('REPLACEMENT_NOT_AVAILABLE');
      await paidBooking(await t.verifiedCustomer(), s.vehicleIds[1]);
      expect((await swap(s.vehicleIds[1]).expect(409)).body.code).toBe('REPLACEMENT_NOT_AVAILABLE');
      await t.prisma.vehicle.update({ where: { id: s.vehicleIds[2] }, data: { status: 'MAINTENANCE' } });
      expect((await swap(s.vehicleIds[2]).expect(409)).body.code).toBe('REPLACEMENT_NOT_AVAILABLE');
      expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CONFIRMED');
    });

    it('needs a replacement when the booked scooter is no longer there', async () => {
      const s = await setup({ vehicles: 2 });
      const booking = await paidBooking(s.customer, s.vehicleIds[0]);
      await t.prisma.vehicle.update({ where: { id: s.vehicleIds[0] }, data: { status: 'MAINTENANCE' } });
      const res = await pickup(s.empA.auth, booking.id, pickupBody(booking.pin)).expect(409);
      expect(res.body.code).toBe('VEHICLE_UNAVAILABLE');
      await pickup(s.empA.auth, booking.id, pickupBody(booking.pin, { replacementVehicleId: s.vehicleIds[1], swapReason: 'Booked scooter in maintenance' })).expect(200);
    });
  });

  describe('taking the scooter back', () => {
    async function ride(s: Awaited<ReturnType<typeof setup>>, opts: { vehicle?: number } = {}) {
      const booking = await paidBooking(s.customer, s.vehicleIds[opts.vehicle ?? 0]);
      await pickup(s.empA.auth, booking.id, pickupBody(booking.pin)).expect(200);
      return booking;
    }

    it('completes the booking and puts the scooter back in service at the same station', async () => {
      const s = await setup();
      const booking = await ride(s);
      const res = await doReturn(s.empA.auth, booking.id, returnBody(s.a.id)).expect(200);

      expect(res.body.status).toBe('RETURNED');
      expect(res.body.rental).toMatchObject({ endOdometerKm: 112.5, distanceKm: 12.5, endBatteryPercent: 70, returnStation: { id: s.a.id } });
      const vehicle = await t.prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicleIds[0] } });
      expect(vehicle).toMatchObject({ status: 'AVAILABLE', stationId: s.a.id, odometerKm: 112.5, batteryPercent: 70 });

      const mine = await t.http().get(api(`/bookings/${booking.id}`)).set(s.customer.auth).expect(200);
      expect(mine.body.status).toBe('RETURNED');
      expect(mine.body.rental).toMatchObject({ distanceKm: 12.5, returnStationName: s.a.name });
      expect(mine.body.pin).toBeNull();
      // The scooter can be booked again straight away.
      const next = await t.verifiedCustomer();
      await t.http().post(api('/bookings')).set(next.auth).send({ vehicleId: s.vehicleIds[0], hours: 1 }).expect(201);
    });

    it('can be returned to a different station in the same city, by that station\'s staff', async () => {
      const s = await setup();
      const booking = await ride(s);
      await doReturn(s.empB.auth, booking.id, returnBody(s.a.id)).expect(403);
      const res = await doReturn(s.empB.auth, booking.id, returnBody(s.b.id)).expect(200);
      expect(res.body.rental.returnStation.id).toBe(s.b.id);
      const vehicle = await t.prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicleIds[0] } });
      expect(vehicle.stationId).toBe(s.b.id);
      expect((await t.http().get(api(`/stations/${s.b.id}`)).expect(200)).body.availableVehicles).toBe(1);
      expect((await t.http().get(api(`/stations/${s.a.id}`)).expect(200)).body.availableVehicles).toBe(0);
    });

    it('refuses another city, a closed or full station, bad readings and second returns', async () => {
      const s = await setup({ vehicles: 2 });
      const booking = await ride(s);
      const farCity = await t.makeCity();
      const farStation = await t.makeStation(farCity.id);
      const admin = await t.asRole('SUPER_ADMIN');
      expect((await doReturn(admin.auth, booking.id, returnBody(farStation.id)).expect(409)).body.code).toBe('RETURN_CITY_MISMATCH');

      const closed = await t.makeStation(s.city.id, { status: 'INACTIVE' });
      expect((await doReturn(admin.auth, booking.id, returnBody(closed.id)).expect(409)).body.code).toBe('RETURN_STATION_INACTIVE');

      const tiny = await t.makeStation(s.city.id, { capacity: 1 });
      await t.makeVehicle(tiny.id, s.model.id);
      expect((await doReturn(admin.auth, booking.id, returnBody(tiny.id)).expect(409)).body.code).toBe('STATION_FULL');

      expect((await doReturn(s.empA.auth, booking.id, returnBody(s.a.id, { endOdometerKm: 99 })).expect(400)).body.code).toBe('ODOMETER_BEHIND');
      expect((await doReturn(s.empA.auth, booking.id, returnBody(s.a.id, { endOdometerKm: 99999 })).expect(400)).body.code).toBe('ODOMETER_TOO_FAR');
      await doReturn(s.empA.auth, booking.id, returnBody(s.a.id, { endBatteryPercent: 101 })).expect(400);
      await doReturn(s.empA.auth, booking.id, returnBody(s.a.id, { damages: [{ description: 'x', severity: 'MINOR' }] })).expect(400);
      expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('IN_RIDE');

      await doReturn(s.empA.auth, booking.id, returnBody(s.a.id)).expect(200);
      expect((await doReturn(s.empA.auth, booking.id, returnBody(s.a.id)).expect(409)).body.code).toBe('RETURN_NOT_ALLOWED');
      const notRidden = await paidBooking(await t.verifiedCustomer(), s.vehicleIds[1]);
      expect((await doReturn(s.empA.auth, notRidden.id, returnBody(s.a.id)).expect(409)).body.code).toBe('RETURN_NOT_ALLOWED');
    });

    it('sends a damaged scooter to maintenance and keeps the damage records', async () => {
      const s = await setup({ vehicles: 3 });
      const minor = await ride(s, { vehicle: 0 });
      const res = await doReturn(s.empA.auth, minor.id, returnBody(s.a.id, { damages: [{ description: 'Scuffed footboard', severity: 'MINOR', feeAmount: 20000 }] })).expect(200);
      expect(res.body.rental.damages).toEqual([expect.objectContaining({ phase: 'RETURN', severity: 'MINOR', feeAmount: 20000 })]);
      expect((await t.prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicleIds[0] } })).status).toBe('AVAILABLE');

      const serious = await paidBooking(await t.verifiedCustomer(), s.vehicleIds[1]);
      await pickup(s.empA.auth, serious.id, pickupBody(serious.pin)).expect(200);
      await doReturn(s.empA.auth, serious.id, returnBody(s.a.id, { damages: [{ description: 'Bent front fork', severity: 'MAJOR', feeAmount: 500000 }] })).expect(200);
      expect((await t.prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicleIds[1] } })).status).toBe('MAINTENANCE');
      expect((await t.http().get(api(`/stations/${s.a.id}`)).expect(200)).body.availableVehicles).toBe(2); // the minor-damage scooter and the untouched third

      const flagged = await paidBooking(await t.verifiedCustomer(), s.vehicleIds[2]);
      await pickup(s.empA.auth, flagged.id, pickupBody(flagged.pin)).expect(200);
      await doReturn(s.empA.auth, flagged.id, returnBody(s.a.id, { sendToMaintenance: true })).expect(200);
      expect((await t.prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicleIds[2] } })).status).toBe('MAINTENANCE');
    });

    it('never lets two returns share the last free slot', async () => {
      const s = await setup({ vehicles: 2 });
      const [first, second] = [await ride(s, { vehicle: 0 }), await paidBooking(await t.verifiedCustomer(), s.vehicleIds[1])];
      await pickup(s.empA.auth, second.id, pickupBody(second.pin)).expect(200);
      const small = await t.makeStation(s.city.id, { capacity: 1 });
      const admin = await t.asRole('SUPER_ADMIN');
      const results = await Promise.all([doReturn(admin.auth, first.id, returnBody(small.id)), doReturn(admin.auth, second.id, returnBody(small.id))]);
      expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([200, 409]);
      expect(await t.prisma.vehicle.count({ where: { stationId: small.id } })).toBe(1);
    });
  });

  describe('customers who never turn up', () => {
    async function overdue(s: Awaited<ReturnType<typeof setup>>, startedMinutesAgo: number) {
      const booking = await paidBooking(s.customer, s.vehicleIds[0], { startOffsetMs: 3 * HOUR });
      await t.prisma.booking.update({
        where: { id: booking.id },
        data: { startAt: new Date(Date.now() - startedMinutesAgo * 60_000), endAt: new Date(Date.now() + 3 * HOUR) },
      });
      return booking;
    }

    it('marks a no-show after the grace time, returns the deposit and keeps the rental', async () => {
      const s = await setup();
      const early = await overdue(s, 10);
      const notYet = await t.http().post(api(`/station/bookings/${early.id}/no-show`)).set(s.empA.auth).expect(409);
      expect(notYet.body.code).toBe('NO_SHOW_NOT_ALLOWED');
      await t.prisma.booking.update({ where: { id: early.id }, data: { startAt: new Date(Date.now() - 61 * 60_000) } });

      await t.http().post(api(`/station/bookings/${early.id}/no-show`)).set(s.empB.auth).expect(403);
      const res = await t.http().post(api(`/station/bookings/${early.id}/no-show`)).set(s.empA.auth).expect(200);
      expect(res.body.status).toBe('NO_SHOW');

      const mine = await t.http().get(api(`/bookings/${early.id}`)).set(s.customer.auth).expect(200);
      expect(mine.body).toMatchObject({ status: 'NO_SHOW', refundedAmount: 100000, pin: null });
      const refunds = await t.prisma.refund.findMany({ where: { payment: { bookingId: early.id } } });
      expect(refunds).toEqual([expect.objectContaining({ refundAmount: 100000, reason: 'NO_SHOW', status: 'SUCCEEDED' })]);

      await t.http().post(api(`/station/bookings/${early.id}/no-show`)).set(s.empA.auth).expect(409);
      expect((await pickup(s.empA.auth, early.id, pickupBody(early.pin)).expect(409)).body.code).toBe('PICKUP_NOT_ALLOWED');
      // The scooter is free for someone else again.
      const next = await t.verifiedCustomer();
      await t.http().post(api('/bookings')).set(next.auth).send({ vehicleId: s.vehicleIds[0], hours: 1 }).expect(201);
    });

    it('cannot be marked on a booking that is out or still in the future', async () => {
      const s = await setup({ vehicles: 2 });
      const future = await paidBooking(s.customer, s.vehicleIds[0], { startOffsetMs: 6 * HOUR });
      expect((await t.http().post(api(`/station/bookings/${future.id}/no-show`)).set(s.empA.auth).expect(409)).body.code).toBe('NO_SHOW_NOT_ALLOWED');
      const out = await paidBooking(await t.verifiedCustomer(), s.vehicleIds[1]);
      await pickup(s.empA.auth, out.id, pickupBody(out.pin)).expect(200);
      expect((await t.http().post(api(`/station/bookings/${out.id}/no-show`)).set(s.empA.auth).expect(409)).body.code).toBe('NO_SHOW_NOT_ALLOWED');
    });
  });

  it('keeps staff from changing, moving or retiring a scooter that is out', async () => {
    const s = await setup();
    const booking = await paidBooking(s.customer, s.vehicleIds[0]);
    await pickup(s.empA.auth, booking.id, pickupBody(booking.pin)).expect(200);
    const admin = await t.asRole('SUPER_ADMIN');
    expect((await t.http().patch(api(`/vehicles/${s.vehicleIds[0]}/status`)).set(admin.auth).send({ status: 'MAINTENANCE' }).expect(409)).body.code).toBe('VEHICLE_BUSY');
    expect((await t.http().delete(api(`/vehicles/${s.vehicleIds[0]}`)).set(admin.auth).expect(409)).body.code).toBe('VEHICLE_BUSY');
    const fleet = await t.http().get(api(`/manage/vehicles/${s.vehicleIds[0]}`)).set(admin.auth).expect(200);
    expect(fleet.body).toMatchObject({ status: 'IN_RIDE', station: null });
  });
});
