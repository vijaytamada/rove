import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),

    JWT_ACCESS_SECRET: z.string().min(16, 'must be at least 16 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    OTP_PROVIDER: z.enum(['mock']).default('mock'),
    KYC_PROVIDER: z.enum(['mock']).default('mock'),
    PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
    /** Total OTP sends per day across all phones (guards against SMS pumping and runaway cost). */
    OTP_DAILY_SEND_CAP: z.coerce.number().int().positive().default(5000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.JWT_ACCESS_SECRET.startsWith('dev-only')) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'a dev-only secret must not be used in production',
      });
    }
    for (const key of ['OTP_PROVIDER', 'KYC_PROVIDER', 'PAYMENT_PROVIDER'] as const) {
      if (env[key] === 'mock') {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `the mock ${key.replace('_PROVIDER', '')} provider must not be used in production`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}
