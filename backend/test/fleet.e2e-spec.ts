import { randomUUID } from 'node:crypto';
import { createTestApp, type Auth, type TestApp } from './helpers.js';

const station = (cityId: string, name: string, extra: Record<string, unknown> = {}) => ({
  cityId,
  name,
  address: '12 Test Road',
  latitude: 12.97,
  longitude: 77.64,
  capacity: 5,
  ...extra,
});

describe('Cities, stations and fleet (e2e)', () => {
  let t: TestApp;
  let admin: Auth;

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await t.asRole('SUPER_ADMIN')).auth;
  });
  afterAll(() => t.cleanup());

  describe('public browsing (no sign-in)', () => {
    it('shows active cities and stations with available counts, hiding inactive ones', async () => {
      const city = await t.makeCity();
      const hidden = await t.makeCity({ isActive: false });
      const open = await t.makeStation(city.id);
      const closed = await t.makeStation(city.id, { status: 'INACTIVE' });
      const model = await t.makeModel();
      await t.makeVehicle(open.id, model.id);
      await t.makeVehicle(open.id, model.id);
      await t.makeVehicle(open.id, model.id, { status: 'MAINTENANCE' });

      const cities = await t.http().get('/api/v1/cities').expect(200);
      const ids = cities.body.map((c: { id: string }) => c.id);
      expect(ids).toContain(city.id);
      expect(ids).not.toContain(hidden.id);

      const stations = await t.http().get(`/api/v1/cities/${city.id}/stations`).expect(200);
      expect(stations.body.map((s: { id: string }) => s.id)).toEqual([open.id]);
      expect(stations.body[0].availableVehicles).toBe(2);

      await t.http().get(`/api/v1/cities/${hidden.id}/stations`).expect(404);
      await t.http().get(`/api/v1/stations/${open.id}`).expect(200);
      await t.http().get(`/api/v1/stations/${closed.id}`).expect(404);
    });

    it('lists only available, non-retired scooters, without staff-only fields', async () => {
      const city = await t.makeCity();
      const s = await t.makeStation(city.id);
      const model = await t.makeModel();
      const ok = await t.makeVehicle(s.id, model.id, { battery: 91 });
      await t.makeVehicle(s.id, model.id, { status: 'MAINTENANCE' });
      await t.makeVehicle(s.id, model.id, { status: 'RESERVED' });
      const retired = await t.makeVehicle(s.id, model.id);
      await t.prisma.vehicle.update({ where: { id: retired.id }, data: { retiredAt: new Date() } });

      const res = await t.http().get(`/api/v1/stations/${s.id}/vehicles`).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ id: ok.id, status: 'AVAILABLE', batteryPercent: 91 });
      expect(res.body[0].model).toMatchObject({ type: 'SCOOTER', rangeKm: 80 });
      expect(res.body[0].registrationNumber).toBeUndefined();
      expect(res.body[0].odometerKm).toBeUndefined();
    });

    it('returns 404 for the vehicles of an inactive station and 400 for bad ids', async () => {
      const city = await t.makeCity();
      const closed = await t.makeStation(city.id, { status: 'INACTIVE' });
      await t.http().get(`/api/v1/stations/${closed.id}/vehicles`).expect(404);
      await t.http().get('/api/v1/stations/nope/vehicles').expect(400);
    });
  });

  describe('cities', () => {
    it('lets only super admins create and change cities', async () => {
      const name = `e2e-city-${randomUUID().slice(0, 8)}`;
      const manager = await t.asRole('CITY_MANAGER');
      const employee = await t.asRole('STATION_EMPLOYEE');
      const customer = await t.asRole('CUSTOMER');
      for (const who of [manager, employee, customer]) {
        await t.http().post('/api/v1/cities').set(who.auth).send({ name, state: 'Karnataka' }).expect(403);
      }

      const created = await t.http().post('/api/v1/cities').set(admin).send({ name, state: 'Karnataka' }).expect(201);
      expect(created.body).toMatchObject({ name, state: 'Karnataka', timezone: 'Asia/Kolkata', isActive: true });

      await t.http().patch(`/api/v1/cities/${created.body.id}`).set(manager.auth).send({ isActive: false }).expect(403);
      const hidden = await t.http().patch(`/api/v1/cities/${created.body.id}`).set(admin).send({ isActive: false }).expect(200);
      expect(hidden.body.isActive).toBe(false);
      const pub = await t.http().get('/api/v1/cities').expect(200);
      expect(pub.body.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
    });

    it('rejects duplicates and invalid time zones', async () => {
      const name = `e2e-city-${randomUUID().slice(0, 8)}`;
      await t.http().post('/api/v1/cities').set(admin).send({ name, state: 'Goa' }).expect(201);
      const dup = await t.http().post('/api/v1/cities').set(admin).send({ name, state: 'Goa' }).expect(409);
      expect(dup.body.code).toBe('CITY_EXISTS');
      const tz = await t.http().post('/api/v1/cities').set(admin).send({ name: `${name}-2`, state: 'Goa', timezone: 'Mars/Base' }).expect(400);
      expect(tz.body.code).toBe('INVALID_TIMEZONE');
      await t.http().post('/api/v1/cities').set(admin).send({ name: '', state: 'Goa' }).expect(400);
    });

    it('limits the management list to the manager’s cities', async () => {
      const mine = await t.makeCity();
      const other = await t.makeCity();
      const manager = await t.asRole('CITY_MANAGER', { cityIds: [mine.id] });
      const res = await t.http().get('/api/v1/manage/cities').set(manager.auth).expect(200);
      expect(res.body.items.map((c: { id: string }) => c.id)).toEqual([mine.id]);
      const all = await t.http().get('/api/v1/manage/cities?limit=100').set(admin).expect(200);
      expect(all.body.items.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining([mine.id, other.id]));
      const employee = await t.asRole('STATION_EMPLOYEE');
      await t.http().get('/api/v1/manage/cities').set(employee.auth).expect(403);
    });
  });

  describe('stations', () => {
    let mineCity: { id: string };
    let otherCity: { id: string };
    let manager: Auth;

    beforeAll(async () => {
      mineCity = await t.makeCity();
      otherCity = await t.makeCity();
      manager = (await t.asRole('CITY_MANAGER', { cityIds: [mineCity.id] })).auth;
    });

    it('lets a manager create and edit stations in their own city only', async () => {
      const name = `e2e-station-${randomUUID().slice(0, 8)}`;
      const created = await t
        .http().post('/api/v1/stations').set(manager)
        .send(station(mineCity.id, name, { opensAt: '06:00', closesAt: '22:00' }))
        .expect(201);
      expect(created.body).toMatchObject({ name, capacity: 5, opensAt: '06:00', closesAt: '22:00', status: 'ACTIVE' });

      const foreign = await t.http().post('/api/v1/stations').set(manager).send(station(otherCity.id, `${name}-x`)).expect(403);
      expect(foreign.body.code).toBe('FORBIDDEN_SCOPE');

      const edited = await t.http().patch(`/api/v1/stations/${created.body.id}`).set(manager).send({ capacity: 8, status: 'INACTIVE' }).expect(200);
      expect(edited.body).toMatchObject({ capacity: 8, status: 'INACTIVE' });

      const foreignStation = await t.makeStation(otherCity.id);
      await t.http().patch(`/api/v1/stations/${foreignStation.id}`).set(manager).send({ capacity: 3 }).expect(403);
    });

    it('does not let station employees or customers manage stations', async () => {
      const employee = await t.asRole('STATION_EMPLOYEE');
      const customer = await t.asRole('CUSTOMER');
      const body = station(mineCity.id, `e2e-station-${randomUUID().slice(0, 8)}`);
      await t.http().post('/api/v1/stations').set(employee.auth).send(body).expect(403);
      await t.http().post('/api/v1/stations').set(customer.auth).send(body).expect(403);
    });

    it('validates input', async () => {
      const base = station(mineCity.id, `e2e-station-${randomUUID().slice(0, 8)}`);
      await t.http().post('/api/v1/stations').set(manager).send({ ...base, latitude: 100 }).expect(400);
      await t.http().post('/api/v1/stations').set(manager).send({ ...base, capacity: 0 }).expect(400);
      await t.http().post('/api/v1/stations').set(manager).send({ ...base, opensAt: '25:00', closesAt: '22:00' }).expect(400);
      const oneSided = await t.http().post('/api/v1/stations').set(manager).send({ ...base, opensAt: '06:00' }).expect(400);
      expect(oneSided.body.code).toBe('INVALID_HOURS');
      await t.http().post('/api/v1/stations').set(manager).send({ ...base, cityId: randomUUID() }).expect(404);
    });

    it('rejects duplicate names within a city and does not let the city change', async () => {
      const name = `e2e-station-${randomUUID().slice(0, 8)}`;
      const first = await t.http().post('/api/v1/stations').set(manager).send(station(mineCity.id, name)).expect(201);
      const dup = await t.http().post('/api/v1/stations').set(manager).send(station(mineCity.id, name)).expect(409);
      expect(dup.body.code).toBe('STATION_EXISTS');
      await t.http().patch(`/api/v1/stations/${first.body.id}`).set(manager).send({ cityId: otherCity.id }).expect(400);
    });

    it('scopes the management list by role', async () => {
      const a1 = await t.makeStation(mineCity.id);
      const a2 = await t.makeStation(mineCity.id);
      const b1 = await t.makeStation(otherCity.id);
      const employee = await t.asRole('STATION_EMPLOYEE', { stationIds: [a1.id] });

      const asManager = await t.http().get('/api/v1/manage/stations?limit=100').set(manager).expect(200);
      const managerIds = asManager.body.items.map((s: { id: string }) => s.id);
      expect(managerIds).toEqual(expect.arrayContaining([a1.id, a2.id]));
      expect(managerIds).not.toContain(b1.id);

      const asEmployee = await t.http().get('/api/v1/manage/stations').set(employee.auth).expect(200);
      expect(asEmployee.body.items.map((s: { id: string }) => s.id)).toEqual([a1.id]);

      const asAdmin = await t.http().get(`/api/v1/manage/stations?cityId=${otherCity.id}`).set(admin).expect(200);
      expect(asAdmin.body.items.map((s: { id: string }) => s.id)).toContain(b1.id);
    });
  });

  describe('vehicle models', () => {
    it('lets only super admins change the catalogue; staff can read it', async () => {
      const brand = `e2e-brand-${randomUUID().slice(0, 6)}`;
      const body = { brand, name: 'S1', rangeKm: 90, topSpeedKmh: 50, batteryCapacityWh: 2000 };
      const manager = await t.asRole('CITY_MANAGER');
      await t.http().post('/api/v1/vehicle-models').set(manager.auth).send(body).expect(403);

      const created = await t.http().post('/api/v1/vehicle-models').set(admin).send(body).expect(201);
      expect(created.body).toMatchObject({ brand, name: 'S1', type: 'SCOOTER', isActive: true });
      const dup = await t.http().post('/api/v1/vehicle-models').set(admin).send(body).expect(409);
      expect(dup.body.code).toBe('MODEL_EXISTS');
      await t.http().post('/api/v1/vehicle-models').set(admin).send({ ...body, name: 'S2', rangeKm: 0 }).expect(400);
      await t.http().post('/api/v1/vehicle-models').set(admin).send({ ...body, name: 'S2', type: 'CAR' }).expect(400);

      const list = await t.http().get('/api/v1/manage/vehicle-models').set(manager.auth).expect(200);
      expect(list.body.map((m: { id: string }) => m.id)).toContain(created.body.id);
      const customer = await t.asRole('CUSTOMER');
      await t.http().get('/api/v1/manage/vehicle-models').set(customer.auth).expect(403);

      const off = await t.http().patch(`/api/v1/vehicle-models/${created.body.id}`).set(admin).send({ isActive: false }).expect(200);
      expect(off.body.isActive).toBe(false);
    });
  });

  describe('vehicles', () => {
    let city: { id: string };
    let otherCity: { id: string };
    let s1: { id: string };
    let s2: { id: string };
    let sOther: { id: string };
    let model: { id: string };
    let manager: Auth;
    let employee: Auth;

    beforeAll(async () => {
      city = await t.makeCity();
      otherCity = await t.makeCity();
      s1 = await t.makeStation(city.id, { capacity: 3 });
      s2 = await t.makeStation(city.id);
      sOther = await t.makeStation(otherCity.id);
      model = await t.makeModel();
      manager = (await t.asRole('CITY_MANAGER', { cityIds: [city.id] })).auth;
      employee = (await t.asRole('STATION_EMPLOYEE', { stationIds: [s1.id] })).auth;
    });

    const code = () => `E2E-${randomUUID().slice(0, 6).toUpperCase()}`;

    it('lets a manager add a vehicle at their station, normalising the code', async () => {
      const c = code();
      const res = await t
        .http().post('/api/v1/vehicles').set(manager)
        .send({ modelId: model.id, stationId: s2.id, code: c.toLowerCase(), registrationNumber: 'ka01ab1234', batteryPercent: 70 })
        .expect(201);
      expect(res.body).toMatchObject({ code: c, status: 'AVAILABLE', batteryPercent: 70, registrationNumber: 'KA01AB1234' });
      expect(res.body.station).toMatchObject({ id: s2.id, cityId: city.id });
    });

    it('rejects vehicles for stations outside the manager’s cities, and for employees', async () => {
      const body = { modelId: model.id, stationId: sOther.id, code: code() };
      const foreign = await t.http().post('/api/v1/vehicles').set(manager).send(body).expect(403);
      expect(foreign.body.code).toBe('FORBIDDEN_SCOPE');
      await t.http().post('/api/v1/vehicles').set(employee).send({ ...body, stationId: s1.id }).expect(403);
      await t.http().post('/api/v1/vehicles').set(admin).send({ ...body, stationId: randomUUID() }).expect(404);
    });

    it('rejects duplicate codes and unknown or inactive models', async () => {
      const c = code();
      const body = { modelId: model.id, stationId: s2.id, code: c };
      await t.http().post('/api/v1/vehicles').set(manager).send(body).expect(201);
      const dup = await t.http().post('/api/v1/vehicles').set(manager).send(body).expect(409);
      expect(dup.body.code).toBe('VEHICLE_CODE_TAKEN');
      const unknown = await t.http().post('/api/v1/vehicles').set(manager).send({ ...body, code: code(), modelId: randomUUID() }).expect(400);
      expect(unknown.body.code).toBe('MODEL_NOT_FOUND');
      await t.http().post('/api/v1/vehicles').set(manager).send({ ...body, code: 'bad code!' }).expect(400);
      await t.http().post('/api/v1/vehicles').set(manager).send({ ...body, code: code(), batteryPercent: 150 }).expect(400);
    });

    it('enforces station capacity', async () => {
      const small = await t.makeStation(city.id, { capacity: 2 });
      await t.makeVehicle(small.id, model.id);
      await t.http().post('/api/v1/vehicles').set(manager).send({ modelId: model.id, stationId: small.id, code: code() }).expect(201);
      const full = await t.http().post('/api/v1/vehicles').set(manager).send({ modelId: model.id, stationId: small.id, code: code() }).expect(409);
      expect(full.body.code).toBe('STATION_FULL');
    });

    it('updates details and moves a vehicle between stations the manager can manage', async () => {
      const v = await t.makeVehicle(s2.id, model.id);
      const updated = await t.http().patch(`/api/v1/vehicles/${v.id}`).set(manager).send({ batteryPercent: 55, odometerKm: 120.5 }).expect(200);
      expect(updated.body).toMatchObject({ batteryPercent: 55, odometerKm: 120.5 });

      const target = await t.makeStation(city.id);
      const moved = await t.http().patch(`/api/v1/vehicles/${v.id}`).set(manager).send({ stationId: target.id }).expect(200);
      expect(moved.body.station.id).toBe(target.id);

      await t.http().patch(`/api/v1/vehicles/${v.id}`).set(manager).send({ stationId: sOther.id }).expect(403);
      await t.http().patch(`/api/v1/vehicles/${v.id}`).set(employee).send({ batteryPercent: 10 }).expect(403);
    });

    it('applies the status rules per role', async () => {
      const v = await t.makeVehicle(s1.id, model.id);
      const elsewhere = await t.makeVehicle(s2.id, model.id);
      const status = (id: string, auth: Auth, value: string) =>
        t.http().patch(`/api/v1/vehicles/${id}/status`).set(auth).send({ status: value });

      // Employee: may flag maintenance at their own station only.
      const flagged = await status(v.id, employee, 'MAINTENANCE').expect(200);
      expect(flagged.body.status).toBe('MAINTENANCE');
      expect((await status(v.id, employee, 'AVAILABLE').expect(403)).body.code).toBe('FORBIDDEN_ROLE');
      await status(elsewhere.id, employee, 'MAINTENANCE').expect(403);

      // Manager: can restore it, or take it offline.
      expect((await status(v.id, manager, 'AVAILABLE').expect(200)).body.status).toBe('AVAILABLE');
      expect((await status(v.id, manager, 'OFFLINE').expect(200)).body.status).toBe('OFFLINE');

      // Nobody sets system-controlled statuses; customers have no access.
      expect((await status(v.id, admin, 'RESERVED').expect(400)).body.code).toBe('INVALID_STATUS_CHANGE');
      await status(v.id, admin, 'NOPE').expect(400);
      await status(v.id, (await t.asRole('CUSTOMER')).auth, 'MAINTENANCE').expect(403);
    });

    it('protects vehicles that are reserved or in a ride', async () => {
      const reserved = await t.makeVehicle(s2.id, model.id, { status: 'RESERVED' });
      const busy = await t.http().patch(`/api/v1/vehicles/${reserved.id}/status`).set(manager).send({ status: 'MAINTENANCE' }).expect(409);
      expect(busy.body.code).toBe('VEHICLE_BUSY');
      await t.http().patch(`/api/v1/vehicles/${reserved.id}`).set(manager).send({ batteryPercent: 1 }).expect(409);
      await t.http().delete(`/api/v1/vehicles/${reserved.id}`).set(manager).expect(409);
    });

    it('scopes vehicle lists by role and supports filters', async () => {
      const a = await t.makeVehicle(s1.id, model.id);
      const b = await t.makeVehicle(s2.id, model.id, { status: 'MAINTENANCE' });
      const x = await t.makeVehicle(sOther.id, model.id);
      const ids = (res: { body: { items: { id: string }[] } }) => res.body.items.map((v) => v.id);

      const asManager = ids(await t.http().get('/api/v1/manage/vehicles?limit=100').set(manager).expect(200));
      expect(asManager).toEqual(expect.arrayContaining([a.id, b.id]));
      expect(asManager).not.toContain(x.id);

      const asEmployee = ids(await t.http().get('/api/v1/manage/vehicles?limit=100').set(employee).expect(200));
      expect(asEmployee).toContain(a.id);
      expect(asEmployee).not.toContain(b.id);

      const maint = ids(await t.http().get(`/api/v1/manage/vehicles?status=MAINTENANCE&stationId=${s2.id}`).set(manager).expect(200));
      expect(maint).toEqual([b.id]);

      expect(ids(await t.http().get(`/api/v1/manage/vehicles?cityId=${otherCity.id}&limit=100`).set(admin).expect(200))).toContain(x.id);
      await t.http().get(`/api/v1/manage/vehicles/${x.id}`).set(manager).expect(403);
      await t.http().get(`/api/v1/manage/vehicles/${a.id}`).set(employee).expect(200);
      const customer = await t.asRole('CUSTOMER');
      await t.http().get('/api/v1/manage/vehicles').set(customer.auth).expect(403);
    });

    it('retires a vehicle: hidden everywhere and frees capacity', async () => {
      const tiny = await t.makeStation(city.id, { capacity: 1 });
      const v = await t.makeVehicle(tiny.id, model.id);
      await t.http().delete(`/api/v1/vehicles/${v.id}`).set(employee).expect(403);
      await t.http().delete(`/api/v1/vehicles/${v.id}`).set(manager).expect(204);

      await t.http().get(`/api/v1/manage/vehicles/${v.id}`).set(admin).expect(404);
      const pub = await t.http().get(`/api/v1/stations/${tiny.id}/vehicles`).expect(200);
      expect(pub.body).toHaveLength(0);
      await t.http().post('/api/v1/vehicles').set(manager).send({ modelId: model.id, stationId: tiny.id, code: code() }).expect(201);
    });
  });
});
