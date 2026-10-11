import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { JobsService } from './jobs.service.js';

const INTERVAL_MS = 60_000;
const FIRST_RUN_DELAY_MS = 10_000;
/** The lock outlives one run, so a second server instance skips the tick the first one is handling. */
const LOCK_SECONDS = 50;
const LOCK_KEY = 'jobs:tick';

/** Calls JobsService every minute. A Redis lock keeps several backend instances from doing the same work. */
@Injectable()
export class JobsRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobsRunner.name);
  private readonly instanceId = randomUUID();
  private first?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.get('JOBS_ENABLED', { infer: true })) {
      this.logger.log('Background jobs are off (JOBS_ENABLED=false)');
      return;
    }
    this.first = setTimeout(() => void this.tick(), FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
    // Timers must not keep the process alive on shutdown.
    this.first.unref();
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  /** One locked run. Exposed so it can be called directly. Returns false when another instance holds the lock. */
  async tick(now = new Date()): Promise<boolean> {
    try {
      const got = await this.redis.client.set(LOCK_KEY, this.instanceId, 'EX', LOCK_SECONDS, 'NX');
      if (got !== 'OK') return false;
      const counts = await this.jobs.runOnce(now);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (total > 0) this.logger.log(`Job run: ${JSON.stringify(counts)}`);
      return true;
    } catch (e) {
      this.logger.error(`Job run failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }
}
