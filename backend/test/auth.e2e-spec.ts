import { createHash } from 'node:crypto';
import { createTestApp, OTP_CODE, TEST_PASSWORD, type TestApp } from './helpers.js';

describe('Auth (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.cleanup());

  const request = (phone: string) => t.http().post('/api/v1/auth/phone/request').send({ phone });
  const verify = (phone: string, code: string = OTP_CODE) => t.http().post('/api/v1/auth/phone/verify').send({ phone, code });
  const signup = (signupToken: string, fullName: string) => t.http().post('/api/v1/auth/phone/signup').send({ signupToken, fullName });
  const clearCooldown = (phone: string) => t.redis.client.del(`otp:cooldown:login:${phone}`);

  describe('sign in with phone + code', () => {
    it('creates a customer for a new number after the name step', async () => {
      const phone = t.phone();
      const sent = await request(phone).expect(200);
      expect(sent.body).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 30 });

      const wrong = await verify(phone, '000000').expect(400);
      expect(wrong.body.code).toBe('OTP_INVALID');

      const step = await verify(phone).expect(200);
      expect(step.body.status).toBe('NEEDS_NAME');
      expect(step.body.signupToken).toEqual(expect.any(String));
      expect(step.body.accessToken).toBeUndefined();
      // Nothing is created until the name step is done.
      expect(await t.prisma.user.findUnique({ where: { phone } })).toBeNull();

      const done = await signup(step.body.signupToken, '  e2e-Asha K  ').expect(200);
      expect(done.body.user).toMatchObject({ role: 'CUSTOMER', phone, email: null, phoneVerified: true, fullName: 'e2e-Asha K' });
      expect(done.body.user.passwordHash).toBeUndefined();

      const me = await t.http().get('/api/v1/me').set('Authorization', `Bearer ${done.body.accessToken}`).expect(200);
      expect(me.body.id).toBe(done.body.user.id);
    });

    it('signs a returning customer straight in', async () => {
      const u = await t.createUser('CUSTOMER');
      await request(u.phone!).expect(200);
      const res = await verify(u.phone!).expect(200);
      expect(res.body.status).toBe('SIGNED_IN');
      expect(res.body.user.id).toBe(u.id);
      expect(res.body.signupToken).toBeUndefined();
    });

    it('marks a number verified when an unverified customer signs in with a code', async () => {
      const u = await t.createUser('CUSTOMER', { verified: false });
      await request(u.phone!).expect(200);
      const res = await verify(u.phone!).expect(200);
      expect(res.body.user.phoneVerified).toBe(true);
    });

    it('treats a sign-up ticket as single use and rejects bad names and tokens', async () => {
      const phone = t.phone();
      await request(phone).expect(200);
      const { signupToken } = (await verify(phone).expect(200)).body;

      const noName = await signup(signupToken, '   ').expect(400);
      expect(noName.body.code).toBe('VALIDATION_ERROR');
      // The failed attempt did not burn the ticket.
      await signup(signupToken, 'e2e-Ravi').expect(200);
      const reuse = await signup(signupToken, 'e2e-Ravi').expect(400);
      expect(reuse.body.code).toBe('SIGNUP_EXPIRED');
      const bogus = await signup('x'.repeat(43), 'e2e-Ravi').expect(400);
      expect(bogus.body.code).toBe('SIGNUP_EXPIRED');
    });

    it('does not reveal whether a number has an account', async () => {
      const customer = await t.createUser('CUSTOMER');
      const staff = await t.createUser('STATION_EMPLOYEE', { phone: t.phone() });
      const known = await request(customer.phone!).expect(200);
      const unknown = await request(t.phone()).expect(200);
      const staffPhone = await request(staff.phone!).expect(200);
      expect(known.body).toEqual(unknown.body);
      expect(staffPhone.body).toEqual(unknown.body);
    });

    it('never lets a staff phone number sign in with a code', async () => {
      const staff = await t.createUser('STATION_EMPLOYEE', { phone: t.phone() });
      await request(staff.phone!).expect(200);
      // No code was created for it, so even the right code is refused.
      const res = await verify(staff.phone!).expect(400);
      expect(res.body.code).toBe('OTP_EXPIRED');
    });

    it('refuses to verify without a code request, and after the code expired', async () => {
      const phone = t.phone();
      expect((await verify(phone).expect(400)).body.code).toBe('OTP_EXPIRED');
      await request(phone).expect(200);
      await t.redis.client.del(`otp:login:${phone}`);
      expect((await verify(phone).expect(400)).body.code).toBe('OTP_EXPIRED');
    });

    it('enforces the resend cooldown', async () => {
      const phone = t.phone();
      await request(phone).expect(200);
      const again = await request(phone).expect(429);
      expect(again.body.code).toBe('OTP_RESEND_TOO_SOON');
    });

    it('caps sends per number per hour', async () => {
      const phone = t.phone();
      for (let i = 0; i < 5; i++) {
        await request(phone).expect(200);
        await clearCooldown(phone);
      }
      const capped = await request(phone).expect(429);
      expect(capped.body.code).toBe('OTP_TOO_MANY_REQUESTS');
    });

    it('stops sending when the daily cap is reached', async () => {
      const key = `otp:daily:${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;
      const before = await t.redis.client.get(key);
      await t.redis.client.set(key, '999999');
      try {
        const res = await request(t.phone()).expect(503);
        expect(res.body.code).toBe('OTP_UNAVAILABLE');
      } finally {
        if (before === null) await t.redis.client.del(key);
        else await t.redis.client.set(key, before);
      }
    });

    it('locks a code after 5 wrong attempts', async () => {
      const phone = t.phone();
      await request(phone).expect(200);
      for (let i = 0; i < 5; i++) await verify(phone, '000000').expect(400);
      const locked = await verify(phone).expect(429);
      expect(locked.body.code).toBe('OTP_TOO_MANY_ATTEMPTS');
      // The challenge is gone: a new code is needed.
      expect((await verify(phone).expect(400)).body.code).toBe('OTP_EXPIRED');
    });

    it('validates the phone number and code format', async () => {
      for (const bad of ['9876543210', '+0123', 'abc', '', '+91 98765 43210']) {
        const res = await request(bad).expect(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
      await verify(t.phone(), '12345').expect(400);
      await verify(t.phone(), 'abcdef').expect(400);
    });

    it('does not sign in a disabled customer', async () => {
      const u = await t.createUser('CUSTOMER');
      await t.prisma.user.update({ where: { id: u.id }, data: { status: 'DISABLED' } });
      await request(u.phone!).expect(200);
      const res = await verify(u.phone!).expect(403);
      expect(res.body.code).toBe('ACCOUNT_DISABLED');
    });
  });

  describe('staff sign in with email + password', () => {
    it('signs staff in', async () => {
      const u = await t.createUser('STATION_EMPLOYEE');
      const res = await t.http().post('/api/v1/auth/login').send({ email: u.email, password: TEST_PASSWORD }).expect(200);
      expect(res.body.user).toMatchObject({ id: u.id, role: 'STATION_EMPLOYEE' });
      expect(res.body.expiresIn).toBeGreaterThan(0);
    });

    it('gives the same error for a wrong password and an unknown email', async () => {
      const u = await t.createUser('STATION_EMPLOYEE');
      const wrong = await t.http().post('/api/v1/auth/login').send({ email: u.email, password: 'Wrong-Pass-1' }).expect(401);
      const unknown = await t.http().post('/api/v1/auth/login').send({ email: t.email('nobody'), password: 'Wrong-Pass-1' }).expect(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body).toEqual(wrong.body);
    });

    it('never signs a customer in with a password, even if one exists', async () => {
      const u = await t.createUser('CUSTOMER');
      const email = t.email('legacy');
      const passwordHash = (await t.prisma.user.findFirstOrThrow({ where: { role: 'STATION_EMPLOYEE', email: { startsWith: 'e2e-' } } })).passwordHash;
      await t.prisma.user.update({ where: { id: u.id }, data: { email, passwordHash } });
      await t.http().post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD }).expect(401);
    });

    it('no longer offers public registration', async () => {
      await t.http().post('/api/v1/auth/register').send({ email: t.email(), password: TEST_PASSWORD, fullName: 'X' }).expect(404);
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

    it('rotates tokens (customers and staff alike)', async () => {
      for (const role of ['CUSTOMER', 'STATION_EMPLOYEE'] as const) {
        const u = await t.createUser(role);
        const first = await t.login(u);
        const rotated = await t.http().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200);
        expect(rotated.body.refreshToken).not.toBe(first.refreshToken);
        await t.http().get('/api/v1/me').set('Authorization', `Bearer ${rotated.body.accessToken}`).expect(200);
      }
    });

    it('rejects a just-rotated token (parallel request) without revoking the new session', async () => {
      const u = await t.createUser('CUSTOMER');
      const first = await t.login(u);
      const rotated = await t.http().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200);

      const replay = await t.http().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      expect(replay.body.code).toBe('INVALID_REFRESH_TOKEN');
      await t.http().post('/api/v1/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(200);
    });

    it('detects later reuse of an old refresh token and revokes all sessions', async () => {
      const u = await t.createUser('CUSTOMER');
      const first = await t.login(u);
      const rotated = await t.http().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200);
      await t.prisma.refreshToken.update({
        where: { tokenHash: sha256(first.refreshToken) },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });

      await t.http().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      await t.http().post('/api/v1/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
    });

    it('logout revokes the refresh token', async () => {
      const u = await t.createUser('CUSTOMER');
      const { refreshToken } = await t.login(u);
      await t.http().post('/api/v1/auth/logout').send({ refreshToken }).expect(204);
      await t.http().post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('rejects an unknown refresh token', async () => {
      await t.http().post('/api/v1/auth/refresh').send({ refreshToken: 'x'.repeat(43) }).expect(401);
    });
  });

  describe('profile (/me)', () => {
    it('returns and updates the profile of a phone-only customer', async () => {
      const u = await t.asRole('CUSTOMER');
      const me = await t.http().get('/api/v1/me').set(u.auth).expect(200);
      expect(me.body).toMatchObject({ id: u.id, role: 'CUSTOMER', email: null, phone: u.phone, phoneVerified: true, scope: { cityIds: [], stationIds: [] } });

      const updated = await t.http().patch('/api/v1/me').set(u.auth).send({ fullName: 'New Name' }).expect(200);
      expect(updated.body.fullName).toBe('New Name');
    });

    it('does not let users change their role, status or email through /me', async () => {
      const u = await t.asRole('CUSTOMER');
      for (const body of [{ role: 'SUPER_ADMIN' }, { status: 'ACTIVE' }, { email: 'a@b.co' }]) {
        await t.http().patch('/api/v1/me').set(u.auth).send(body).expect(400);
      }
    });

    it('resets verification when the phone changes, then verifies the new number with a code', async () => {
      const u = await t.asRole('CUSTOMER');
      const newPhone = t.phone();
      const changed = await t.http().patch('/api/v1/me').set(u.auth).send({ phone: newPhone }).expect(200);
      expect(changed.body).toMatchObject({ phone: newPhone, phoneVerified: false });

      await t.http().post('/api/v1/auth/otp/send').set(u.auth).expect(200);
      const tooSoon = await t.http().post('/api/v1/auth/otp/send').set(u.auth).expect(429);
      expect(tooSoon.body.code).toBe('OTP_RESEND_TOO_SOON');
      const wrong = await t.http().post('/api/v1/auth/otp/verify').set(u.auth).send({ code: '000000' }).expect(400);
      expect(wrong.body.code).toBe('OTP_INVALID');
      await t.http().post('/api/v1/auth/otp/verify').set(u.auth).send({ code: 'abc' }).expect(400);
      await t.http().post('/api/v1/auth/otp/verify').set(u.auth).send({ code: OTP_CODE }).expect(204);

      const me = await t.http().get('/api/v1/me').set(u.auth).expect(200);
      expect(me.body.phoneVerified).toBe(true);
      await t.http().post('/api/v1/auth/otp/send').set(u.auth).expect(409);
    });

    it('rejects a phone number that belongs to someone else', async () => {
      const a = await t.asRole('CUSTOMER');
      const b = await t.createUser('CUSTOMER');
      const res = await t.http().patch('/api/v1/me').set(a.auth).send({ phone: b.phone }).expect(409);
      expect(res.body.code).toBe('PHONE_TAKEN');
    });

    it('requires a phone before verification can be requested', async () => {
      const staff = await t.asRole('STATION_EMPLOYEE');
      const res = await t.http().post('/api/v1/auth/otp/send').set(staff.auth).expect(400);
      expect(res.body.code).toBe('PHONE_REQUIRED');
    });

    it('locks the profile verification code after too many wrong attempts', async () => {
      const u = await t.asRole('CUSTOMER');
      await t.http().patch('/api/v1/me').set(u.auth).send({ phone: t.phone() }).expect(200);
      await t.http().post('/api/v1/auth/otp/send').set(u.auth).expect(200);
      for (let i = 0; i < 5; i++) await t.http().post('/api/v1/auth/otp/verify').set(u.auth).send({ code: '000000' }).expect(400);
      const locked = await t.http().post('/api/v1/auth/otp/verify').set(u.auth).send({ code: OTP_CODE }).expect(429);
      expect(locked.body.code).toBe('OTP_TOO_MANY_ATTEMPTS');
    });
  });
});
