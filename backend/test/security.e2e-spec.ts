import { createTestApp, OTP_CODE, TEST_PASSWORD, type TestApp } from './helpers.js';

describe('Security and robustness (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.cleanup());

  describe('response headers', () => {
    it('sets baseline security headers and hides the framework', async () => {
      const res = await t.http().get('/api/v1/health').expect(200);
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
    });

    it('also sets them on error responses', async () => {
      const res = await t.http().get('/api/v1/me').expect(401);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('hostile input', () => {
    it('rejects oversized bodies with 413 and a stable code', async () => {
      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(2_000_000) }))
        .expect(413);
      expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rejects malformed JSON with 400 and no parser details', async () => {
      const res = await t.http().post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{not json').expect(400);
      expect(res.body.statusCode).toBe(400);
      expect(JSON.stringify(res.body)).not.toMatch(/position|Unexpected/);
    });

    it('treats injection-style input as plain data', async () => {
      const phone = t.phone();
      await t.http().post('/api/v1/auth/phone/request').send({ phone }).expect(200);
      const step = await t.http().post('/api/v1/auth/phone/verify').send({ phone, code: OTP_CODE }).expect(200);
      const res = await t
        .http()
        .post('/api/v1/auth/phone/signup')
        .send({ signupToken: step.body.signupToken, fullName: `e2e-Robert'); DROP TABLE "User";--` })
        .expect(200);
      expect(res.body.user.fullName).toContain('DROP TABLE');
      const admin = await t.asRole('SUPER_ADMIN');
      await t.http().get("/api/v1/manage/vehicles?status=' OR 1=1--").set(admin.auth).expect(400);
    });
  });

  describe('login brute-force protection', () => {
    const attempt = (email: string, password: string) => t.http().post('/api/v1/auth/login').send({ email, password });

    it('locks an email after 10 failures, even for the correct password', async () => {
      const user = await t.createUser('STATION_EMPLOYEE');
      for (let i = 0; i < 10; i++) {
        const res = await attempt(user.email!, `wrong-${i}`).expect(401);
        expect(res.body.code).toBe('INVALID_CREDENTIALS');
      }
      const locked = await attempt(user.email!, TEST_PASSWORD).expect(429);
      expect(locked.body.code).toBe('TOO_MANY_ATTEMPTS');
      expect(locked.body.message).toMatch(/minute/);
    });

    it('locks unknown emails the same way, so registered emails are not revealed', async () => {
      const email = t.email('ghost');
      for (let i = 0; i < 10; i++) await attempt(email, `wrong-${i}`).expect(401);
      const locked = await attempt(email, 'anything').expect(429);
      expect(locked.body.code).toBe('TOO_MANY_ATTEMPTS');
    });

    it('resets the counter after a successful sign-in', async () => {
      const user = await t.createUser('STATION_EMPLOYEE');
      for (let i = 0; i < 9; i++) await attempt(user.email!, `wrong-${i}`).expect(401);
      await attempt(user.email!, TEST_PASSWORD).expect(200);
      // Nine more failures would have locked it had the counter not been reset.
      for (let i = 0; i < 9; i++) await attempt(user.email!, `again-${i}`).expect(401);
      await attempt(user.email!, TEST_PASSWORD).expect(200);
    });

    it('does not lock other accounts', async () => {
      const a = await t.createUser('STATION_EMPLOYEE');
      const b = await t.createUser('STATION_EMPLOYEE');
      for (let i = 0; i < 10; i++) await attempt(a.email!, `wrong-${i}`).expect(401);
      await attempt(a.email!, TEST_PASSWORD).expect(429);
      await attempt(b.email!, TEST_PASSWORD).expect(200);
    });
  });
});
