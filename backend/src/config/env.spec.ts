import { validateEnv } from './env.js';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://x',
    REDIS_URL: 'redis://x',
    JWT_ACCESS_SECRET: 'dev-only-0123456789abcdef',
  };

  it('applies defaults', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.OTP_PROVIDER).toBe('mock');
  });

  it('coerces PORT to a number', () => {
    expect(validateEnv({ ...base, PORT: '4000' }).PORT).toBe(4000);
  });

  it('throws a readable error when required vars are missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('refuses dev-only secrets and the mock OTP provider in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/dev-only secret/);
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', JWT_ACCESS_SECRET: 'a-real-long-random-secret' }),
    ).toThrow(/mock OTP/);
  });
});
