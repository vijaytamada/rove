import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { Role, VehicleStatus } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisService } from '../src/infra/redis/redis.service.js';
import { MOCK_OTP_CODE } from '../src/providers/otp/mock-otp.provider.js';
import { PasswordService } from '../src/modules/users/password.service.js';

export const TEST_PASSWORD = 'Test-Pass-12345';
export const OTP_CODE = MOCK_OTP_CODE;
// Everything the tests create carries this prefix so cleanup never touches seed/demo data.
const PREFIX = 'e2e-';
// Test phone numbers share this prefix so their Redis keys can be cleaned up.
const PHONE_PREFIX = '+1555';

export type Auth = { Authorization: string };
export type Tokens = { accessToken: string; refreshToken: string };
export interface TestUser {
  id: string;
  role: Role;
  email: string | null;
  phone: string | null;
}

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  redis: RedisService;
  http: () => ReturnType<typeof request>;
  email: (label?: string) => string;
  phone: () => string;
  /** Customers get a (verified) phone and no email/password; staff get an email + password. */
  createUser: (
    role: Role,
    opts?: { phone?: string; verified?: boolean; cityIds?: string[]; stationIds?: string[] },
  ) => Promise<TestUser>;
  /** Staff: password sign-in. Customers: phone + one-time code. A string means staff email + test password. */
  login: (who: string | Pick<TestUser, 'role' | 'email' | 'phone'>, password?: string) => Promise<Tokens>;
  /** Creates a user of `role` (with optional scope) and returns an Authorization header for them. */
  asRole: (
    role: Role,
    scope?: { cityIds?: string[]; stationIds?: string[] },
  ) => Promise<TestUser & { auth: Auth }>;
  makeCity: (opts?: { isActive?: boolean }) => Promise<{ id: string; name: string }>;
  makeStation: (
    cityId: string,
    opts?: { status?: 'ACTIVE' | 'INACTIVE'; capacity?: number },
  ) => Promise<{ id: string; name: string; cityId: string }>;
  makeModel: () => Promise<{ id: string }>;
  /** A pricing plan for a model (default plan unless a city is given). Rs 50/hour, Rs 300/day, Rs 1000 deposit. */
  makePlan: (modelId: string, opts?: { cityId?: string; hourly?: number; daily?: number | null; deposit?: number }) => Promise<{ id: string }>;
  /** Marks a customer's identity check as passed so they can book. */
  verifyKyc: (userId: string) => Promise<void>;
  /** A signed-in customer with a verified identity. */
  verifiedCustomer: () => Promise<TestUser & { auth: Auth }>;
  /** A ready-to-book setup: open city and station, a model with a plan and `vehicles` scooters. */
  makeBookable: (opts?: { vehicles?: number; hours?: { opensAt: string; closesAt: string } }) => Promise<{
    cityId: string;
    stationId: string;
    modelId: string;
    vehicleIds: string[];
  }>;
  makeVehicle: (
    stationId: string,
    modelId: string,
    opts?: { status?: VehicleStatus; battery?: number },
  ) => Promise<{ id: string; code: string }>;
  cleanup: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  const redis = app.get(RedisService);
  const passwords = app.get(PasswordService);
  const http = () => request(app.getHttpServer());
  const short = () => randomUUID().slice(0, 8);
  const phone = () => `${PHONE_PREFIX}${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

  const login: TestApp['login'] = async (who, password = TEST_PASSWORD) => {
    if (typeof who === 'string' || who.role !== 'CUSTOMER') {
      const email = typeof who === 'string' ? who : who.email;
      const res = await http().post('/api/v1/auth/login').send({ email, password }).expect(200);
      return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
    }
    await http().post('/api/v1/auth/phone/request').send({ phone: who.phone }).expect(200);
    const res = await http().post('/api/v1/auth/phone/verify').send({ phone: who.phone, code: OTP_CODE }).expect(200);
    return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
  };

  const createUser: TestApp['createUser'] = async (role, opts) => {
    const isCustomer = role === 'CUSTOMER';
    const email = isCustomer ? null : `${PREFIX}${role.toLowerCase()}-${short()}@rove.test`;
    const userPhone = opts?.phone ?? (isCustomer ? phone() : null);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: isCustomer ? null : await passwords.hash(TEST_PASSWORD),
        // Customers need a name too; the e2e- prefix lets cleanup find them.
        fullName: `${PREFIX}Test ${role}`,
        role,
        phone: userPhone,
        phoneVerifiedAt: isCustomer && opts?.verified !== false ? new Date() : null,
        assignments: {
          create: [
            ...(opts?.cityIds ?? []).map((cityId) => ({ cityId })),
            ...(opts?.stationIds ?? []).map((stationId) => ({ stationId })),
          ],
        },
      },
    });
    return { id: user.id, role, email, phone: userPhone };
  };

  const self: TestApp = {
    app,
    prisma,
    redis,
    http,
    email: (label = 'user') => `${PREFIX}${label}-${short()}@rove.test`,
    phone,
    createUser,
    login,
    async asRole(role, scope) {
      const u = await createUser(role, scope);
      return { ...u, auth: { Authorization: `Bearer ${(await login(u)).accessToken}` } };
    },
    async makeCity(opts) {
      const name = `${PREFIX}city-${short()}`;
      const city = await prisma.city.create({ data: { name, state: 'Test State', isActive: opts?.isActive ?? true } });
      return { id: city.id, name };
    },
    async makeStation(cityId, opts) {
      const name = `${PREFIX}station-${short()}`;
      const station = await prisma.station.create({
        data: {
          cityId,
          name,
          address: '1 Test Road',
          latitude: 12.97,
          longitude: 77.59,
          capacity: opts?.capacity ?? 10,
          status: opts?.status ?? 'ACTIVE',
        },
      });
      return { id: station.id, name, cityId };
    },
    async makeModel() {
      const model = await prisma.vehicleModel.create({
        data: { brand: `${PREFIX}brand`, name: `m-${short()}`, rangeKm: 80, topSpeedKmh: 45 },
      });
      return { id: model.id };
    },
    async makePlan(modelId, opts) {
      const plan = await prisma.pricingPlan.create({
        data: {
          modelId,
          cityId: opts?.cityId ?? null,
          hourlyRateAmount: opts?.hourly ?? 5000,
          dailyRateAmount: opts?.daily === undefined ? 30000 : opts.daily,
          includedKmPerHour: 12,
          extraKmRateAmount: 600,
          lateFeePerHourAmount: 9900,
          depositAmount: opts?.deposit ?? 100000,
        },
      });
      return { id: plan.id };
    },
    async verifyKyc(userId) {
      await prisma.kycRecord.create({
        data: { userId, provider: 'mock', status: 'VERIFIED', consentAt: new Date(), verifiedAt: new Date() },
      });
    },
    async verifiedCustomer() {
      const customer = await self.asRole('CUSTOMER');
      await self.verifyKyc(customer.id);
      return customer;
    },
    async makeBookable(opts) {
      const city = await self.makeCity();
      const station = await self.makeStation(city.id);
      if (opts?.hours) await prisma.station.update({ where: { id: station.id }, data: opts.hours });
      const model = await self.makeModel();
      await self.makePlan(model.id);
      const vehicleIds: string[] = [];
      for (let i = 0; i < (opts?.vehicles ?? 1); i++) vehicleIds.push((await self.makeVehicle(station.id, model.id)).id);
      return { cityId: city.id, stationId: station.id, modelId: model.id, vehicleIds };
    },
    async makeVehicle(stationId, modelId, opts) {
      const code = `E2E-${short().toUpperCase()}`;
      const vehicle = await prisma.vehicle.create({
        data: { stationId, modelId, code, status: opts?.status ?? 'AVAILABLE', batteryPercent: opts?.battery ?? 80 },
      });
      return { id: vehicle.id, code };
    },
    async cleanup() {
      const users = await prisma.user.findMany({
        where: { OR: [{ email: { startsWith: PREFIX } }, { fullName: { startsWith: PREFIX } }] },
        select: { id: true },
      });
      const keys = [
        ...(await redis.client.keys(`otp:*${PHONE_PREFIX}*`)),
        ...(await redis.client.keys(`login:fail:${PREFIX}*`)),
        ...users.flatMap((u) => [`otp:verify:${u.id}`, `otp:cooldown:verify:${u.id}`]),
      ];
      if (keys.length) await redis.client.del(...keys);
      // Order matters: refunds -> payments -> bookings -> users; plans and vehicles reference models and cities.
      const ofTestUsers = { user: { id: { in: users.map((u) => u.id) } } };
      await prisma.refund.deleteMany({ where: { payment: { booking: ofTestUsers } } });
      await prisma.payment.deleteMany({ where: { booking: ofTestUsers } });
      await prisma.booking.deleteMany({ where: ofTestUsers });
      await prisma.pricingPlan.deleteMany({
        where: { OR: [{ model: { brand: { startsWith: PREFIX } } }, { city: { name: { startsWith: PREFIX } } }] },
      });
      await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
      await prisma.vehicle.deleteMany({ where: { code: { startsWith: 'E2E-' } } });
      await prisma.station.deleteMany({ where: { name: { startsWith: PREFIX } } });
      await prisma.city.deleteMany({ where: { name: { startsWith: PREFIX } } });
      await prisma.vehicleModel.deleteMany({ where: { brand: { startsWith: PREFIX } } });
      await app.close();
    },
  };
  return self;
}
