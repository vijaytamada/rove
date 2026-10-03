import { createHash } from 'node:crypto';
import { createTestApp, TEST_PASSWORD, type TestApp } from './helpers.js';

describe('Auth (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.cleanup());

  const register = (body: Record<string, unknown>) => t.http().post('/api/v1/auth/register').send(body);

  describe('register', () => {
    it('creates a customer and returns tokens without exposing the password hash', async () => {
      const email = t.email('reg');
      const res = await register({ email: email.toUpperCase(), password: TEST_PASSWORD, fullName: 'Asha K' }).expect(201);
      expect(res.body.user).toMatchObject({ email, role: 'CUSTOMER', status: 'ACTIVE', phoneVerified: false });
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
    });

    it('cannot self-register as staff (role is ignored/rejected)', async () => {
      const res = await register({
        email: t.email('sneaky'),
        password: TEST_PASSWORD,
        fullName: 'Sneaky',
        role: 'SUPER_ADMIN',
      }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects duplicate emails', async () => {
      const email = t.email('dup');
      await register({ email, password: TEST_PASSWORD, fullName: 'A' }).expect(201);
      const res = await register({ email, password: TEST_PASSWORD, fullName: 'B' }).expect(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    });

    it('validates input', async () => {
      const res = await register({ email: 'not-an-email', password: 'short', fullName: '' }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
      expect(res.body.details.length).toBeGreaterThanOrEqual(3);
      await register({ email: t.email(), password: TEST_PASSWORD, fullName: 'X', phone: '12345' }).expect(400);
    });
  });

  describe('login', () => {
    it('logs in with correct credentials', async () => {
      const u = await t.createUser('CUSTOMER');
      const res = await t.http().post('/api/v1/auth/login').send({ email: u.email, password: TEST_PASSWORD }).expect(200);
      expect(res.body.user.id).toBe(u.id);
      expect(res.body.expiresIn).toBeGreaterThan(0);
    });

    it('gives the same error for a wrong password and an unknown email', async () => {
      const u = await t.createUser('CUSTOMER');
      const wrong = await t.http().post('/api/v1/auth/login').send({ email: u.email, password: 'Wrong-Pass-1' }).expect(401);
      const unknown = await t.http().post('/api/v1/auth/login').send({ email: t.email('nobody'), password: 'Wrong-Pass-1' }).expect(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body).toEqual(wrong.body);
    });
  });

  describe('access control basics', () => {
    it('rejects requests without a token, and with a bad token', async () => {
      const none = await t.http().get('/api/v1/me').expect(401);
      expect(none.body.code).toBe('UNAUTHENTICATED');
      const bad = await t.http().get('/api/v1/me').set('Authorization', 'Bearer nope').expect(401);
      expect(bad.body.code).toBe('INVALID_TOKEN');
    });

    it('keeps health public', async () => {
      await t.http().get('/api/v1/health').expect(200);
    });
  });

  describe('refresh tokens', () => {
    const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

    it('rotates tokens', async () => {
      const u = await t.createUser('CUSTOMER');
      const first = await t.login(u.email);
      const rotated = await t.http().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200);
      expect(rotated.body.refreshToken).not.toBe(first.refreshToken);
      await t.http().get('/api/v1/me').set('Authorization', `Bearer ${rotated.body.accessToken}`).expect(200);
    });

    it('rejects a just-rotated token (parallel request) without revoking the new session', async () => {
      const u = await t.createUser('CUSTOMER');
      const first = await t.login(u.email);
      const rotated = await t.http().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200);

      const replay = await t.http().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      expect(replay.body.code).toBe('INVALID_REFRESH_TOKEN');
      // The new token still works.
      await t.http().post('/api/v1/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(200);
    });

    it('detects later reuse of an old refresh token and revokes all sessions', async () => {
      const u = await t.createUser('CUSTOMER');
      const first = await t.login(u.email);
      const rotated = await t.http().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200);
      // Pretend the rotation happened a minute ago.
      await t.prisma.refreshToken.update({
        where: { tokenHash: sha256(first.refreshToken) },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });

      await t.http().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      await t.http().post('/api/v1/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
    });

    it('logout revokes the refresh token', async () => {
      const u = await t.createUser('CUSTOMER');
      const { refreshToken } = await t.login(u.email);
      await t.http().post('/api/v1/auth/logout').send({ refreshToken }).expect(204);
      await t.http().post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('rejects an unknown refresh token', async () => {
      await t.http().post('/api/v1/auth/refresh').send({ refreshToken: 'x'.repeat(43) }).expect(401);
    });
  });

  describe('profile (/me)', () => {
    it('returns and updates the profile', async () => {
      const u = await t.createUser('CUSTOMER');
      const { accessToken } = await t.login(u.email);
      const auth = { Authorization: `Bearer ${accessToken}` };

      const me = await t.http().get('/api/v1/me').set(auth).expect(200);
      expect(me.body).toMatchObject({ id: u.id, role: 'CUSTOMER', scope: { cityIds: [], stationIds: [] } });

      const updated = await t.http().patch('/api/v1/me').set(auth).send({ fullName: 'New Name' }).expect(200);
      expect(updated.body.fullName).toBe('New Name');
    });

    it('does not let users change their role or status through /me', async () => {
      const u = await t.createUser('CUSTOMER');
      const { accessToken } = await t.login(u.email);
      await t.http().patch('/api/v1/me').set('Authorization', `Bearer ${accessToken}`).send({ role: 'SUPER_ADMIN' }).expect(400);
    });
  });

  describe('mock OTP phone verification', () => {
    it('requires a phone number first', async () => {
      const u = await t.createUser('CUSTOMER');
      const { accessToken } = await t.login(u.email);
      const res = await t.http().post('/api/v1/auth/otp/send').set('Authorization', `Bearer ${accessToken}`).expect(400);
      expect(res.body.code).toBe('PHONE_REQUIRED');
    });

    it('verifies a phone with the mock code, with resend cooldown and wrong-code handling', async () => {
      const u = await t.createUser('CUSTOMER', { phone: t.phone() });
      const { accessToken } = await t.login(u.email);
      const auth = { Authorization: `Bearer ${accessToken}` };

      await t.http().post('/api/v1/auth/otp/send').set(auth).expect(200);
      const tooSoon = await t.http().post('/api/v1/auth/otp/send').set(auth).expect(429);
      expect(tooSoon.body.code).toBe('OTP_RESEND_TOO_SOON');

      const wrong = await t.http().post('/api/v1/auth/otp/verify').set(auth).send({ code: '000000' }).expect(400);
      expect(wrong.body.code).toBe('OTP_INVALID');
      await t.http().post('/api/v1/auth/otp/verify').set(auth).send({ code: 'abc' }).expect(400);

      await t.http().post('/api/v1/auth/otp/verify').set(auth).send({ code: '123456' }).expect(204);
      const me = await t.http().get('/api/v1/me').set(auth).expect(200);
      expect(me.body.phoneVerified).toBe(true);
    });

    it('locks the challenge after too many wrong attempts', async () => {
      const u = await t.createUser('CUSTOMER', { phone: t.phone() });
      const { accessToken } = await t.login(u.email);
      const auth = { Authorization: `Bearer ${accessToken}` };
      await t.http().post('/api/v1/auth/otp/send').set(auth).expect(200);
      for (let i = 0; i < 5; i++) {
        await t.http().post('/api/v1/auth/otp/verify').set(auth).send({ code: '000000' }).expect(400);
      }
      const locked = await t.http().post('/api/v1/auth/otp/verify').set(auth).send({ code: '123456' }).expect(429);
      expect(locked.body.code).toBe('OTP_TOO_MANY_ATTEMPTS');
    });

    it('resets verification when the phone number changes', async () => {
      const u = await t.createUser('CUSTOMER', { phone: t.phone() });
      const { accessToken } = await t.login(u.email);
      const auth = { Authorization: `Bearer ${accessToken}` };
      await t.http().post('/api/v1/auth/otp/send').set(auth).expect(200);
      await t.http().post('/api/v1/auth/otp/verify').set(auth).send({ code: '123456' }).expect(204);

      const updated = await t.http().patch('/api/v1/me').set(auth).send({ phone: t.phone() }).expect(200);
      expect(updated.body.phoneVerified).toBe(false);
    });
  });
});
