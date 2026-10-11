import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import type { RedisService } from '../redis/redis.service.js';
import { RateLimitService } from './rate-limit.service.js';

/** A tiny in-memory stand-in for the three Redis calls the limiter uses. */
function fakeRedis(opts: { failWith?: Error } = {}) {
  const counts = new Map<string, number>();
  const ttls = new Map<string, number>();
  const calls: string[] = [];
  const client = {
    incr: async (k: string) => {
      calls.push(`incr ${k}`);
      if (opts.failWith) throw opts.failWith;
      counts.set(k, (counts.get(k) ?? 0) + 1);
      return counts.get(k)!;
    },
    ttl: async (k: string) => ttls.get(k) ?? -1,
    expire: async (k: string, s: number) => {
      calls.push(`expire ${k} ${s}`);
      ttls.set(k, s);
      return 1;
    },
  };
  return { redis: { client } as unknown as RedisService, counts, ttls, calls };
}
const config = (enabled: boolean) => ({ get: () => enabled }) as unknown as ConfigService<Env, true>;

describe('RateLimitService', () => {
  it('allows up to the limit, then refuses, and counts down what is left', async () => {
    const { redis } = fakeRedis();
    const limiter = new RateLimitService(redis, config(true));
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.hit('quote', '1.2.3.4', 3, 60));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3].retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(results[3].retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('counts each name and each subject separately', async () => {
    const { redis } = fakeRedis();
    const limiter = new RateLimitService(redis, config(true));
    await limiter.hit('quote', 'a', 1, 60);
    expect((await limiter.hit('quote', 'a', 1, 60)).allowed).toBe(false);
    expect((await limiter.hit('quote', 'b', 1, 60)).allowed).toBe(true);
    expect((await limiter.hit('browse', 'a', 1, 60)).allowed).toBe(true);
  });

  it('starts the window on the first call, and gives a key with no expiry one so it can never block forever', async () => {
    const { redis, ttls, counts } = fakeRedis();
    const limiter = new RateLimitService(redis, config(true));
    await limiter.hit('x', 'ip', 5, 90);
    expect(ttls.get('rl:x:ip')).toBe(90);
    // A key that lost its expiry (a crash between the two calls).
    counts.set('rl:y:ip', 7);
    await limiter.hit('y', 'ip', 5, 30);
    expect(ttls.get('rl:y:ip')).toBe(30);
  });

  it('does nothing when switched off', async () => {
    const { redis, calls } = fakeRedis();
    const result = await new RateLimitService(redis, config(false)).hit('x', 'ip', 1, 60);
    expect(result.allowed).toBe(true);
    expect(calls).toEqual([]);
  });

  it('lets the call through when Redis is down, instead of locking everyone out', async () => {
    const { redis } = fakeRedis({ failWith: new Error('connection refused') });
    const result = await new RateLimitService(redis, config(true)).hit('x', 'ip', 1, 60);
    expect(result.allowed).toBe(true);
  });
});
