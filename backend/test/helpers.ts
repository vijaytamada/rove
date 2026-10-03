import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisService } from '../src/infra/redis/redis.service.js';
import { PasswordService } from '../src/modules/users/password.service.js';
import type { Role } from '../src/generated/prisma/client.js';

export const TEST_PASSWORD = 'Test-Pass-12345';
const PREFIX = 'e2e-';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  email: (label?: string) => string;
  phone: () => string;
  createUser: (role: Role, opts?: { phone?: string }) => Promise<{ id: string; email: string }>;
  login: (email: string, password?: string) => Promise<{ accessToken: string; refreshToken: string }>;
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

  return {
    app,
    prisma,
    http,
    email: (label = 'user') => `${PREFIX}${label}-${randomUUID().slice(0, 8)}@rove.test`,
    // Unique, valid E.164 test number.
    phone: () => `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
    async createUser(role, opts) {
      const email = `${PREFIX}${role.toLowerCase()}-${randomUUID().slice(0, 8)}@rove.test`;
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: await passwords.hash(TEST_PASSWORD),
          fullName: `Test ${role}`,
          role,
          phone: opts?.phone ?? null,
        },
      });
      return { id: user.id, email };
    },
    async login(email, password = TEST_PASSWORD) {
      const res = await http().post('/api/v1/auth/login').send({ email, password }).expect(200);
      return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
    },
    async cleanup() {
      const users = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
      for (const u of users) await redis.client.del(`otp:phone:${u.id}`, `otp:cooldown:${u.id}`);
      await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
      await app.close();
    },
  };
}
