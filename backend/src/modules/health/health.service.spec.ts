import { HealthService } from './health.service.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { RedisService } from '../../infra/redis/redis.service.js';

function build(dbOk: boolean, redisOk: boolean) {
  const prisma = {
    $queryRaw: dbOk ? async () => [{ '?column?': 1 }] : async () => Promise.reject(new Error('db down')),
  } as unknown as PrismaService;
  const redis = {
    ping: redisOk ? async () => 'PONG' : async () => Promise.reject(new Error('redis down')),
  } as unknown as RedisService;
  return new HealthService(prisma, redis);
}

describe('HealthService', () => {
  it('reports ok when database and redis are up', async () => {
    const report = await build(true, true).check();
    expect(report.status).toBe('ok');
    expect(report.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('reports degraded when the database is down', async () => {
    const report = await build(false, true).check();
    expect(report.status).toBe('degraded');
    expect(report.checks).toEqual({ database: 'down', redis: 'up' });
  });

  it('reports degraded when redis is down', async () => {
    const report = await build(true, false).check();
    expect(report.status).toBe('degraded');
    expect(report.checks).toEqual({ database: 'up', redis: 'down' });
  });
});
