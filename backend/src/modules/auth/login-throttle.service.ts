import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import { RedisService } from '../../infra/redis/redis.service.js';

export const MAX_LOGIN_FAILURES = 10;
export const LOGIN_WINDOW_SECONDS = 15 * 60;
/** Failed sign-ins from one IP address (any emails) allowed per window. Higher than the per-email limit: people share networks. */
export const MAX_LOGIN_FAILURES_PER_IP = 50;

/**
 * Brute-force protection: after MAX_LOGIN_FAILURES failed sign-ins for an email within the window,
 * further attempts are refused (even with the right password) until the window expires.
 * Counted per email, whether or not the account exists, so responses don't reveal which emails are
 * registered. A successful sign-in resets the counter. (A per-IP limit belongs with the reverse
 * proxy setup, because the website calls this API from its own server.) Since Phase 12 there is also a limit per IP
 * address (50 failures per window across all emails), which stops one machine trying many accounts; it needs the website to forward
 * the visitor's address and the API to trust that proxy (TRUST_PROXY, see docs/DEV_SETUP.md). A successful sign-in does not reset it.
 */
@Injectable()
export class LoginThrottleService {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async assertAllowed(email: string, ip?: string): Promise<void> {
    if (ip) {
      const fromIp = Number((await this.redis.client.get(this.ipKey(ip))) ?? 0);
      if (fromIp >= MAX_LOGIN_FAILURES_PER_IP) {
        const ttl = await this.redis.client.ttl(this.ipKey(ip));
        const minutes = Math.max(1, Math.ceil((ttl > 0 ? ttl : LOGIN_WINDOW_SECONDS) / 60));
        throw new AppException(429, 'TOO_MANY_ATTEMPTS', `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
      }
    }
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

  async recordFailure(email: string, ip?: string): Promise<void> {
    const key = this.key(email);
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, LOGIN_WINDOW_SECONDS);
    if (ip) {
      const ipCount = await this.redis.client.incr(this.ipKey(ip));
      if (ipCount === 1) await this.redis.client.expire(this.ipKey(ip), LOGIN_WINDOW_SECONDS);
    }
  }

  async reset(email: string): Promise<void> {
    await this.redis.client.del(this.key(email));
  }

  private ipKey(ip: string) {
    return `login:ip:${ip}`;
  }

  private key(email: string) {
    return `login:fail:${email.trim().toLowerCase()}`;
  }
}
