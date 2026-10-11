import { ConfigService } from '@nestjs/config';
import { signHmacSha256Hex } from '../src/common/webhook-signature.js';
import { MOCK_KYC_SIGNATURE_HEADER } from '../src/providers/kyc/mock-kyc.provider.js';
import { createTestApp, type TestApp } from './helpers.js';

describe('Identity check: states, retries, signed webhook (e2e)', () => {
  let t: TestApp;
  let secret: string;

  beforeAll(async () => {
    t = await createTestApp();
    secret = t.app.get(ConfigService).get<string>('KYC_WEBHOOK_SECRET')!;
  });
  afterAll(() => t.cleanup());

  const api = (path: string) => `/api/v1${path}`;

  /** A signed-in customer whose name steers the mock provider (REJECT, PENDING, or neither). */
  async function customer(nameHint = '') {
    const c = await t.asRole('CUSTOMER');
    if (nameHint) await t.prisma.user.update({ where: { id: c.id }, data: { fullName: `e2e-${nameHint} Rider` } });
    return c;
  }
  const start = (c: { auth: { Authorization: string } }) => t.http().post(api('/kyc/start')).set(c.auth).send({ consent: true });
  const status = async (c: { auth: { Authorization: string } }) => (await t.http().get(api('/kyc/status')).set(c.auth).expect(200)).body;
  const record = (userId: string) => t.prisma.kycRecord.findUniqueOrThrow({ where: { userId } });
  const audit = (userId: string) =>
    t.prisma.auditLog.findMany({ where: { entityId: userId, entityType: 'user' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const inbox = async (c: { auth: { Authorization: string } }) =>
    (await t.http().get(api('/notifications')).set(c.auth).expect(200)).body.items as { type: string; body: string; bookingId: string | null }[];

  /** Posts a webhook exactly as the provider would: JSON body, signature over those exact bytes. */
  function webhook(payload: unknown, opts: { secret?: string; signature?: string | null; raw?: string } = {}) {
    const raw = opts.raw ?? JSON.stringify(payload);
    const req = t.http().post(api('/webhooks/kyc')).set('Content-Type', 'application/json');
    if (opts.signature !== null) req.set(MOCK_KYC_SIGNATURE_HEADER, opts.signature ?? signHmacSha256Hex(raw, opts.secret ?? secret));
    return req.send(raw);
  }

  describe('starting a check', () => {
    it('an ordinary customer is verified at once, with the tries they have left, and it is recorded', async () => {
      const c = await customer();
      expect(await status(c)).toMatchObject({ status: 'NOT_STARTED', attemptsLeft: 3 });
      const res = await start(c).expect(200);
      expect(res.body).toMatchObject({ status: 'VERIFIED', attemptsLeft: 2, rejectionReason: null });
      expect((await record(c.id)).attempts).toBe(1);
      expect((await audit(c.id)).map((a) => [a.action, a.actorId])).toEqual([
        ['KYC_STARTED', c.id],
        ['KYC_VERIFIED', c.id],
      ]);
      // Starting again changes nothing.
      await start(c).expect(200);
      expect((await record(c.id)).attempts).toBe(1);
    });

    it('needs consent and a customer login', async () => {
      const c = await customer();
      await t.http().post(api('/kyc/start')).set(c.auth).send({ consent: false }).expect(400);
      await t.http().post(api('/kyc/start')).send({ consent: true }).expect(401);
      expect(await t.prisma.kycRecord.count({ where: { userId: c.id } })).toBe(0);
    });
  });

  describe('a check that finishes later (pending, then the provider calls back)', () => {
    it('stays pending, blocks booking, and is not started twice', async () => {
      const c = await customer('PENDING');
      const first = await start(c).expect(200);
      expect(first.body.status).toBe('PENDING');
      const ref = (await record(c.id)).providerRef;
      const again = await start(c).expect(200);
      expect(again.body.status).toBe('PENDING');
      expect((await record(c.id)).providerRef).toBe(ref);
      expect((await record(c.id)).attempts).toBe(1);

      const setup = await t.makeBookable();
      const blocked = await t.http().post(api('/bookings')).set(c.auth).send({ vehicleId: setup.vehicleIds[0], hours: 1 }).expect(403);
      expect(blocked.body.code).toBe('KYC_REQUIRED');
    });

    it('a signed VERIFIED webhook verifies the customer, lets them book, tells them and is recorded as the system', async () => {
      const c = await customer('PENDING');
      await start(c).expect(200);
      const ref = (await record(c.id)).providerRef;

      await webhook({ providerRef: ref, status: 'VERIFIED' }).expect(200, { received: true });
      expect(await status(c)).toMatchObject({ status: 'VERIFIED' });
      const setup = await t.makeBookable();
      await t.http().post(api('/bookings')).set(c.auth).send({ vehicleId: setup.vehicleIds[0], hours: 1 }).expect(201);

      const messages = await inbox(c);
      expect(messages.filter((m) => m.type === 'KYC_VERIFIED')).toHaveLength(1);
      expect(messages.find((m) => m.type === 'KYC_VERIFIED')!.body).toContain('book a scooter');
      const trail = await audit(c.id);
      expect(trail.map((a) => a.action)).toEqual(['KYC_STARTED', 'KYC_VERIFIED']);
      expect(trail[1]).toMatchObject({ actorId: null, actorRole: null, details: expect.objectContaining({ via: 'webhook' }) });
    });

    it('a signed REJECTED webhook rejects with the reason, tells the customer and allows a retry', async () => {
      const c = await customer('PENDING');
      await start(c).expect(200);
      const ref = (await record(c.id)).providerRef;
      await webhook({ providerRef: ref, status: 'REJECTED', rejectionReason: 'The photo was blurry.' }).expect(200);

      expect(await status(c)).toMatchObject({ status: 'REJECTED', rejectionReason: 'The photo was blurry.', attemptsLeft: 2 });
      const rejected = (await inbox(c)).find((m) => m.type === 'KYC_REJECTED')!;
      expect(rejected.body).toContain('The photo was blurry');
      expect(rejected.body).toContain('2 tries left');

      // The retry is a new attempt with a new provider reference.
      await t.prisma.user.update({ where: { id: c.id }, data: { fullName: 'e2e-Ordinary Rider' } });
      const retry = await start(c).expect(200);
      expect(retry.body.status).toBe('VERIFIED');
      expect((await record(c.id)).attempts).toBe(2);
      expect((await record(c.id)).providerRef).not.toBe(ref);
    });

    it('a repeat of the same webhook, and a late contradiction, change nothing and send nothing more', async () => {
      const c = await customer('PENDING');
      await start(c).expect(200);
      const ref = (await record(c.id)).providerRef;
      await webhook({ providerRef: ref, status: 'VERIFIED' }).expect(200);
      await webhook({ providerRef: ref, status: 'VERIFIED' }).expect(200);
      await webhook({ providerRef: ref, status: 'REJECTED', rejectionReason: 'late' }).expect(200);

      expect(await status(c)).toMatchObject({ status: 'VERIFIED', rejectionReason: null });
      expect((await inbox(c)).filter((m) => m.type.startsWith('KYC'))).toHaveLength(1);
      expect((await audit(c.id)).map((a) => a.action)).toEqual(['KYC_STARTED', 'KYC_VERIFIED']);
    });

    it('parallel copies of one webhook are applied once', async () => {
      const c = await customer('PENDING');
      await start(c).expect(200);
      const ref = (await record(c.id)).providerRef;
      const res = await Promise.all(Array.from({ length: 5 }, () => webhook({ providerRef: ref, status: 'REJECTED', rejectionReason: 'no' })));
      expect(res.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect((await inbox(c)).filter((m) => m.type === 'KYC_REJECTED')).toHaveLength(1);
      expect((await audit(c.id)).filter((a) => a.action === 'KYC_REJECTED')).toHaveLength(1);
    });

    it('a webhook for an old attempt is ignored once a new one has started', async () => {
      const c = await customer('PENDING');
      await start(c).expect(200);
      const oldRef = (await record(c.id)).providerRef!;
      // The provider never answered; after the wait the customer starts again.
      await t.prisma.$executeRaw`UPDATE "KycRecord" SET "updatedAt" = now() - interval '20 minutes' WHERE "userId" = ${c.id}::uuid`;
      await start(c).expect(200);
      const fresh = await record(c.id);
      expect(fresh.attempts).toBe(2);
      expect(fresh.providerRef).not.toBe(oldRef);

      await webhook({ providerRef: oldRef, status: 'VERIFIED' }).expect(200);
      expect((await status(c)).status).toBe('PENDING'); // still waiting for the new attempt
      await webhook({ providerRef: fresh.providerRef, status: 'VERIFIED' }).expect(200);
      expect((await status(c)).status).toBe('VERIFIED');
    });

    it('a check that has waited less than the restart time is not started again', async () => {
      const c = await customer('PENDING');
      await start(c).expect(200);
      await t.prisma.$executeRaw`UPDATE "KycRecord" SET "updatedAt" = now() - interval '5 minutes' WHERE "userId" = ${c.id}::uuid`;
      await start(c).expect(200);
      expect((await record(c.id)).attempts).toBe(1);
    });
  });

  describe('the webhook door', () => {
    it('refuses a missing, wrong or tampered signature, and changes nothing', async () => {
      const c = await customer('PENDING');
      await start(c).expect(200);
      const ref = (await record(c.id)).providerRef;
      const payload = { providerRef: ref, status: 'VERIFIED' };

      expect((await webhook(payload, { signature: null }).expect(401)).body.code).toBe('INVALID_SIGNATURE');
      await webhook(payload, { secret: 'a-different-secret-of-length' }).expect(401);
      await webhook(payload, { signature: 'not-a-signature' }).expect(401);
      // Signed for one body, delivered with another.
      const signedForRejected = signHmacSha256Hex(JSON.stringify({ providerRef: ref, status: 'REJECTED' }), secret);
      await webhook(payload, { signature: signedForRejected }).expect(401);
      // The signature is over the exact bytes: extra whitespace breaks it.
      const raw = JSON.stringify(payload);
      await webhook(payload, { raw: `${raw} `, signature: signHmacSha256Hex(raw, secret) }).expect(401);

      expect((await status(c)).status).toBe('PENDING');
      expect((await audit(c.id)).map((a) => a.action)).toEqual(['KYC_STARTED']);
    });

    it('refuses a signed message it cannot read', async () => {
      const bad = async (raw: string) => (await webhook(null, { raw }).expect(400)).body.code;
      // Text that is not JSON never gets past the body parser (a plain 400); readable JSON that is wrong is ours.
      expect(['BAD_REQUEST', 'INVALID_WEBHOOK']).toContain(await bad('not json'));
      expect(['BAD_REQUEST', 'INVALID_WEBHOOK']).toContain(await bad('null'));
      expect(await bad(JSON.stringify({ status: 'VERIFIED' }))).toBe('INVALID_WEBHOOK');
      expect(await bad(JSON.stringify({ providerRef: 'x', status: 'MAYBE' }))).toBe('INVALID_WEBHOOK');
      expect(await bad(JSON.stringify({ providerRef: 'x'.repeat(500), status: 'VERIFIED' }))).toBe('INVALID_WEBHOOK');
    });

    it('accepts and ignores a signed message about an unknown reference, or one that is not a final answer', async () => {
      await webhook({ providerRef: 'mock_kyc_nobody', status: 'VERIFIED' }).expect(200, { received: true });
      const c = await customer('PENDING');
      await start(c).expect(200);
      await webhook({ providerRef: (await record(c.id)).providerRef, status: 'PENDING' }).expect(200);
      expect((await status(c)).status).toBe('PENDING');
    });

    it('needs no login (the signature is the proof), and accepts nothing but POST', async () => {
      await t.http().get(api('/webhooks/kyc')).expect(404);
      await t.http().put(api('/webhooks/kyc')).expect(404);
    });
  });

  describe('a rejected customer', () => {
    it('can try a few times, then has to contact support, and an admin can reset it', async () => {
      const c = await customer('REJECT');
      for (const left of [2, 1, 0]) {
        const res = await start(c).expect(200);
        expect(res.body).toMatchObject({ status: 'REJECTED', attemptsLeft: left });
        expect(res.body.rejectionReason).toBeTruthy();
      }
      const refused = await start(c).expect(409);
      expect(refused.body.code).toBe('KYC_ATTEMPTS_EXCEEDED');
      expect(refused.body.message).toContain('contact support');
      expect((await record(c.id)).attempts).toBe(3);

      // Only a super admin can reset it.
      const admin = await t.asRole('SUPER_ADMIN');
      const manager = await t.asRole('CITY_MANAGER', { cityIds: [] });
      const employee = await t.asRole('STATION_EMPLOYEE', { stationIds: [] });
      for (const who of [c, manager, employee]) await t.http().post(api(`/kyc/${c.id}/reset`)).set(who.auth).expect(403);
      await t.http().post(api(`/kyc/${c.id}/reset`)).expect(401);
      const reset = await t.http().post(api(`/kyc/${c.id}/reset`)).set(admin.auth).expect(200);
      expect(reset.body).toMatchObject({ status: 'REJECTED', attemptsLeft: 3 });

      await t.prisma.user.update({ where: { id: c.id }, data: { fullName: 'e2e-Ordinary Rider' } });
      expect((await start(c).expect(200)).body.status).toBe('VERIFIED');
      // The reset is in the trail with who did it.
      const entry = (await audit(c.id)).find((a) => a.action === 'KYC_RESET');
      expect(entry).toMatchObject({ actorId: admin.id, actorRole: 'SUPER_ADMIN', route: 'POST /kyc/:id/reset' });
    });

    it('a pending check that never answered can be reset too, but a verified customer cannot', async () => {
      const admin = await t.asRole('SUPER_ADMIN');
      const pending = await customer('PENDING');
      await start(pending).expect(200);
      const reset = await t.http().post(api(`/kyc/${pending.id}/reset`)).set(admin.auth).expect(200);
      expect(reset.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'The check was reset by support.', attemptsLeft: 3 });

      const verified = await customer();
      await start(verified).expect(200);
      expect((await t.http().post(api(`/kyc/${verified.id}/reset`)).set(admin.auth).expect(409)).body.code).toBe('KYC_ALREADY_VERIFIED');
      const none = await customer();
      expect((await t.http().post(api(`/kyc/${none.id}/reset`)).set(admin.auth).expect(404)).body.code).toBe('KYC_NOT_FOUND');
      await t.http().post(api('/kyc/not-a-uuid/reset')).set(admin.auth).expect(400);
    });
  });

  it('never stores an identity number: the record holds only the outcome', async () => {
    const c = await customer();
    await start(c).expect(200);
    const row = await record(c.id);
    expect(Object.keys(row).sort()).toEqual(
      ['attempts', 'consentAt', 'createdAt', 'id', 'provider', 'providerRef', 'rejectionReason', 'status', 'updatedAt', 'userId', 'verifiedAt'].sort(),
    );
  });
});
