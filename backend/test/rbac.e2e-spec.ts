import { randomUUID } from 'node:crypto';
import { createTestApp, TEST_PASSWORD, type Auth, type TestApp } from './helpers.js';

describe('RBAC and staff management (e2e)', () => {
  let t: TestApp;
  let adminAuth: Auth;

  beforeAll(async () => {
    t = await createTestApp();
    adminAuth = (await t.asRole('SUPER_ADMIN')).auth;
  });
  afterAll(() => t.cleanup());

  describe('role checks', () => {
    it.each(['CUSTOMER', 'STATION_EMPLOYEE'] as const)('%s cannot use user administration', async (role) => {
      const u = await t.asRole(role);
      const list = await t.http().get('/api/v1/users').set(u.auth).expect(403);
      expect(list.body.code).toBe('FORBIDDEN_ROLE');
      await t.http().post('/api/v1/users').set(u.auth).send({}).expect(403);
      await t.http().patch(`/api/v1/users/${u.id}`).set(u.auth).send({ status: 'ACTIVE' }).expect(403);
      await t.http().put(`/api/v1/users/${u.id}/assignments`).set(u.auth).send({ assignments: [] }).expect(403);
    });

    it('super admin can list users, filtered by role and paginated', async () => {
      await t.createUser('CUSTOMER');
      const res = await t.http().get('/api/v1/users?role=CUSTOMER&limit=2&page=1').set(adminAuth).expect(200);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      expect(res.body.items.every((u: { role: string }) => u.role === 'CUSTOMER')).toBe(true);
      expect(res.body).toMatchObject({ page: 1, limit: 2 });
      await t.http().get('/api/v1/users?limit=1000').set(adminAuth).expect(400);
    });
  });

  describe('super admin creating staff', () => {
    it('creates a city manager with city assignments and exposes scope on /me', async () => {
      const cityA = await t.makeCity();
      const cityB = await t.makeCity();
      const email = t.email('mgr');
      const created = await t
        .http()
        .post('/api/v1/users')
        .set(adminAuth)
        .send({
          email,
          password: TEST_PASSWORD,
          fullName: 'City Mgr',
          role: 'CITY_MANAGER',
          assignments: [{ cityId: cityA.id }, { cityId: cityB.id }, { cityId: cityA.id }],
        })
        .expect(201);
      expect(created.body.role).toBe('CITY_MANAGER');
      expect(created.body.scope.cityIds.sort()).toEqual([cityA.id, cityB.id].sort());

      const { accessToken } = await t.login(email);
      const me = await t.http().get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
      expect(me.body.scope.cityIds.sort()).toEqual([cityA.id, cityB.id].sort());
      expect(me.body.scope.stationIds).toEqual([]);
    });

    it('creates a station employee and replaces assignments', async () => {
      const city = await t.makeCity();
      const stationA = await t.makeStation(city.id);
      const stationB = await t.makeStation(city.id);
      const created = await t
        .http()
        .post('/api/v1/users')
        .set(adminAuth)
        .send({
          email: t.email('emp'),
          password: TEST_PASSWORD,
          fullName: 'Employee',
          role: 'STATION_EMPLOYEE',
          assignments: [{ stationId: stationA.id }],
        })
        .expect(201);
      const updated = await t
        .http()
        .put(`/api/v1/users/${created.body.id}/assignments`)
        .set(adminAuth)
        .send({ assignments: [{ stationId: stationB.id }] })
        .expect(200);
      expect(updated.body.scope).toEqual({ cityIds: [], stationIds: [stationB.id] });
    });

    it('rejects assignments that do not fit the role', async () => {
      const body = { email: t.email('bad'), password: TEST_PASSWORD, fullName: 'Bad' };
      const mgrWithStation = await t
        .http()
        .post('/api/v1/users')
        .set(adminAuth)
        .send({ ...body, role: 'CITY_MANAGER', assignments: [{ stationId: randomUUID() }] })
        .expect(400);
      expect(mgrWithStation.body.code).toBe('INVALID_ASSIGNMENT');

      await t.http().post('/api/v1/users').set(adminAuth)
        .send({ ...body, email: t.email('bad2'), role: 'STATION_EMPLOYEE', assignments: [{ cityId: randomUUID() }] })
        .expect(400);
      await t.http().post('/api/v1/users').set(adminAuth)
        .send({ ...body, email: t.email('bad3'), role: 'SUPER_ADMIN', assignments: [{ cityId: randomUUID() }] })
        .expect(400);
      await t.http().post('/api/v1/users').set(adminAuth)
        .send({ ...body, email: t.email('bad4'), role: 'CITY_MANAGER', assignments: [{ cityId: randomUUID(), stationId: randomUUID() }] })
        .expect(400);
    });

    it('rejects assignments to cities and stations that do not exist', async () => {
      const body = { email: t.email('ghost'), password: TEST_PASSWORD, fullName: 'Ghost' };
      const city = await t
        .http().post('/api/v1/users').set(adminAuth)
        .send({ ...body, role: 'CITY_MANAGER', assignments: [{ cityId: randomUUID() }] })
        .expect(400);
      expect(city.body.code).toBe('UNKNOWN_CITY');
      const station = await t
        .http().post('/api/v1/users').set(adminAuth)
        .send({ ...body, email: t.email('ghost2'), role: 'STATION_EMPLOYEE', assignments: [{ stationId: randomUUID() }] })
        .expect(400);
      expect(station.body.code).toBe('UNKNOWN_STATION');
    });

    it('requires a city for managers and a station for employees', async () => {
      const mgr = await t.http().post('/api/v1/users').set(adminAuth)
        .send({ email: t.email('nomgr'), password: TEST_PASSWORD, fullName: 'M', role: 'CITY_MANAGER' })
        .expect(400);
      expect(mgr.body.code).toBe('INVALID_ASSIGNMENT');
      const emp = await t.http().post('/api/v1/users').set(adminAuth)
        .send({ email: t.email('noemp'), password: TEST_PASSWORD, fullName: 'E', role: 'STATION_EMPLOYEE', assignments: [] })
        .expect(400);
      expect(emp.body.code).toBe('INVALID_ASSIGNMENT');
      // Super admins need no assignment.
      await t.http().post('/api/v1/users').set(adminAuth)
        .send({ email: t.email('adm2'), password: TEST_PASSWORD, fullName: 'A', role: 'SUPER_ADMIN' })
        .expect(201);
    });

    it('does not create customers through the staff endpoint', async () => {
      const res = await t
        .http()
        .post('/api/v1/users')
        .set(adminAuth)
        .send({ email: t.email('cust'), password: TEST_PASSWORD, fullName: 'C', role: 'CUSTOMER' })
        .expect(400);
      expect(res.body.code).toBe('INVALID_ROLE');
    });
  });

  describe('city managers managing employees in their own cities', () => {
    let cityA: { id: string };
    let cityB: { id: string };
    let stationA: { id: string };
    let stationA2: { id: string };
    let stationB: { id: string };
    let manager: Auth;

    beforeAll(async () => {
      cityA = await t.makeCity();
      cityB = await t.makeCity();
      stationA = await t.makeStation(cityA.id);
      stationA2 = await t.makeStation(cityA.id);
      stationB = await t.makeStation(cityB.id);
      manager = (await t.asRole('CITY_MANAGER', { cityIds: [cityA.id] })).auth;
    });

    const employee = (assignments: unknown[], extra: Record<string, unknown> = {}) => ({
      email: t.email('emp'),
      password: TEST_PASSWORD,
      fullName: 'Employee',
      role: 'STATION_EMPLOYEE',
      assignments,
      ...extra,
    });

    it('can create an employee for a station in their city', async () => {
      const res = await t.http().post('/api/v1/users').set(manager).send(employee([{ stationId: stationA.id }])).expect(201);
      expect(res.body.role).toBe('STATION_EMPLOYEE');
      expect(res.body.scope.stationIds).toEqual([stationA.id]);
    });

    it("cannot assign a station in another manager's city", async () => {
      const res = await t.http().post('/api/v1/users').set(manager).send(employee([{ stationId: stationB.id }])).expect(403);
      expect(res.body.code).toBe('FORBIDDEN_SCOPE');
    });

    it('needs at least one station, and cannot create other roles', async () => {
      const none = await t.http().post('/api/v1/users').set(manager).send(employee([])).expect(400);
      expect(none.body.code).toBe('INVALID_ASSIGNMENT');
      const mgr = await t
        .http().post('/api/v1/users').set(manager)
        .send(employee([{ cityId: cityA.id }], { role: 'CITY_MANAGER' }))
        .expect(403);
      expect(mgr.body.code).toBe('FORBIDDEN_ROLE');
      await t.http().post('/api/v1/users').set(manager).send(employee([], { role: 'SUPER_ADMIN' })).expect(403);
    });

    it('lists only employees working in their cities', async () => {
      const inCity = await t.createUser('STATION_EMPLOYEE', { stationIds: [stationA2.id] });
      const elsewhere = await t.createUser('STATION_EMPLOYEE', { stationIds: [stationB.id] });
      const res = await t.http().get('/api/v1/users?limit=100').set(manager).expect(200);
      const ids = res.body.items.map((u: { id: string }) => u.id);
      expect(ids).toContain(inCity.id);
      expect(ids).not.toContain(elsewhere.id);
      expect(res.body.items.every((u: { role: string }) => u.role === 'STATION_EMPLOYEE')).toBe(true);
    });

    it('can update an employee of their city, but not one of another city or a non-employee', async () => {
      const mine = await t.createUser('STATION_EMPLOYEE', { stationIds: [stationA.id] });
      const theirs = await t.createUser('STATION_EMPLOYEE', { stationIds: [stationB.id] });
      const customer = await t.createUser('CUSTOMER');

      await t.http().patch(`/api/v1/users/${mine.id}`).set(manager).send({ fullName: 'Renamed' }).expect(200);
      const denied = await t.http().patch(`/api/v1/users/${theirs.id}`).set(manager).send({ status: 'DISABLED' }).expect(403);
      expect(denied.body.code).toBe('FORBIDDEN_SCOPE');
      await t.http().get(`/api/v1/users/${theirs.id}`).set(manager).expect(403);
      await t.http().patch(`/api/v1/users/${customer.id}`).set(manager).send({ status: 'DISABLED' }).expect(403);
    });

    it('can move an employee between stations of their city only', async () => {
      const mine = await t.createUser('STATION_EMPLOYEE', { stationIds: [stationA.id] });
      const ok = await t
        .http().put(`/api/v1/users/${mine.id}/assignments`).set(manager)
        .send({ assignments: [{ stationId: stationA2.id }] })
        .expect(200);
      expect(ok.body.scope.stationIds).toEqual([stationA2.id]);

      await t
        .http().put(`/api/v1/users/${mine.id}/assignments`).set(manager)
        .send({ assignments: [{ stationId: stationB.id }] })
        .expect(403);
      await t
        .http().put(`/api/v1/users/${mine.id}/assignments`).set(manager)
        .send({ assignments: [] })
        .expect(400);
    });
  });

  describe('disabling users', () => {
    it('blocks login and refresh for a disabled user and revokes their sessions', async () => {
      const u = await t.createUser('STATION_EMPLOYEE');
      const { refreshToken } = await t.login(u.email);

      await t.http().patch(`/api/v1/users/${u.id}`).set(adminAuth).send({ status: 'DISABLED' }).expect(200);

      const login = await t.http().post('/api/v1/auth/login').send({ email: u.email, password: TEST_PASSWORD }).expect(403);
      expect(login.body.code).toBe('ACCOUNT_DISABLED');
      await t.http().post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);

      await t.http().patch(`/api/v1/users/${u.id}`).set(adminAuth).send({ status: 'ACTIVE' }).expect(200);
      await t.http().post('/api/v1/auth/login').send({ email: u.email, password: TEST_PASSWORD }).expect(200);
    });

    it('does not let an admin disable their own account', async () => {
      const me = await t.http().get('/api/v1/me').set(adminAuth).expect(200);
      const res = await t.http().patch(`/api/v1/users/${me.body.id}`).set(adminAuth).send({ status: 'DISABLED' }).expect(400);
      expect(res.body.code).toBe('CANNOT_DISABLE_SELF');
    });

    it('returns 404 for unknown users and 400 for malformed ids', async () => {
      await t.http().get(`/api/v1/users/${randomUUID()}`).set(adminAuth).expect(404);
      await t.http().get('/api/v1/users/not-a-uuid').set(adminAuth).expect(400);
    });
  });
});
