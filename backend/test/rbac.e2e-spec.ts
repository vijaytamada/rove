import { randomUUID } from 'node:crypto';
import { createTestApp, TEST_PASSWORD, type TestApp } from './helpers.js';

describe('RBAC (e2e)', () => {
  let t: TestApp;
  let adminAuth: { Authorization: string };

  beforeAll(async () => {
    t = await createTestApp();
    const admin = await t.createUser('SUPER_ADMIN');
    adminAuth = { Authorization: `Bearer ${(await t.login(admin.email)).accessToken}` };
  });
  afterAll(() => t.cleanup());

  const asRole = async (role: 'CUSTOMER' | 'CITY_MANAGER' | 'STATION_EMPLOYEE') => {
    const u = await t.createUser(role);
    return { ...u, auth: { Authorization: `Bearer ${(await t.login(u.email)).accessToken}` } };
  };

  describe('role checks', () => {
    it.each(['CUSTOMER', 'CITY_MANAGER', 'STATION_EMPLOYEE'] as const)('%s cannot use user administration', async (role) => {
      const u = await asRole(role);
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

  describe('creating staff', () => {
    it('creates a city manager with city assignments and exposes scope on /me', async () => {
      const cityA = randomUUID();
      const cityB = randomUUID();
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
          assignments: [{ cityId: cityA }, { cityId: cityB }, { cityId: cityA }],
        })
        .expect(201);
      expect(created.body.role).toBe('CITY_MANAGER');
      expect(created.body.scope.cityIds.sort()).toEqual([cityA, cityB].sort());

      const { accessToken } = await t.login(email);
      const me = await t.http().get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
      expect(me.body.scope.cityIds.sort()).toEqual([cityA, cityB].sort());
      expect(me.body.scope.stationIds).toEqual([]);
    });

    it('creates a station employee and replaces assignments', async () => {
      const stationA = randomUUID();
      const stationB = randomUUID();
      const created = await t
        .http()
        .post('/api/v1/users')
        .set(adminAuth)
        .send({
          email: t.email('emp'),
          password: TEST_PASSWORD,
          fullName: 'Employee',
          role: 'STATION_EMPLOYEE',
          assignments: [{ stationId: stationA }],
        })
        .expect(201);
      const updated = await t
        .http()
        .put(`/api/v1/users/${created.body.id}/assignments`)
        .set(adminAuth)
        .send({ assignments: [{ stationId: stationB }] })
        .expect(200);
      expect(updated.body.scope).toEqual({ cityIds: [], stationIds: [stationB] });
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
