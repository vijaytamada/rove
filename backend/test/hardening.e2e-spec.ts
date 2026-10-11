import { MAX_LOGIN_FAILURES_PER_IP } from '../src/modules/auth/login-throttle.service.js';
import { createTestApp, TEST_PASSWORD, type TestApp } from './helpers.js';

describe('Hardening: per-IP limits, client IP, request ids (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.cleanup());

  const api = (path: string) => `/api/v1${path}`;
  // 203.0.113.0/24 is reserved for documentation: safe fake client addresses, and cleanup knows to remove their counters.
  const freshIp = () => `203.0.113.${1 + Math.floor(Math.random() * 253)}`;

  /** Sends `n` requests as `ip` in parallel batches; returns every response status. */
  async function flood(n: number, ip: string, send: (ip: string, i: number) => Promise<{ status: number }>) {
    const statuses: number[] = [];
    for (let done = 0; done < n; done += 25) {
      const batch = Array.from({ length: Math.min(25, n - done) }, (_, i) => send(ip, done + i));
      statuses.push(...(await Promise.all(batch)).map((r) => r.status));
    }
    return statuses;
  }
  const quote = (ip: string) => t.http().post(api('/bookings/quote')).set('X-Forwarded-For', ip).send({});

  describe('public price quote', () => {
    it('allows 120 a minute per client IP, then answers 429 with Retry-After; another IP is not affected', async () => {
      const ip = freshIp();
      const statuses = await flood(121, ip, (i) => quote(i));
      expect(statuses.filter((s) => s === 429)).toHaveLength(1);
      expect(statuses.filter((s) => s !== 429)).toHaveLength(120);

      const refused = await quote(ip).expect(429);
      expect(refused.body).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
      expect(Number(refused.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      expect(Number(refused.headers['retry-after'])).toBeLessThanOrEqual(60);

      const other = freshIp() === ip ? '203.0.113.254' : freshIp();
      expect((await quote(other)).status).not.toBe(429);
    });

    it('cannot be dodged by adding fake addresses at the front of X-Forwarded-For', async () => {
      const real = freshIp();
      const statuses = await flood(125, real, (ip, i) => t.http().post(api('/bookings/quote')).set('X-Forwarded-For', `10.${i % 250}.1.1, ${ip}`).send({}));
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('public browsing', () => {
    it('allows 300 a minute per client IP', async () => {
      const ip = freshIp();
      const statuses = await flood(301, ip, (i) => t.http().get(api('/cities')).set('X-Forwarded-For', i));
      expect(statuses.filter((s) => s === 429)).toHaveLength(1);
      expect(statuses.filter((s) => s === 200)).toHaveLength(300);
    });
  });

  describe('one-time codes', () => {
    it('allows 20 code requests an hour per IP across different phone numbers', async () => {
      const ip = freshIp();
      const send = () => t.http().post(api('/auth/phone/request')).set('X-Forwarded-For', ip).send({ phone: t.phone() });
      const statuses: number[] = [];
      for (let i = 0; i < 21; i++) statuses.push((await send()).status);
      expect(statuses.slice(0, 20).every((s) => s !== 429)).toBe(true);
      expect(statuses[20]).toBe(429);
    });
  });

  describe('staff sign-in', () => {
    const attempt = (ip: string, email: string, password = 'wrong-password-123') =>
      t.http().post(api('/auth/login')).set('X-Forwarded-For', ip).send({ email, password });

    it('refuses an IP after 50 failed sign-ins across different emails, even for a fresh email or a right password', async () => {
      const ip = freshIp();
      const staff = await t.createUser('STATION_EMPLOYEE', {});
      for (let i = 0; i < MAX_LOGIN_FAILURES_PER_IP; i++) {
        const res = await attempt(ip, t.email(`probe-${i}`));
        expect(res.status).toBe(401);
      }
      const blocked = await attempt(ip, t.email('fresh'));
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe('TOO_MANY_ATTEMPTS');
      expect((await attempt(ip, staff.email!, TEST_PASSWORD)).status).toBe(429);

      // Another address is unaffected.
      const elsewhere = freshIp() === ip ? '203.0.113.253' : freshIp();
      expect((await attempt(elsewhere, staff.email!, TEST_PASSWORD)).status).toBe(200);
    }, 60_000);

    it('a successful sign-in does not wipe the address\'s failure count (so it cannot be used to reset it)', async () => {
      const ip = freshIp();
      const staff = await t.createUser('STATION_EMPLOYEE', {});
      for (let i = 0; i < 3; i++) await attempt(ip, t.email(`miss-${i}`)).expect(401);
      await attempt(ip, staff.email!, TEST_PASSWORD).expect(200);
      expect(await t.redis.client.get(`login:ip:${ip}`)).toBe('3');
    });
  });

  describe('request ids', () => {
    it('every response carries X-Request-Id, and an error body repeats it', async () => {
      const res = await t.http().get(api('/nope')).expect(404);
      const id = res.headers['x-request-id'];
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.requestId).toBe(id);
      const ok = await t.http().get(api('/health')).expect(200);
      expect(ok.headers['x-request-id']).toBeTruthy();
    });

    it('keeps a safe id sent by the caller and ignores an unsafe one', async () => {
      const mine = await t.http().get(api('/nope')).set('X-Request-Id', 'trace-0001-abcd').expect(404);
      expect(mine.headers['x-request-id']).toBe('trace-0001-abcd');
      expect(mine.body.requestId).toBe('trace-0001-abcd');
      const unsafe = await t.http().get(api('/nope')).set('X-Request-Id', '<script>alert(1)</script>').expect(404);
      expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('a validation error and a login error also carry it', async () => {
      const res = await t.http().post(api('/auth/login')).send({ email: 'not-an-email' }).expect(400);
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
    });
  });
});
