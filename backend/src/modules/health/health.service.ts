import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';

export type CheckStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: { database: CheckStatus; redis: CheckStatus };
  uptimeSeconds: number;
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([
      this.run(() => this.prisma.$queryRaw`SELECT 1`),
      this.run(() => this.redis.ping()),
    ]);
    return {
      status: database === 'up' && redis === 'up' ? 'ok' : 'degraded',
      checks: { database, redis },
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  private async run(fn: () => Promise<unknown>): Promise<CheckStatus> {
    try {
      await fn();
      return 'up';
    } catch {
      return 'down';
    }
  }
}
