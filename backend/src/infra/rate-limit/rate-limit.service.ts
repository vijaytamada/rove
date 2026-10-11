import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { RedisService } from '../redis/redis.service.js';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  /** Calls left in this window after this one. */
  remaining: number;
  /** Seconds until the window resets. */
  retryAfterSeconds: number;
}

/**
 * Fixed-window counters in Redis: "at most `limit` calls per `windowSeconds` for this subject" (usually a client IP).
 * If Redis cannot be reached the call is allowed and a warning is logged: a cache outage must not lock everyone out
 * (the login and one-time-code limits that guard secrets keep their own, stricter, per-account checks).
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly enabled: boolean;

  constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.enabled = config.get('RATE_LIMIT_ENABLED', { infer: true });
  }

  async hit(name: string, subject: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    if (!this.enabled) return { allowed: true, limit, remaining: limit, retryAfterSeconds: 0 };
    const key = `rl:${name}:${subject}`;
    try {
      const count = await this.redis.client.incr(key);
      let ttl = count === 1 ? -1 : await this.redis.client.ttl(key);
      // The first call sets the window; a key that somehow has no expiry gets one too, so it can never block forever.
      if (count === 1 || ttl < 0) {
        await this.redis.client.expire(key, windowSeconds);
        ttl = windowSeconds;
      }
      return { allowed: count <= limit, limit, remaining: Math.max(0, limit - count), retryAfterSeconds: Math.max(1, ttl) };
    } catch (e) {
      this.logger.warn(`Rate limit check failed for ${name}: ${e instanceof Error ? e.message : String(e)}`);
      return { allowed: true, limit, remaining: limit, retryAfterSeconds: 0 };
    }
  }
}
