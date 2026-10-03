import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import { RedisService } from '../../infra/redis/redis.service.js';

export const MAX_LOGIN_FAILURES = 10;
export const LOGIN_WINDOW_SECONDS = 15 * 60;

/**
 * Brute-force protection: after MAX_LOGIN_FAILURES failed sign-ins for an email within the window,
 * further attempts are refused (even with the right password) until the window expires.
 * Counted per email, whether or not the account exists, so responses don't reveal which emails are
 * registered. A successful sign-in resets the counter. (A per-IP limit belongs with the reverse
 * proxy setup in Phase 12, because the website calls this API from its own server.)
 */
@Injectable()
export class LoginThrottleService {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async assertAllowed(email: string): Promise<void> {
    const failures = Number((await this.redis.client.get(this.key(email))) ?? 0);
    if (failures >= MAX_LOGIN_FAILURES) {
      const ttl = await this.redis.client.ttl(this.key(email));
      const minutes = Math.max(1, Math.ceil((ttl > 0 ? ttl : LOGIN_WINDOW_SECONDS) / 60));
      throw new AppException(
        429,
        'TOO_MANY_ATTEMPTS',
        `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      );
    }
  }

  async recordFailure(email: string): Promise<void> {
    const key = this.key(email);
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, LOGIN_WINDOW_SECONDS);
  }

  async reset(email: string): Promise<void> {
    await this.redis.client.del(this.key(email));
  }

  private key(email: string) {
    return `login:fail:${email.trim().toLowerCase()}`;
  }
}
