import { validateEnv } from './env.js';

describe('validateEnv', () => {
  const base = { DATABASE_URL: 'postgresql://x', REDIS_URL: 'redis://x' };

  it('applies defaults', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
  });

  it('coerces PORT to a number', () => {
    expect(validateEnv({ ...base, PORT: '4000' }).PORT).toBe(4000);
  });

  it('throws a readable error when required vars are missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });
});
