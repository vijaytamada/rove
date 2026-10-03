import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { Role, VehicleStatus } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisService } from '../src/infra/redis/redis.service.js';
import { PasswordService } from '../src/modules/users/password.service.js';

export const TEST_PASSWORD = 'Test-Pass-12345';
// Everything the tests create carries this prefix so cleanup never touches seed/demo data.
const PREFIX = 'e2e-';

export type Auth = { Authorization: string };

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  email: (label?: string) => string;
  phone: () => string;
  createUser: (
    role: Role,
    opts?: { phone?: string; cityIds?: string[]; stationIds?: string[] },
  ) => Promise<{ id: string; email: string }>;
  login: (email: string, password?: string) => Promise<{ accessToken: string; refreshToken: string }>;
  /** Creates a user of `role` (with optional scope) and returns an Authorization header for them. */
  asRole: (
    role: Role,
    scope?: { cityIds?: string[]; stationIds?: string[] },
  ) => Promise<{ id: string; email: string; auth: Auth }>;
  makeCity: (opts?: { isActive?: boolean }) => Promise<{ id: string; name: string }>;
  makeStation: (
    cityId: string,
    opts?: { status?: 'ACTIVE' | 'INACTIVE'; capacity?: number },
  ) => Promise<{ id: string; name: string; cityId: string }>;
  makeModel: () => Promise<{ id: string }>;
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

  const login: TestApp['login'] = async (email, password = TEST_PASSWORD) => {
    const res = await http().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
  };

  const createUser: TestApp['createUser'] = async (role, opts) => {
    const email = `${PREFIX}${role.toLowerCase()}-${short()}@rove.test`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await passwords.hash(TEST_PASSWORD),
        fullName: `Test ${role}`,
        role,
        phone: opts?.phone ?? null,
        assignments: {
          create: [
            ...(opts?.cityIds ?? []).map((cityId) => ({ cityId })),
            ...(opts?.stationIds ?? []).map((stationId) => ({ stationId })),
          ],
        },
      },
    });
    return { id: user.id, email };
  };

  return {
    app,
    prisma,
    http,
    email: (label = 'user') => `${PREFIX}${label}-${short()}@rove.test`,
    // Unique, valid E.164 test number.
    phone: () => `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
    createUser,
    login,
    async asRole(role, scope) {
      const u = await createUser(role, scope);
      return { ...u, auth: { Authorization: `Bearer ${(await login(u.email)).accessToken}` } };
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
    async makeVehicle(stationId, modelId, opts) {
      const code = `E2E-${short().toUpperCase()}`;
      const vehicle = await prisma.vehicle.create({
        data: { stationId, modelId, code, status: opts?.status ?? 'AVAILABLE', batteryPercent: opts?.battery ?? 80 },
      });
      return { id: vehicle.id, code };
    },
    async cleanup() {
      const users = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
      for (const u of users) await redis.client.del(`otp:phone:${u.id}`, `otp:cooldown:${u.id}`);
      const throttled = await redis.client.keys(`login:fail:${PREFIX}*`);
      if (throttled.length) await redis.client.del(...throttled);
      // Order matters: assignments (via users) and vehicles reference stations; stations reference cities.
      await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
      await prisma.vehicle.deleteMany({ where: { code: { startsWith: 'E2E-' } } });
      await prisma.station.deleteMany({ where: { name: { startsWith: PREFIX } } });
      await prisma.city.deleteMany({ where: { name: { startsWith: PREFIX } } });
      await prisma.vehicleModel.deleteMany({ where: { brand: { startsWith: PREFIX } } });
      await app.close();
    },
  };
}
